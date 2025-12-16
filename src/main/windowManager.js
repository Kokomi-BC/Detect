const { BrowserWindow, Menu, MenuItem, clipboard, shell } = require('electron');
const path = require('path');

/**
 * 窗口类型枚举
 */
const WindowType = {
  MAIN: 'main',
  BROWSER: 'browser',
  NAVIGATION: 'navigation',
  EXTRACTION: `extraction`
};

/**
 * 窗口管理器 - 负责应用程序窗口的创建和管理
 */
class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.browserWindows = new Set(); // 所有浏览器窗口
    this.navigationWindows = new Set(); // 主窗口
    this.extractionWindows = new Set(); // 提取窗口
  }



  /**
   * 构建右键菜单
   */
  buildContextMenu() {
    return Menu.buildFromTemplate([
      {
        label: '全选',
        accelerator: 'CmdOrCtrl+A',
        click: (menuItem, browserWindow) => {
          if (browserWindow) {
            browserWindow.webContents.send('context-menu-select-all');
          }
        }
      },
      { type: 'separator' },
      {
        label: '复制',
        accelerator: 'CmdOrCtrl+C',
        click: (menuItem, browserWindow) => {
          if (browserWindow) {
            browserWindow.webContents.send('context-menu-copy');
          }
        }
      },
      {
        label: '剪切',
        accelerator: 'CmdOrCtrl+X',
        click: (menuItem, browserWindow) => {
          if (browserWindow) {
            browserWindow.webContents.send('context-menu-cut');
          }
        }
      },
      {
        label: '粘贴',
        accelerator: 'CmdOrCtrl+V',
        click: (menuItem, browserWindow) => {
          if (browserWindow) {
            browserWindow.webContents.send('context-menu-paste');
          }
        }
      },
      { type: 'separator' },
      {
        label: '搜索',
        click: (menuItem, browserWindow) => {
          if (browserWindow) {
            browserWindow.webContents.send('context-menu-search');
          }
        }
      }
    ]);
  }

  /**
   * 为窗口添加类型标记
   * @param {BrowserWindow} window 窗口实例
   * @param {WindowType} type 窗口类型
   */
  markWindowType(window, type) {
    if (window && !window.isDestroyed()) {
      // 直接设置window对象属性（同步方式）
      // 使用 writable: true 允许后续修改，虽然通常不需要
      Object.defineProperty(window, '__windowType', {
        value: type,
        writable: true,
        enumerable: false,
        configurable: true
      });
      
      Object.defineProperty(window, '__isMainWindow', {
        value: type === WindowType.MAIN,
        writable: true,
        enumerable: false,
        configurable: true
      });
      
      // 异步设置webContents中的属性
      if (window.webContents && !window.isDestroyed()) {
        window.webContents.executeJavaScript(`
          window.__windowType = '${type}';
          window.__isMainWindow = ${type === WindowType.MAIN};
        `).catch(() => {
          // 如果执行JavaScript失败，使用webPreferences中的额外信息
          if (window.webPreferences && window.webPreferences.extraInfo) {
            window.webPreferences.extraInfo.windowType = type;
          }
        });
      }
      
      // 添加到对应的集合中
      switch (type) {
        case WindowType.MAIN:
          // 主窗口引用已在createMainWindow中设置，这里只做标记
          console.log('主窗口标记完成'); // 添加调试日志
          break;
        case WindowType.BROWSER:
          this.browserWindows.add(window);
          break;
        case WindowType.NAVIGATION:
          this.navigationWindows.add(window);
          break;
        case WindowType.EXTRACTION:
          this.extractionWindows.add(window);
          break;
      }
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
    
    // 使用无框窗口（frameless）作为兼容沉浸式标题栏的回退方案
    const mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      minWidth: 800,
      minHeight: 530,
      frame: true, // 恢复原生标题栏
      backgroundColor: '#F5E6E6',
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

    // 为窗口添加类型标记
    this.markWindowType(mainWindow, WindowType.MAIN);

    // 设置主窗口的链接处理策略：拦截所有新窗口请求，使用自定义浏览器窗口打开
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      // 检查是否是 http/https 协议
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // 使用 createBrowserWindow 打开，这样新窗口会拥有正确的安全策略和右键菜单
        this.createBrowserWindow(url);
      } else {
        // 其他协议使用系统默认方式打开
        shell.openExternal(url).catch(err => console.error('打开外部链接失败:', err));
      }
      return { action: 'deny' };
    });

    // 设置原生右键菜单
    this.setupWindowContextMenu(mainWindow);

    // 在开发模式下加载webpack开发服务器
    if (process.env.NODE_ENV === 'development') {
      mainWindow.loadURL('http://localhost:8080')
        .catch((error) => {
          console.error('加载开发服务器失败:', error);
          // 如果开发服务器失败，加载本地HTML文件
          mainWindow.loadFile(path.join(__dirname, '../../public/code.html'))
            .catch((localError) => {
              console.error('加载本地HTML文件也失败:', localError);
              throw localError;
            });
        });
    } else {
      // 生产模式加载构建后的文件
      mainWindow.loadFile(path.join(__dirname, '../../dist/code.html'))
        .catch((error) => {
          console.error('加载生产版本失败:', error);
          throw error;
        });
    }

    // 设置窗口事件监听
    this.setupMainWindowEvents();

    console.log('主窗口创建完成');
    return mainWindow;
  }

  /**
   * 设置窗口的原生右键菜单
   * @param {BrowserWindow} window 窗口实例
   */
  setupWindowContextMenu(window) {
    // 右键菜单由main.js中的setupContextMenu()方法统一处理
    // 这里不需要额外的设置
  }

  /**
   * 创建浏览器窗口（用于URL跳转，使用原生右键菜单）
   * @param {string} url 要加载的URL
   * @returns {BrowserWindow}
   */
  createBrowserWindow(url) {
    console.log('创建浏览器窗口...');
    
    const browserWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        plugins: true,
        experimentalFeatures: false,
        // 不使用preload脚本，让新窗口成为完全的浏览器窗口
        extraInfo: { windowType: WindowType.BROWSER } // 添加窗口类型标记
      }
    });

    // 为窗口添加类型标记
    this.markWindowType(browserWindow, WindowType.BROWSER);

    // 设置浏览器窗口的安全策略（防止打开新窗口）
    this.setupNavigationWindowSecurity(browserWindow);

    // 加载URL
    browserWindow.loadURL(url).catch((error) => {
      console.error('浏览器窗口加载失败:', error);
      this.destroyWindow(browserWindow);
    });

    // 设置浏览器窗口事件监听
    this.setupBrowserWindowEvents(browserWindow);

    return browserWindow;
  }

  /**
   * 创建导航窗口（用于内部导航）
   * @param {string} url 要加载的URL
   * @returns {BrowserWindow}
   */
  createNavigationWindow(url) {
    console.log('创建导航窗口...');
    
    const navigationWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        allowRunningInsecureContent: true,
        plugins: true,
        experimentalFeatures: false,
        // 不使用preload脚本
        extraInfo: { windowType: WindowType.NAVIGATION }
      }
    });

    // 为窗口添加类型标记
    this.markWindowType(navigationWindow, WindowType.NAVIGATION);

    // 设置导航窗口的安全策略和事件监听
    this.setupNavigationWindowSecurity(navigationWindow);

    // 加载URL
    navigationWindow.loadURL(url).catch((error) => {
      console.error('导航窗口加载失败:', error);
      this.destroyWindow(navigationWindow);
    });

    // 设置导航窗口事件监听
    this.setupNavigationWindowEvents(navigationWindow);

    return navigationWindow;
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

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  /**
   * 设置浏览器窗口事件监听
   */
  setupBrowserWindowEvents(window) {
    // 监听窗口关闭事件，从集合中移除
    window.on('closed', () => {
      this.browserWindows.delete(window);
    });

    // 监听页面导航，更新窗口状态
    const webContents = window.webContents;
    webContents.on('did-finish-load', () => {
      // 页面加载完成，可以更新窗口标题等
      if (webContents.getTitle()) {
        window.setTitle(webContents.getTitle());
      }
    });

    // 为浏览器窗口设置右键菜单（只在窗口创建时设置一次）
    console.log('为浏览器窗口设置右键菜单...');
    webContents.on('context-menu', (event, params) => {
      console.log('浏览器窗口右键菜单事件触发');
      // 创建右键菜单
      const menu = new Menu();
      
      // 浏览器核心功能（放在最前面）
      menu.append(new MenuItem({
        label: '后退',
        enabled: webContents.navigationHistory.canGoBack(),
        accelerator: 'Alt+Left',
        click: () => {
          webContents.navigationHistory.goBack();
        }
      }));
      
      menu.append(new MenuItem({
        label: '前进',
        enabled: webContents.navigationHistory.canGoForward(),
        accelerator: 'Alt+Right',
        click: () => {
          webContents.navigationHistory.goForward();
        }
      }));
      
      menu.append(new MenuItem({
        label: '刷新',
        accelerator: 'F5',
        click: () => {
          window.reload();
        }
      }));

      menu.append(new MenuItem({ type: 'separator' }));

      // 链接相关功能（如果有链接）
      if (params.linkURL) {
        menu.append(new MenuItem({
          label: '复制链接地址',
          accelerator: 'Ctrl+Shift+C',
          click: () => {
            clipboard.writeText(params.linkURL);
          }
        }));
        
        menu.append(new MenuItem({
          label: '跳转到链接',
          click: () => {
            // 在当前窗口加载链接，而不是创建新窗口
            window.loadURL(params.linkURL).catch(err => console.error('跳转失败:', err));
          }
        }));

        menu.append(new MenuItem({
          label: '在系统浏览器中打开链接',
          click: () => {
            shell.openExternal(params.linkURL);
          }
        }));

        menu.append(new MenuItem({ type: 'separator' }));
      }
      
      // 文本相关功能
      if (params.selectionText) {
        menu.append(new MenuItem({
          label: '搜索 "' + params.selectionText + '"',
          click: () => {
            const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(params.selectionText)}`;
            // 在当前窗口加载搜索结果，而不是创建新窗口
            window.loadURL(searchUrl).catch(err => console.error('搜索失败:', err));
          }
        }));
        
        menu.append(new MenuItem({
          label: '复制',
          accelerator: 'CmdOrCtrl+C',
          role: 'copy'
        }));
        
        menu.append(new MenuItem({ type: 'separator' }));
      }
      
      // 输入框编辑选项（仅在点击输入框时显示）
      if (params.isEditable) {
        menu.append(new MenuItem({
          label: '剪切',
          accelerator: 'CmdOrCtrl+X',
          role: 'cut'
        }));
        
        menu.append(new MenuItem({
          label: '粘贴',
          accelerator: 'CmdOrCtrl+V',
          role: 'paste'
        }));
        
        menu.append(new MenuItem({ type: 'separator' }));
      }
      
      // 基本编辑选项
      menu.append(new MenuItem({
        label: '全选',
        accelerator: 'CmdOrCtrl+A',
        role: 'selectall'
      }));
      
      menu.append(new MenuItem({ type: 'separator' }));
      
      // 打印功能
      menu.append(new MenuItem({
        label: '打印',
        accelerator: 'Ctrl+P',
        click: () => {
          webContents.print();
        }
      }));

      menu.append(new MenuItem({ type: 'separator' }));

      // 在系统浏览器中打开当前页面（放在最底部）
      menu.append(new MenuItem({
        label: '在系统浏览器中打开',
        click: () => {
          shell.openExternal(webContents.getURL());
        }
      }));
      
      if (menu.items.length > 0) {
        menu.popup({ window });
      }
    });
  }

  /**
   * 设置导航窗口事件监听
   */
  setupNavigationWindowEvents(window) {
    // 监听窗口关闭事件，从集合中移除
    window.on('closed', () => {
      this.navigationWindows.delete(window);
    });

    // 监听页面导航，更新窗口状态
    const webContents = window.webContents;
    webContents.on('did-finish-load', () => {
      if (webContents.getTitle()) {
        window.setTitle(webContents.getTitle());
        console.log('导航窗口页面加载完成，标题：', webContents.getTitle());
      }
    });

    // 为导航窗口设置右键菜单（只在窗口创建时设置一次）
    console.log('为导航窗口设置右键菜单...');
    webContents.on('context-menu', (event, params) => {
      console.log('导航窗口右键菜单事件触发');
      // 创建右键菜单
      const menu = new Menu();
      
      // 浏览器核心功能（放在最前面）
      menu.append(new MenuItem({
        label: '后退',
        enabled: webContents.navigationHistory.canGoBack(),
        accelerator: 'Alt+Left',
        click: () => {
          webContents.navigationHistory.goBack();
        }
      }));
      
      menu.append(new MenuItem({
        label: '前进',
        enabled: webContents.navigationHistory.canGoForward(),
        accelerator: 'Alt+Right',
        click: () => {
          webContents.navigationHistory.goForward();
        }
      }));
      
      menu.append(new MenuItem({
        label: '刷新',
        accelerator: 'F5',
        click: () => {
          window.reload();
        }
      }));

      menu.append(new MenuItem({ type: 'separator' }));

      // 链接相关功能（如果有链接）
      if (params.linkURL) {
        menu.append(new MenuItem({
          label: '复制链接地址',
          accelerator: 'Ctrl+Shift+C',
          click: () => {
            clipboard.writeText(params.linkURL);
          }
        }));
        
        menu.append(new MenuItem({
          label: '跳转到链接',
          click: () => {
            // 在当前窗口加载链接，而不是创建新窗口
            window.loadURL(params.linkURL).catch(err => console.error('跳转失败:', err));
          }
        }));

        menu.append(new MenuItem({
          label: '在系统浏览器中打开链接',
          click: () => {
            shell.openExternal(params.linkURL);
          }
        }));
        
        menu.append(new MenuItem({ type: 'separator' }));
      }
      
      // 文本相关功能
      if (params.selectionText) {
        menu.append(new MenuItem({
          label: '搜索 "' + params.selectionText + '"',
          click: () => {
            const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(params.selectionText)}`;
            // 在当前窗口加载搜索结果，而不是创建新窗口
            window.loadURL(searchUrl).catch(err => console.error('搜索失败:', err));
          }
        }));
        
        menu.append(new MenuItem({
        label: '复制',
        accelerator: 'CmdOrCtrl+C',
        role: 'copy'
      }));
      
      menu.append(new MenuItem({ type: 'separator' }));
    }
    
    // 输入框编辑选项（仅在点击输入框时显示）
    if (params.isEditable) {
      menu.append(new MenuItem({
        label: '剪切',
        accelerator: 'CmdOrCtrl+X',
        role: 'cut'
      }));
      
      menu.append(new MenuItem({
        label: '粘贴',
        accelerator: 'CmdOrCtrl+V',
        role: 'paste'
      }));
      
      menu.append(new MenuItem({ type: 'separator' }));
    }
    
    // 基本编辑选项
    menu.append(new MenuItem({
      label: '全选',
      accelerator: 'CmdOrCtrl+A',
      role: 'selectall'
    }));
    
    menu.append(new MenuItem({ type: 'separator' }));
    
    // 打印功能
    menu.append(new MenuItem({
      label: '打印',
      accelerator: 'Ctrl+P',
      click: () => {
        webContents.print();
      }
    }));

      menu.append(new MenuItem({ type: 'separator' }));

      // 在系统浏览器中打开当前页面（放在最底部）
      menu.append(new MenuItem({
        label: '在系统浏览器中打开',
        click: () => {
          shell.openExternal(webContents.getURL());
        }
      }));
      
      if (menu.items.length > 0) {
        menu.popup({ window });
      }
    });
  }

  /**
   * 设置提取窗口事件监听
   */
  setupExtractionWindowEvents(window) {
    // 监听窗口关闭事件，从集合中移除
    window.on('closed', () => {
      this.extractionWindows.delete(window);
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
          '*://stun.l.google.com/*',
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
        this.navigationWindows.delete(window);
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
   * 在导航窗口中导航到指定URL
   * @param {string} url 要导航的URL
   */
  jumpurl(url) {
    console.log('跳转窗口:', url);
    try {
      // 如果没有导航窗口，创建新的导航窗口
      if (this.navigationWindows.size === 0) {
        const navigationWindow = this.createNavigationWindow(url);
        navigationWindow.show();
        return navigationWindow;
      } else {
        // 如果已有导航窗口，在第一个导航窗口中打开链接
        const firstNavigationWindow = this.navigationWindows.values().next().value;
        if (firstNavigationWindow && !firstNavigationWindow.isDestroyed()) {
          firstNavigationWindow.show();
          firstNavigationWindow.loadURL(url).catch((error) => {
            console.error('导航窗口加载失败:', error);
            this.destroyWindow(firstNavigationWindow);
            // 如果加载失败，创建新的导航窗口
            const newNavigationWindow = this.createNavigationWindow(url);
            newNavigationWindow.show();
            return newNavigationWindow;
          });
          return firstNavigationWindow;
        } else {
          // 如果现有窗口已销毁，创建新的导航窗口
          this.navigationWindows.clear(); // 清理已销毁的窗口引用
          const navigationWindow = this.createNavigationWindow(url);
          navigationWindow.show();
          return navigationWindow;
        }
      }
    } catch (error) {
      console.error('导航窗口导航失败:', error);
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
      navigation: this.navigationWindows.size,
      extraction: this.extractionWindows.size,
      total: (this.mainWindow ? 1 : 0) + this.browserWindows.size + this.navigationWindows.size + this.extractionWindows.size
    };
  }
}

// 导出 WindowType 枚举和 WindowManager 类
module.exports = {
  WindowManager,
  WindowType
};