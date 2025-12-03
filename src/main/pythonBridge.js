const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');

/**
 * Python Bridge Service
 * Manages communication between Node.js and Python LLM service
 * Implements process pooling and async communication
 */
class PythonBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration
    this.pythonPath = options.pythonPath || 'python3';
    this.scriptPath = options.scriptPath || path.join(__dirname, '../../python/llm_service.py');
    this.maxRetries = options.maxRetries || 3;
    this.timeout = options.timeout || 120000; // 2 minutes default
    this.poolSize = options.poolSize || 2;
    
    // Process pool
    this.processPool = [];
    this.activeProcesses = new Set();
    this.requestQueue = [];
    
    // Initialize pool
    this.initializePool();
  }

  /**
   * Initialize process pool
   */
  initializePool() {
    for (let i = 0; i < this.poolSize; i++) {
      this.processPool.push(null);
    }
  }

  /**
   * Get an available process from the pool
   * @returns {Promise<number>} Index of available process slot
   */
  async getAvailableSlot() {
    return new Promise((resolve) => {
      const checkSlot = () => {
        for (let i = 0; i < this.poolSize; i++) {
          if (!this.activeProcesses.has(i)) {
            this.activeProcesses.add(i);
            resolve(i);
            return;
          }
        }
        // No slot available, queue the request
        this.requestQueue.push(checkSlot);
      };
      checkSlot();
    });
  }

  /**
   * Release a process slot back to the pool
   * @param {number} slotIndex Index of the slot to release
   */
  releaseSlot(slotIndex) {
    this.activeProcesses.delete(slotIndex);
    
    // Process next queued request if any
    if (this.requestQueue.length > 0) {
      const nextRequest = this.requestQueue.shift();
      nextRequest();
    }
  }

  /**
   * Call Python service with retry logic
   * @param {Object} params Parameters for the analysis
   * @param {string} params.text Text content
   * @param {string[]} params.imageUrls Image URLs or base64 data
   * @param {string} params.sourceUrl Source URL
   * @param {boolean} params.useWebSearch Enable web search
   * @param {boolean} params.stream Enable streaming
   * @returns {Promise<Object>} Analysis result
   */
  async call(params) {
    let lastError = null;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`重试 Python 服务调用 (尝试 ${attempt + 1}/${this.maxRetries})`);
          // Wait before retry with exponential backoff
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
        
        const result = await this._executeCall(params);
        return result;
        
      } catch (error) {
        lastError = error;
        console.error(`Python 服务调用失败 (尝试 ${attempt + 1}/${this.maxRetries}):`, error.message);
      }
    }
    
    throw lastError || new Error('Python 服务调用失败');
  }

  /**
   * Execute a single call to Python service
   * @private
   */
  async _executeCall(params) {
    const slotIndex = await this.getAvailableSlot();
    
    try {
      return await this._spawnProcess(params, slotIndex);
    } finally {
      this.releaseSlot(slotIndex);
    }
  }

  /**
   * Spawn Python process and communicate
   * @private
   */
  _spawnProcess(params, slotIndex) {
    return new Promise((resolve, reject) => {
      let pythonProcess = null;
      
      const timeoutId = setTimeout(() => {
        if (pythonProcess && !pythonProcess.killed) {
          pythonProcess.kill();
        }
        reject(new Error('Python 服务调用超时'));
      }, this.timeout);

      let outputData = '';
      let errorData = '';
      let eventBuffer = '';

      // Spawn Python process
      pythonProcess = spawn(this.pythonPath, [this.scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      // Handle stdout (results and events)
      pythonProcess.stdout.on('data', (data) => {
        const text = data.toString('utf-8');
        
        // Check for events in streaming mode
        if (params.stream) {
          eventBuffer += text;
          
          // Process events
          const events = eventBuffer.match(/__EVENT__(.*?)__END__/gs);
          if (events) {
            events.forEach(eventStr => {
              try {
                const jsonStr = eventStr.replace(/__EVENT__|__END__/g, '');
                const event = JSON.parse(jsonStr);
                this.emit('event', event);
              } catch (e) {
                console.error('解析事件失败:', e);
              }
            });
            
            // Remove processed events from buffer
            eventBuffer = eventBuffer.replace(/__EVENT__(.*?)__END__/gs, '');
          }
        }
        
        outputData += text;
      });

      // Handle stderr
      pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString('utf-8');
      });

      // Handle process exit
      pythonProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        
        if (code !== 0) {
          reject(new Error(`Python 进程退出异常 (代码 ${code}): ${errorData}`));
          return;
        }

        try {
          // Remove event markers from output if present
          const cleanOutput = outputData.replace(/__EVENT__(.*?)__END__/gs, '');
          
          // Try to parse the last JSON object in output
          const lines = cleanOutput.trim().split('\n');
          let result = null;
          
          // Find the last valid JSON line
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('{')) {
              try {
                result = JSON.parse(line);
                break;
              } catch (e) {
                // Try next line
                continue;
              }
            }
          }
          
          if (!result) {
            // If no valid JSON found, try to parse entire output
            result = JSON.parse(cleanOutput.trim());
          }
          
          resolve(result);
          
        } catch (error) {
          reject(new Error(`解析 Python 输出失败: ${error.message}\n输出: ${outputData}`));
        }
      });

      // Handle process error
      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`启动 Python 进程失败: ${error.message}`));
      });

      // Send input to Python process
      try {
        const input = JSON.stringify({
          text: params.text || '',
          imageUrls: params.imageUrls || [],
          sourceUrl: params.sourceUrl || '',
          useWebSearch: params.useWebSearch ?? true,
          stream: params.stream || false
        });
        
        pythonProcess.stdin.write(input, 'utf-8');
        pythonProcess.stdin.end();
        
      } catch (error) {
        clearTimeout(timeoutId);
        pythonProcess.kill();
        reject(new Error(`发送数据到 Python 进程失败: ${error.message}`));
      }
    });
  }

  /**
   * Sleep utility
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.processPool = [];
    this.activeProcesses.clear();
    this.requestQueue = [];
    this.removeAllListeners();
  }
}

module.exports = PythonBridge;
