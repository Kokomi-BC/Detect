const { app, BrowserWindow, ipcMain, session } = require('electron');
const WindowManager = require('./windowManager');
const ExtractionManager = require('./extractionManager');
const { truncateText } = require('./utils');

/**
 * 主应用入口 - 使用模块化架构的Electron应用
 */
class ChatApp {
  constructor() {
    this.mainWindow = null;
    this.isAppReady = false;
    this.initialized = false;
    
    // 初始化各个管理器实例
    this.windowManager = new WindowManager();
    this.extractionManager = new ExtractionManager();
  }

  /**
   * 初始化应用
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      console.log('正在初始化Chat应用...');
      
      // 设置应用基本配置
      this.setupApp();
      
      // 设置IPC事件监听
      this.setupIPC();
      
      // 创建主窗口
      this.createMainWindow();
      
      this.initialized = true;
      console.log('Chat应用初始化完成');
      
    } catch (error) {
      console.error('应用初始化失败:', error);
      throw error;
    }
  }

  /**
   * 设置应用基本配置
   */
  setupApp() {
    // 禁用安全警告（开发环境）
    process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
    
    // 设置应用单例实例锁
    this.setupSingleInstance();
    
    // 设置应用事件监听
    this.setupAppEvents();
    
    // 设置用户代理
    this.setupUserAgent();
  }

  /**
   * 设置单例实例锁
   */
  setupSingleInstance() {
    const gotTheLock = app.requestSingleInstanceLock();
    
    if (!gotTheLock) {
      console.log('应用已经在运行中，退出此实例');
      app.quit();
    } else {
      app.on('second-instance', () => {
        if (this.mainWindow) {
          if (this.mainWindow.isMinimized()) this.mainWindow.restore();
          this.mainWindow.focus();
        }
      });
    }
  }

  /**
   * 设置应用事件监听
   */
  setupAppEvents() {
    // 所有窗口关闭时
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // 应用激活时
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    // 应用准备就绪
    app.whenReady().then(() => {
      this.isAppReady = true;
    });

    // 设置安全策略
    this.setupSecurity();
  }

  /**
   * 设置安全策略
   */
  setupSecurity() {
    app.on('web-contents-created', (event, contents) => {
      contents.on('new-window', (event, navigationUrl) => {
        event.preventDefault();
      });
      
      contents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (parsedUrl.origin !== 'file://') {
          event.preventDefault();
        }
      });
    });
  }

  /**
   * 设置用户代理
   */
  setupUserAgent() {
    const defaultUserAgent = app.userAgentFallback;
    const customUserAgent = `${defaultUserAgent} ChatApp/1.0`;
    app.userAgentFallback = customUserAgent;
  }

  /**
   * 设置IPC通信
   */
  setupIPC() {
    // 在 Electron 窗口中打开 URL
    ipcMain.on('open-url-in-window', (event, url) => {
      try {
        const { BrowserWindow } = require('electron');
        const newWindow = new BrowserWindow({
          width: 1200,
          height: 800,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: require('path').join(__dirname, 'preload.js')
          }
        });
        newWindow.loadURL(url);
      } catch (error) {
        console.error('打开URL失败:', error);
      }
    });

    // 取消提取事件
    ipcMain.on('cancel-extraction', () => {
      this.extractionManager.cancelExtraction();
    });

    // 清除浏览器数据事件
    ipcMain.handle('clear-browser-data', async (event) => {
      try {
        await this.handleClearBrowserData(event);
        return { success: true, message: '浏览器数据清理成功' };
      } catch (error) {
        console.error('清除浏览器数据失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 提取内容事件
    ipcMain.on('extract-content', async (event, url) => {
      await this.handleExtractContent(event, url);
    });
  }

  /**
   * 处理内容提取请求
   * @param {Object} event IPC事件对象
   * @param {string} url 要提取的URL
   */
  async handleExtractContent(event, url) {
    try {
      // 验证URL
      if (!url || typeof url !== 'string') {
        throw new Error('无效的URL');
      }

      // 限制内容长度
      if (url.length > 2000) {
        throw new Error('URL过长');
      }

      // 执行内容提取
      const result = await this.extractionManager.extractContent(event, url);
      
      // 发送结果到渲染进程
      event.sender.send('extract-content-result', result);
      
    } catch (error) {
      console.error('内容提取错误:', error);
      
      // 发送错误结果到渲染进程
      event.sender.send('extract-content-result', {
        success: false,
        error: error.message || '内容提取失败',
        url: url
      });
    }
  }

  /**
   * 处理清除浏览器数据请求
   * @param {Object} event IPC事件对象
   */
  async handleClearBrowserData(event) {
    try {
      // 清除缓存和存储数据（一次性操作）
      await Promise.all([
        session.defaultSession.clearCache(),
        session.defaultSession.clearStorageData({
          storages: ['cookies', 'localstorage', 'indexeddb', 'websql', 'cachestorage', 'serviceworkers']
        })
      ]);
      
      console.log('浏览器数据清理完成');
    } catch (error) {
      console.error('清除浏览器数据失败:', error.message || error);
      throw error;
    }
  }

  /**
   * 创建主窗口
   */
  createMainWindow() {
    this.mainWindow = this.windowManager.createMainWindow();
    
    // 窗口关闭时清理
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  /**
   * 获取主窗口
   * @returns {BrowserWindow|null}
   */
  getMainWindow() {
    return this.mainWindow;
  }

  /**
   * 检查应用是否就绪
   * @returns {boolean}
   */
  isReady() {
    return this.isAppReady && this.initialized;
  }
}

// 创建应用实例
const chatApp = new ChatApp();

// 导出应用类供外部使用
module.exports = ChatApp;