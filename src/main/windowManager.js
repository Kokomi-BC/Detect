const { BrowserWindow, Menu } = require('electron');
const path = require('path');

/**
 * 窗口管理器 - 负责应用程序窗口的创建和管理
 */
class WindowManager {
  constructor() {
    this.mainWindow = null;
  }

  /**
   * 创建主窗口
   */
  createMainWindow() {
    console.log('创建主窗口...');
    
    // 隐藏应用程序菜单
    this.setupApplicationMenu();
    
    this.mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false
      }
    });

    // 在开发模式下加载webpack开发服务器
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.loadURL('http://localhost:8080')
        .catch((error) => {
          console.error('加载开发服务器失败:', error);
          // 如果开发服务器失败，加载本地HTML文件
          this.mainWindow.loadFile(path.join(__dirname, '../../public/index.html'))
            .catch((localError) => {
              console.error('加载本地HTML文件也失败:', localError);
              throw localError;
            });
        });
    } else {
      // 生产模式加载构建后的文件
      this.mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
        .catch((error) => {
          console.error('加载生产版本失败:', error);
          throw error;
        });
    }

    // 设置窗口事件监听
    this.setupMainWindowEvents();

    return this.mainWindow;
  }

  /**
   * 设置主窗口事件监听
   */
  setupMainWindowEvents() {
    if (!this.mainWindow) return;

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  /**
   * 创建隐藏的浏览器窗口用于内容提取
   * @param {Object} options 窗口选项
   */
  createExtractionWindow(options = {}) {
    const defaultOptions = {
      width: 1200,
      height: 800,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: false,
        allowRunningInsecureContent: true
      }
    };

    return new BrowserWindow({ ...defaultOptions, ...options });
  }

  /**
   * 创建微信文章专用的提取窗口
   */
  createWechatExtractionWindow() {
    return this.createExtractionWindow({
      userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.47.2560(Android 13;SM-G998B)'
    });
  }

  /**
   * 创建标准浏览器提取窗口
   */
  createStandardExtractionWindow() {
    return this.createExtractionWindow({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0'
    });
  }

  /**
   * 关闭并清理窗口
   * @param {BrowserWindow} window 要关闭的窗口
   */
  destroyWindow(window) {
    if (window && !window.isDestroyed()) {
      try {
        window.destroy();
      } catch (error) {
        console.error('关闭窗口时出错:', error);
      }
    }
  }

  /**
   * 获取主窗口实例
   */
  getMainWindow() {
    return this.mainWindow;
  }

  /**
   * 设置应用程序菜单
   */
  setupApplicationMenu() {
    Menu.setApplicationMenu(null);
  }
}

module.exports = WindowManager;