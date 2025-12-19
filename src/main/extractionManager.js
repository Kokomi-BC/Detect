const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const { WindowManager } = require('./windowManager');
const ImageExtractor = require('./imageExtractor');
const URLProcessor = require('./urlProcessor');
const { retry, truncateText } = require('./utils');

/**
 * 内容提取管理器 - 负责网页内容的提取和管理
 */
class ExtractionManager {
  constructor() {
    this.windowManager = new WindowManager();
    this.imageExtractor = new ImageExtractor();
    this.urlProcessor = new URLProcessor();
    
    // 提取状态
    this.currentExtractionWindow = null;
    this.currentExtractionEvent = null;
    this.isExtractionCancelled = false;
  }

  /**
   * 执行内容提取
   * @param {Object} event IPC事件对象
   * @param {string} url 要提取的URL
   * @returns {Promise<Object>}
   */
  async extractContent(event, url) {
    // 重置取消标志
    this.isExtractionCancelled = false;
    this.currentExtractionEvent = event;
    this.currentExtractionWindow = null;
    
    try {
      // 先检查URL是否指向图像文件
      if (await this.urlProcessor.isValidImageResource(url)) {
        return this.createImageResult(url);
      }

      // 检测是否为微信文章
      const isWechatArticle = this.urlProcessor.isWechatArticle(url);
      
      // 检查是否已取消
      if (this.isExtractionCancelled) {
        throw new Error('提取已取消');
      }
      
      // 创建隐藏的浏览器窗口用于加载动态内容
      this.currentExtractionWindow = await this.createExtractionWindow(url);
      
      // 页面加载重试机制
      const maxRetries = isWechatArticle ? 5 : 3;
      await this.loadPageWithRetry(url, maxRetries, isWechatArticle);

      // 获取完整HTML内容
      const htmlContent = await this.getHtmlContent();
      
      // 关闭窗口
      this.windowManager.destroyWindow(this.currentExtractionWindow);
      this.currentExtractionWindow = null;

      // 提取内容
      const result = await this.processExtractedContent(htmlContent, url, isWechatArticle);
      
      return result;
      
    } catch (error) {
      // 如果是取消操作，不记录错误，返回特定状态
      if (this.isExtractionCancelled || error.message === '提取已取消') {
        console.log('内容提取已取消');
        this.cleanupExtraction();
        return { success: false, error: '提取已取消' };
      }

      console.error('内容提取失败:', error);
      
      // 清理资源
      this.cleanupExtraction();
      
      throw error;
    }
  }

  /**
   * 取消当前提取
   */
  cancelExtraction() {
    this.isExtractionCancelled = true;
    
    // 关闭当前提取窗口
    if (this.currentExtractionWindow && !this.currentExtractionWindow.isDestroyed()) {
      try {
        this.windowManager.destroyWindow(this.currentExtractionWindow);
      } catch (e) {
        console.error('关闭窗口时出错:', e);
      }
    }
    
    // 通知渲染进程提取已取消
    if (this.currentExtractionEvent) {
      this.currentExtractionEvent.sender.send('extraction-cancelled');
    }
    
    // 重置状态
    this.resetExtractionState();
  }

  /**
   * 创建图像文件提取结果
   * @param {string} url 图像URL
   * @returns {Object}
   */
  createImageResult(url) {
    return {
      success: true,
      title: '图像文件',
      content: 'URL指向图像文件',
      images: [url],
      url: url
    };
  }

  /**
   * 创建提取窗口
   * @param {string} url 要加载的URL
   * @returns {Promise<BrowserWindow>}
   */
  async createExtractionWindow(url) {
    const win = this.urlProcessor.isWechatArticle(url)
      ? this.windowManager.createWechatExtractionWindow()
      : this.windowManager.createStandardExtractionWindow();
    
    this.currentExtractionWindow = win;
    return win;
  }

  /**
   * 带重试的页面加载
   * @param {string} url 要加载的URL
   * @param {number} maxRetries 最大重试次数
   * @param {boolean} isWechatArticle 是否为微信文章
   */
  async loadPageWithRetry(url, maxRetries, isWechatArticle) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // 检查是否已取消
      if (this.isExtractionCancelled) {
        throw new Error('提取已取消');
      }

      try {
        await this.loadPage(url, isWechatArticle);
        break; // 成功则跳出重试循环
        
      } catch (error) {
        // 检查是否已取消
        if (this.isExtractionCancelled) {
          throw new Error('提取已取消');
        }

        lastError = error;
        console.error(`第${attempt}次加载失败:`, error.message);
        
        if (attempt < maxRetries) {
          const waitTime = isWechatArticle ? 3000 : 2000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          // 等待期间再次检查取消状态
          if (this.isExtractionCancelled) {
            throw new Error('提取已取消');
          }

          // 重新创建窗口以清理状态
          this.recreateExtractionWindow(url);
        }
      }
    }

    // 如果所有重试都失败，抛出最后一个错误
    if (lastError) {
      throw new Error(`无法加载页面，经过${maxRetries}次重试后失败: ${lastError.message}`);
    }
  }

  /**
   * 加载页面
   * @param {string} url 要加载的URL
   * @param {boolean} isWechatArticle 是否为微信文章
   */
  async loadPage(url, isWechatArticle) {
    const win = this.currentExtractionWindow;
    
    await new Promise((resolve, reject) => {
      let loadTimeout;
      let globalTimeout;
      
      const cleanup = () => {
        try {
          if (loadTimeout) {
            clearTimeout(loadTimeout);
            loadTimeout = null;
          }
          if (globalTimeout) {
            clearTimeout(globalTimeout);
            globalTimeout = null;
          }

          // 有时 window 可能已经被销毁，访问 webContents 会抛出错误
          if (win && typeof win.isDestroyed === 'function' && !win.isDestroyed() && win.webContents) {
            win.webContents.removeListener('did-finish-load', onLoadSuccess);
            win.webContents.removeListener('did-fail-load', onLoadFail);
            win.webContents.removeListener('did-stop-loading', onStopLoading);
          }
        } catch (cleanupErr) {
          // 如果在清理时遇到窗口已被销毁的情况，记录并吞掉错误
          console.warn('cleanup() encountered error (window may be destroyed):', cleanupErr && cleanupErr.message);
        }
      };

      const onLoadSuccess = async () => {
        if (loadTimeout) {
          clearTimeout(loadTimeout);
          loadTimeout = null;
        }

        // 如果窗口在加载过程中被销毁，直接拒绝
        if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) {
          cleanup();
          return reject(new Error('Extraction window was destroyed during load'));
        }

        try {
          // 对于微信文章，需要等待更长时间确保内容完全加载
          if (isWechatArticle) {
            await this.imageExtractor.waitForWechatContent(win);
          }
          
          // 等待DOM完全加载并获取图片真实尺寸
          await this.imageExtractor.waitForImagesLoad(win, isWechatArticle);
        } catch (error) {
          console.error(`等待内容加载时出错:`, error.message);
        }
        
        cleanup();
        resolve();
      };

      const onLoadFail = (evt, errorCode, errorDescription, validatedURL) => {
        console.error(`页面加载失败: ${errorDescription} (代码: ${errorCode}, URL: ${validatedURL})`);
        cleanup();
        reject(new Error(`Failed to load URL: ${errorDescription} (${validatedURL})`));
      };

      const onStopLoading = () => {
        // 页面停止加载（spinner停止），这通常意味着主要内容已加载
        // 如果 did-finish-load 还没触发，我们给它一点时间，然后强制视为成功
        // 很多现代网页（如知乎）可能因为后台长连接或统计脚本导致 did-finish-load 迟迟不触发
        
        if (loadTimeout) {
          clearTimeout(loadTimeout);
        }

        // 等待2秒后如果没有其他事件，就认为加载完成了
        loadTimeout = setTimeout(() => {
          console.log(`页面停止加载，强制触发完成: ${url}`);
          onLoadSuccess(); 
        }, 2000);
      };

      try {
        if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) {
          return reject(new Error('Extraction window destroyed before loadURL'));
        }

        // 设置全局超时 (45秒)
        globalTimeout = setTimeout(() => {
          console.error(`页面加载全局超时: ${url}`);
          cleanup();
          reject(new Error(`Page load global timeout: ${url}`));
        }, 45000);

        win.webContents.once('did-finish-load', onLoadSuccess);
        win.webContents.once('did-fail-load', onLoadFail);
        win.webContents.once('did-stop-loading', onStopLoading);

        win.loadURL(url).catch((error) => {
          console.error(`加载URL异常: ${error.message}`);
          cleanup();
          reject(error);
        });
      } catch (attachErr) {
        console.warn('Error attaching listeners or loading URL:', attachErr && attachErr.message);
        cleanup();
        reject(attachErr);
      }
    });
  }

  /**
   * 重新创建提取窗口
   * @param {string} url 要加载的URL
   */
  recreateExtractionWindow(url) {
    if (this.currentExtractionWindow && !this.currentExtractionWindow.isDestroyed()) {
      try {
        this.windowManager.destroyWindow(this.currentExtractionWindow);
      } catch (e) {
        // 忽略销毁错误
      }
    }
    
    // 创建新的浏览器窗口
    this.createExtractionWindow(url);
  }

  /**
   * 获取HTML内容
   * @returns {Promise<string>}
   */
  async getHtmlContent() {
    const win = this.currentExtractionWindow;
    const maxJSReruns = 3;
    let jsRetryAttempts = 0;
    
    while (jsRetryAttempts < maxJSReruns) {
      try {
        const htmlContent = await win.webContents.executeJavaScript(`
          (function() {
            if (document.readyState !== 'complete') {
              throw new Error('Page not fully loaded');
            }
            
            const bodyText = document.body ? document.body.textContent.trim() : '';
            const images = document.querySelectorAll('img');
            const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
            const isWechatArticle = document.querySelector('#js_content, .rich_media_content, .article-content');
            const minTextLength = isWechatArticle ? 50 : 100;
            
            if (bodyText.length < minTextLength && images.length === 0 && headings.length === 0) {
              throw new Error('Page content too short');
            }
            
            return document.documentElement.outerHTML;
          })()
        `);
        
        if (htmlContent && htmlContent.length > 300) {
          return htmlContent;
        } else {
          jsRetryAttempts++;
          if (jsRetryAttempts < maxJSReruns) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
        
      } catch (error) {
        console.error(`获取HTML内容失败（第${jsRetryAttempts + 1}次）:`, error.message);
        jsRetryAttempts++;
        
        if (jsRetryAttempts >= maxJSReruns) {
          throw new Error(`无法获取HTML内容，经过${maxJSReruns}次重试后失败: ${error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error('无法获取HTML内容');
  }

  /**
   * 处理提取的内容
   * @param {string} htmlContent HTML内容
   * @param {string} url 原始URL
   * @param {boolean} isWechatArticle 是否为微信文章
   * @returns {Promise<Object>}
   */
  async processExtractedContent(htmlContent, url, isWechatArticle) {
    // 使用Readability提取文章内容
    const dom = new JSDOM(htmlContent, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    // 检查是否成功解析文章
    if (!article) {
      throw new Error('无法解析文章内容');
    }

    // 1. 从原始HTML中提取图片元数据（尺寸、加载状态等）
    const imageMetadata = this.imageExtractor.extractImageMetadata(htmlContent, url);

    // 2. 处理Readability提取的内容：过滤图片、清洗HTML、收集有效图片
    const { cleanedContent, images } = this.imageExtractor.processReadabilityContent(
      article.content, 
      imageMetadata, 
      url, 
      isWechatArticle
    );

    // 限制提取的内容长度
    const MAX_CONTENT_LENGTH = 20000;
    const textContent = article?.textContent ? 
      truncateText(article.textContent, MAX_CONTENT_LENGTH) : '';

    return {
      success: true,
      title: article?.title || '',
      content: cleanedContent || '',   // 返回清洗后的HTML内容（已过滤图片）
      textContent: textContent,        // 返回纯文本内容用于分析
      images: images,                  // 返回从正文中提取并过滤后的图片列表
      url: url
    };
  }

  /**
   * 清理提取资源
   */
  cleanupExtraction() {
    if (this.currentExtractionWindow && !this.currentExtractionWindow.isDestroyed()) {
      this.windowManager.destroyWindow(this.currentExtractionWindow);
    }
    this.currentExtractionWindow = null;
    this.currentExtractionEvent = null;
  }

  /**
   * 重置提取状态
   */
  resetExtractionState() {
    this.currentExtractionWindow = null;
    this.currentExtractionEvent = null;
    this.isExtractionCancelled = false;
  }

  /**
   * 获取当前提取状态
   * @returns {Object}
   */
  getExtractionState() {
    return {
      isExtractionCancelled: this.isExtractionCancelled,
      hasCurrentExtraction: this.currentExtractionWindow !== null
    };
  }
}

module.exports = ExtractionManager;
