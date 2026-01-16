const { app, BrowserWindow, Menu, MenuItem, clipboard, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * 窗口类型枚举
 */
const WindowType = {
  MAIN: 'main',
  BROWSER: 'browser',
  EXTRACTION: `extraction`
};

/**
 * 窗口管理器 - 负责应用程序窗口的创建和管理
 */
class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.browserWindows = new Set(); // 所有外部浏览器窗口
    this.extractionWindows = new Set(); // 提取窗口
  }

  /**
   * 获取窗口状态保存路径
   */
  getWindowStatePath() {
    return path.join(app.getPath('userData'), 'window-state.json');
  }

  /**
   * 加载窗口状态
   */
  loadWindowState() {
    try {
      const statePath = this.getWindowStatePath();
      if (fs.existsSync(statePath)) {
        return JSON.parse(fs.readFileSync(statePath, 'utf8'));
      }
    } catch (error) {
      console.error('加载窗口状态失败:', error);
    }
    return { width: 1000, height: 700 }; // 默认分辨率
  }

  /**
   * 保存窗口状态
   */
  saveWindowState() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    
    try {
      const bounds = this.mainWindow.getBounds();
      // 如果窗口被最小化，不保存状态
      if (this.mainWindow.isMinimized()) return;

      const state = {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized: this.mainWindow.isMaximized()
      };
      fs.writeFileSync(this.getWindowStatePath(), JSON.stringify(state));
    } catch (error) {
      console.error('保存窗口状态失败:', error);
    }
  }


  /**
   * 为窗口添加类型标记
   * @param {BrowserWindow} window 窗口实例
   * @param {WindowType} type 窗口类型
   */
  markWindowType(window, type) {
    if (!window || window.isDestroyed()) return;

    // 直接在 window 对象上设置属性
    window.__windowType = type;
    window.__isMainWindow = (type === WindowType.MAIN);
    
    // 异步设置 webContents 中的属性
    if (window.webContents && !window.isDestroyed()) {
      window.webContents.executeJavaScript(`
        window.__windowType = '${type}';
        window.__isMainWindow = ${type === WindowType.MAIN};
      `).catch(() => {});
    }
    
    // 添加到相关的集合
    switch (type) {
      case WindowType.BROWSER: this.browserWindows.add(window); break;
      case WindowType.EXTRACTION: this.extractionWindows.add(window); break;
    }
  }

  /**
   * 检查窗口是否为主窗口
   * @param {BrowserWindow} window 窗口实例
   * @returns {boolean}
   */
  isMainWindow(window) {
    if (!window || window.isDestroyed()) return false;
    
    // 首先检查引用是否匹配
    if (this.mainWindow === window) return true;
    
    // 检查window对象上的标记
    if (window.__isMainWindow === true) return true;
    
    // 检查webPreferences中的额外信息
    if (window.webPreferences && window.webPreferences.extraInfo) {
      return window.webPreferences.extraInfo.windowType === WindowType.MAIN;
    }
    
    return false;
  }



  /**
   * 创建主窗口
   */
  createMainWindow() {
    console.log('创建主窗口...');
    
    // 隐藏应用程序菜单
    this.setupApplicationMenu();

    // 加载窗口记忆分辨率
    const windowState = this.loadWindowState();
    
    // 使用无框窗口作为兼容沉浸式标题栏
    const mainWindow = new BrowserWindow({
      width: windowState.width,
      height: windowState.height,
      x: windowState.x,
      y: windowState.y,
      minWidth: 800,
      minHeight: 530,
      show: false, // 先隐藏窗口，等待内容加载完成
      frame: false, // 移除原生标题栏
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: nativeTheme.shouldUseDarkColors ? '#111315' : '#ffffff',
        symbolColor: nativeTheme.shouldUseDarkColors ? '#e9ecef' : '#1a1d20',
        height: 32
      },
      icon: path.join(__dirname, '../../ico/Detect.ico'),
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#111315' : '#ffffff',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        allowRunningInsecureContent: true,
        extraInfo: { windowType: WindowType.MAIN } // 添加窗口类型标记
      }
    });

    // 立即设置mainWindow引用，确保在markWindowType之前就能被识别
    this.mainWindow = mainWindow;
    console.log('mainWindow引用已设置');

    // 监听系统主题变化，更新标题栏颜色
    nativeTheme.on('updated', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setTitleBarOverlay({
          color: nativeTheme.shouldUseDarkColors ? '#111315' : '#ffffff',
          symbolColor: nativeTheme.shouldUseDarkColors ? '#e9ecef' : '#1a1d20'
        });
        mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#111315' : '#ffffff');
      }
    });

    // 为窗口添加类型标记
    this.markWindowType(mainWindow, WindowType.MAIN);

    // 设置主窗口的链接处理策略：拦截所有新窗口请求，使用自定义浏览器窗口打开
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      // 检查是否是 http/https 协议
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // 检查是否已有浏览器窗口，如果有则复用
        if (this.browserWindows.size > 0) {
          const existingWindow = this.browserWindows.values().next().value;
          if (existingWindow && !existingWindow.isDestroyed()) {
            existingWindow.loadURL(url).catch(err => console.error('加载URL失败:', err));
            if (existingWindow.isMinimized()) existingWindow.restore();
            existingWindow.show();
            existingWindow.focus();
            return { action: 'deny' };
          }
        }

        // 使用 createBrowserWindow 打开，这样新窗口会拥有正确的安全策略和右键菜单
        this.createBrowserWindow(url);
      } else {
        // 其他协议使用系统默认方式打开
        shell.openExternal(url).catch(err => console.error('打开外部链接失败:', err));
      }
      return { action: 'deny' };
    });

    // 在开发模式下加载webpack开发服务器
    if (process.env.NODE_ENV === 'development') {
      mainWindow.loadURL('http://localhost:8080/Welcome.html')
        .catch((error) => {
          console.error('加载开发服务器失败:', error);
          // 如果开发服务器失败，加载本地HTML文件
          mainWindow.loadFile(path.join(__dirname, '../../public/Welcome.html'))
            .catch((localError) => {
              console.error('加载本地HTML文件也失败:', localError);
              throw localError;
            });
        });
    } else {
      // 生产模式加载构建后的文件
      mainWindow.loadFile(path.join(__dirname, '../../dist/Welcome.html'))
        .catch((error) => {
          console.error('加载生产版本失败:', error);
          throw error;
        });
    }

    // 设置窗口事件监听
    this.setupMainWindowEvents();

    // 优雅显示窗口：等待内容加载完成再显示，避免闪烁
    mainWindow.once('ready-to-show', () => {
      // 恢复窗口最大化状态
      if (windowState && windowState.isMaximized) {
        mainWindow.maximize();
      }
      mainWindow.show();
    });
    const { width, height } = mainWindow.getBounds();
    console.log(`主窗口创建完成`);
    console.log(`分辨率: ${width}x${height}`);
    return mainWindow;
  }

  /**
   * 统一设置子窗口（浏览器和导航窗口）的事件
   * @param {BrowserWindow} window 窗口实例
   * @param {Set} windowSet 窗口所属的集合
   */
  setupChildWindowEvents(window, windowSet) {
    if (!window || window.isDestroyed()) return;

    // 监听窗口关闭事件
    window.on('closed', () => {
      windowSet.delete(window);
    });

    const webContents = window.webContents;
    webContents.on('did-finish-load', () => {
      if (webContents.getTitle()) {
        window.setTitle(webContents.getTitle());
      }
    });

    // 设置统一的子窗口右键菜单
    webContents.on('context-menu', (event, params) => {
      const menu = new Menu();
      const hasSelection = !!params.selectionText;
      
      // 浏览器核心功能
      if (!hasSelection) {
        if (webContents.navigationHistory.canGoBack()) {
          menu.append(new MenuItem({
            label: '后退',
            accelerator: 'Alt+Left',
            click: () => webContents.navigationHistory.goBack()
          }));
        }
        
        if (webContents.navigationHistory.canGoForward()) {
          menu.append(new MenuItem({
            label: '前进',
            accelerator: 'Alt+Right',
            click: () => webContents.navigationHistory.goForward()
          }));
        }
        
        menu.append(new MenuItem({
          label: '刷新',
          accelerator: 'F5',
          click: () => window.reload()
        }));

        menu.append(new MenuItem({ type: 'separator' }));
      }

      // 链接功能
      if (params.linkURL) {
        menu.append(new MenuItem({
          label: '复制链接地址',
          click: () => clipboard.writeText(params.linkURL)
        }));
        menu.append(new MenuItem({
          label: '在系统浏览器中打开链接',
          click: () => shell.openExternal(params.linkURL)
        }));
        menu.append(new MenuItem({ type: 'separator' }));
      }
      
      // 文本功能
      if (params.selectionText) {
        const searchText = params.selectionText.trim();
        const truncatedText = searchText.length > 15 ? searchText.substring(0, 15) + '...' : searchText;
        menu.append(new MenuItem({
          label: `搜索 ：${truncatedText}`,
          click: () => shell.openExternal(`https://www.bing.com/search?q=${encodeURIComponent(params.selectionText)}`)
        }));
        menu.append(new MenuItem({ label: '复制', role: 'copy' }));
        menu.append(new MenuItem({ label: '全选', role: 'selectall' }));
      }
      
      // 编辑功能
      if (params.isEditable) {
        menu.append(new MenuItem({ label: '剪切', role: 'cut' }));
        menu.append(new MenuItem({ label: '粘贴', role: 'paste' }));
        menu.append(new MenuItem({ type: 'separator' }));
      }
      menu.append(new MenuItem({
        label: '复制本页链接',
        click: () => {
          const url = webContents.getURL();
          clipboard.writeText(url);
        }
      }));
      menu.append(new MenuItem({ label: '在系统浏览器中打开本页', click: () => shell.openExternal(webContents.getURL()) }));
      menu.append(new MenuItem({ label: '打印', click: () => webContents.print() }));
      menu.popup({ window });
    });
  }

  /**
   * 创建浏览器窗口（用于URL跳转和内部导航）
   * @param {string} url 要加载的URL
   * @returns {BrowserWindow}
   */
  createBrowserWindow(url) {
    console.log('创建浏览器窗口...');
    
    const browserWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true,
      icon: path.join(__dirname, '../../ico/Detect.ico'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false, // 统一关闭安全限制以支持某些功能的跳转和提取
        allowRunningInsecureContent: true,
        plugins: true,
        experimentalFeatures: false,
        extraInfo: { windowType: WindowType.BROWSER }
      }
    });

    // 为窗口添加类型标记
    this.markWindowType(browserWindow, WindowType.BROWSER);

    // 设置浏览器窗口的安全策略（防止打开新窗口，在原窗口跳转）
    this.setupNavigationWindowSecurity(browserWindow);

    // 加载URL
    browserWindow.loadURL(url).catch((error) => {
      console.error('浏览器窗口加载失败:', error);
      this.destroyWindow(browserWindow);
    });

    // 设置浏览器窗口事件监听
    this.setupChildWindowEvents(browserWindow, this.browserWindows);

    return browserWindow;
  }

  /**
   * 设置导航窗口安全策略
   * @param {BrowserWindow} window 导航窗口实例
   */
  setupNavigationWindowSecurity(window) {
    const webContents = window.webContents;

    // 设置链接处理：在同一窗口中导航，不创建新窗口
    webContents.setWindowOpenHandler(({ url }) => {
      // 检查是否是 http/https 协议
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // 使用 setImmediate 确保当前事件循环完成，避免导航冲突
        setImmediate(() => {
          if (!window.isDestroyed()) {
            window.loadURL(url).catch((error) => {
              // 忽略 ERR_ABORTED (-3) 错误，通常是因为被新的导航中断
              if (error.code !== 'ERR_ABORTED' && error.errno !== -3) {
                console.error('窗口导航失败:', error);
              }
            });
          }
        });
      } else {
        // 对于非 http/https 协议（如 mailto:），使用系统默认方式打开
        shell.openExternal(url).catch(err => console.error('打开外部链接失败:', err));
      }
      return { action: 'deny' }; // 拒绝创建新窗口
    });
  }

  /**
   * 设置主窗口事件监听
   */
  setupMainWindowEvents() {
    if (!this.mainWindow) return;

    // 监听窗口大小改变和移动
    this.mainWindow.on('resize', () => this.saveWindowState());
    this.mainWindow.on('move', () => this.saveWindowState());

    this.mainWindow.on('closed', () => {
      this.saveWindowState();
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
        allowRunningInsecureContent: true,
        extraInfo: { windowType: WindowType.EXTRACTION }
      }
    };

    const extractionWindow = new BrowserWindow({ ...defaultOptions, ...options });
    
    // 为窗口添加类型标记
    this.markWindowType(extractionWindow, WindowType.EXTRACTION);
    
    // 配置会话：拦截请求和隐藏特征
    this.configureExtractionSession(extractionWindow);

    return extractionWindow;
  }

  /**
   * 配置提取窗口的会话和行为
   * @param {BrowserWindow} window 
   */
  configureExtractionSession(window) {
    if (!window || window.isDestroyed()) return;

    const session = window.webContents.session;

    // 1. 拦截不必要的请求，特别是导致超时的 STUN 请求
    // 只有在 session 有效时才设置
    if (session && session.webRequest) {
      session.webRequest.onBeforeRequest({
        urls: [
          '*://*.l.google.com/*',
          '*://*.services.mozilla.com/*',
          '*://*.services.mozilla1.com/*',
          '*://*.google-analytics.com/*',
          '*://*.doubleclick.net/*',
          '*://*.googlesyndication.com/*'
        ]
      }, (details, callback) => {
        callback({ cancel: true });
      });
    }

    // 2. 注入脚本隐藏 webdriver 特征，防止反爬虫检测
    window.webContents.on('did-start-loading', () => {
      if (!window.isDestroyed()) {
        window.webContents.executeJavaScript(`
          try {
            // 覆盖 navigator.webdriver
            Object.defineProperty(navigator, 'webdriver', {
              get: () => undefined
            });
            
            // 覆盖 chrome.runtime
            if (!window.chrome) {
              window.chrome = {};
            }
            
            // 模拟插件列表
            Object.defineProperty(navigator, 'plugins', {
              get: () => [1, 2, 3, 4, 5]
            });
            
            Object.defineProperty(navigator, 'languages', {
              get: () => ['zh-CN', 'zh', 'en']
            });
          } catch (e) {}
        `).catch(() => {});
      }
    });
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
    });
  }

  /**
   * 关闭并清理窗口
   * @param {BrowserWindow} window 要关闭的窗口
   */
  destroyWindow(window) {
    if (window && !window.isDestroyed()) {
      try {
        // 从对应的集合中移除
        this.browserWindows.delete(window);
        this.extractionWindows.delete(window);
        
        // 如果是主窗口，清除主窗口引用
        if (this.mainWindow === window) {
          this.mainWindow = null;
        }
        
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
   * 在浏览器窗口中导航到指定URL（如果已存在则复用）
   * @param {string} url 要导航的URL
   */
  jumpurl(url) {
    console.log('跳转窗口:', url);
    try {
      // 如果没有浏览器窗口，创建新的
      if (this.browserWindows.size === 0) {
        const browserWindow = this.createBrowserWindow(url);
        browserWindow.show();
        return browserWindow;
      } else {
        // 如果已有浏览器窗口，在第一个窗口中打开链接
        const firstWindow = this.browserWindows.values().next().value;
        if (firstWindow && !firstWindow.isDestroyed()) {
          firstWindow.show();
          firstWindow.loadURL(url).catch((error) => {
            console.error('窗口加载失败:', error);
            this.destroyWindow(firstWindow);
            const newWindow = this.createBrowserWindow(url);
            newWindow.show();
            return newWindow;
          });
          return firstWindow;
        } else {
          this.browserWindows.clear(); // 清理已销毁的引用
          const browserWindow = this.createBrowserWindow(url);
          browserWindow.show();
          return browserWindow;
        }
      }
    } catch (error) {
      console.error('导航失败:', error);
      throw error;
    }
  }

  /**
   * 设置应用程序菜单
   */
  setupApplicationMenu() {
    Menu.setApplicationMenu(null);
  }

  /**
   * 获取所有窗口数量统计
   */
  getWindowStats() {
    return {
      main: this.mainWindow ? 1 : 0,
      browser: this.browserWindows.size,
      extraction: this.extractionWindows.size,
      total: (this.mainWindow ? 1 : 0) + this.browserWindows.size + this.extractionWindows.size
    };
  }
}

// 导出 WindowType 枚举和 WindowManager 类
module.exports = {
  WindowManager,
  WindowType
};