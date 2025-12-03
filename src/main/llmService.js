const PythonBridge = require('./pythonBridge');

class LLMService {
  constructor() {
    // Initialize Python bridge with configuration
    this.pythonBridge = new PythonBridge({
      pythonPath: 'python3',
      timeout: 120000, // 2 minutes
      maxRetries: 3,
      poolSize: 2
    });
    
    // Keep legacy client for backward compatibility if needed
    this.usePythonBridge = true;
  }

  /**
   * 分析内容真伪
   * @param {string} text 文本内容
   * @param {string[]} imageUrls 图片URL数组
   * @param {string} sourceUrl 来源URL（可选）
   * @param {boolean} useWebSearch 是否使用网络搜索（默认true）
   * @param {boolean} stream 是否使用流式响应（默认false）
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeContent(text, imageUrls = [], sourceUrl = '', useWebSearch = true, stream = false) {
    if (!text && (!imageUrls || imageUrls.length === 0)) {
      throw new Error('没有提供文本或图片进行分析');
    }

    try {
      if (this.usePythonBridge) {
        // Use Python bridge for analysis with web search support
        const result = await this.pythonBridge.call({
          text: text || '',
          imageUrls: imageUrls || [],
          sourceUrl: sourceUrl || '',
          useWebSearch: useWebSearch,
          stream: stream
        });

        // Check if result is successful
        if (result.success === false) {
          throw new Error(result.error || 'Python 服务返回错误');
        }

        return result;
      } else {
        // Legacy path (kept for backward compatibility)
        throw new Error('Legacy OpenAI client mode is not implemented');
      }
    } catch (error) {
      console.error('LLM API调用失败:', error);
      throw error;
    }
  }

  /**
   * Subscribe to streaming events
   * @param {string} event Event name
   * @param {Function} callback Event callback
   */
  on(event, callback) {
    if (this.pythonBridge) {
      this.pythonBridge.on(event, callback);
    }
  }

  /**
   * Unsubscribe from streaming events
   * @param {string} event Event name
   * @param {Function} callback Event callback
   */
  off(event, callback) {
    if (this.pythonBridge) {
      this.pythonBridge.off(event, callback);
    }
  }

  parseResponse(content) {
    try {
      // 尝试清理可能存在的 Markdown 标记
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '');
      }
      
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('解析LLM响应失败:', e);
      // 尝试提取 JSON 部分
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (e2) {
          return { error: '解析响应失败', raw: content };
        }
      }
      return { error: '解析响应失败', raw: content };
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.pythonBridge) {
      this.pythonBridge.destroy();
    }
  }
}

module.exports = LLMService;
