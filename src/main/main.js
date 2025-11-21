const { app, BrowserWindow, ipcMain, session, Menu, MenuItem, shell } = require('electron');
const path = require('path');
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
      
      // 设置右键菜单
      this.setupContextMenu();
      
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
   * 创建原生右键菜单
   */
  createContextMenu() {
    const menu = new Menu();
    
    // 撤销
    menu.append(new MenuItem({
      label: '撤销',
      accelerator: 'CmdOrCtrl+Z',
      role: 'undo'
    }));
    
    // 重做
    menu.append(new MenuItem({
      label: '重做',
      accelerator: 'CmdOrCtrl+Shift+Z',
      role: 'redo'
    }));
    
    menu.append(new MenuItem({ type: 'separator' }));
    
    // 剪切
    menu.append(new MenuItem({
      label: '剪切',
      accelerator: 'CmdOrCtrl+X',
      role: 'cut'
    }));
    
    // 复制
    menu.append(new MenuItem({
      label: '复制',
      accelerator: 'CmdOrCtrl+C',
      role: 'copy'
    }));
    
    // 粘贴
    menu.append(new MenuItem({
      label: '粘贴',
      accelerator: 'CmdOrCtrl+V',
      role: 'paste'
    }));
    
    // 全选
    menu.append(new MenuItem({
      label: '全选',
      accelerator: 'CmdOrCtrl+A',
      role: 'selectall'
    }));
    
    menu.append(new MenuItem({ type: 'separator' }));
    
    // 查找
    menu.append(new MenuItem({
      label: '查找...',
      accelerator: 'CmdOrCtrl+F',
      role: 'find'
    }));
    
    // 替换
    menu.append(new MenuItem({
      label: '替换...',
      accelerator: 'CmdOrCtrl+H',
      role: 'replace'
    }));
    
    menu.append(new MenuItem({ type: 'separator' }));
    
    // 转到
    menu.append(new MenuItem({
      label: '转到...',
      accelerator: 'CmdOrCtrl+L',
      click: () => {
        // 聚焦到地址栏或输入框
        const mainWindow = this.getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.executeJavaScript(`
            const input = document.querySelector('input[type="text"], textarea');
            if (input) {
              input.focus();
              input.select();
            }
          `);
        }
      }
    }));
    
    return menu;
  }

  /**
   * 设置右键菜单
   * 注意：主窗口使用自定义右键菜单，新窗口使用Electron默认浏览器右键菜单
   */
  setupContextMenu() {
    // 只为主窗口设置自定义右键菜单
    app.on('web-contents-created', (event, contents) => {
      // 检查是否是主窗口：只有使用preload脚本的才是主窗口
      // 我们通过检查contents的userAgent来区分
      const isMainWindow = contents.session && contents.session.getUserAgent().includes('ChatApp');
      
      if (isMainWindow) {
        contents.on('context-menu', (event, params) => {
          const menu = this.buildDynamicContextMenu(params);
          menu.popup();
        });
      }
      // 新窗口不设置自定义右键菜单，让它使用Electron默认的浏览器右键菜单
    });
  }

  /**
   * 在新窗口中打开URL
   * @param {string} url 要打开的URL
   */
  openUrlInNewWindow(url) {
    try {
      console.log('在新窗口中打开URL:', url);
      
      // 创建具有完整浏览器功能的新窗口，不设置自定义右键菜单
      const newWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: true, // 立即显示窗口
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true, // 启用web安全
          allowRunningInsecureContent: false,
          plugins: true, // 启用插件支持
          experimentalFeatures: false,
          // 不使用preload脚本，让新窗口成为完全的浏览器窗口，使用Electron默认右键菜单
        }
      });

      // 不设置context-menu事件监听，让新窗口使用Electron默认的完整浏览器右键菜单

      // 加载URL
      newWindow.loadURL(url).then(() => {
        console.log('URL加载成功:', url);
      }).catch((error) => {
        console.error('加载URL失败:', error);
        newWindow.close();
      });

      // 窗口关闭时清理
      newWindow.on('closed', () => {
        console.log('新窗口已关闭');
      });

    } catch (error) {
      console.error('打开新窗口失败:', error);
    }
  }

  /**
   * 检查是否为有效的URL
   * @param {string} text 要检查的文本
   * @returns {boolean}
   */
  isValidUrl(text) {
    if (!text || typeof text !== 'string') return false;
    
    // 基本URL格式检查
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    const fullUrlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})(:[0-9]+)?([\/\w \.-]*)*\/?$/;
    
    return urlRegex.test(text) || fullUrlRegex.test(text) || text.startsWith('www.');
  }

  /**
   * 截断文本用于显示
   * @param {string} text 要截断的文本
   * @param {number} maxLength 最大长度
   * @param {string} suffix 后缀
   * @returns {string}
   */
  truncateText(text, maxLength = 50, suffix = '...') {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - suffix.length) + suffix;
  }

  /**
   * 根据当前上下文构建动态右键菜单
   */
  buildDynamicContextMenu(params) {
    const menu = new Menu();
    
    // 检查是否有链接被选中
    const linkUrl = params.linkURL || (params.selectionText && this.isValidUrl(params.selectionText) ? params.selectionText : null);
    
    // 基本菜单项
    const hasText = params.selectionText || params.editFlags.canPaste;
    if (hasText) {
      if (params.editFlags.canCut) {
        menu.append(new MenuItem({ label: '剪切', role: 'cut', accelerator: 'CmdOrCtrl+X' }));
      }
      if (params.editFlags.canCopy) {
        menu.append(new MenuItem({ label: '复制', role: 'copy', accelerator: 'CmdOrCtrl+C' }));
      }
    }
    
    if (params.editFlags.canPaste) {
      menu.append(new MenuItem({ label: '粘贴', role: 'paste', accelerator: 'CmdOrCtrl+V' }));
    }
    
    if (params.editFlags.canSelectAll) {
      menu.append(new MenuItem({ label: '全选', role: 'selectall', accelerator: 'CmdOrCtrl+A' }));
    }
    
    // 如果有链接，添加转到链接选项
    if (linkUrl) {
      menu.append(new MenuItem({ type: 'separator' }));
      const displayUrl = this.truncateText(linkUrl, 50);
      menu.append(new MenuItem({
        label: `转到 ${displayUrl}`,
        click: () => {
          this.openUrlInNewWindow(linkUrl);
        }
      }));
    }
    
    // 搜索功能
    if (params.selectionText && params.selectionText.trim()) {
      const searchText = params.selectionText.trim();
      menu.append(new MenuItem({ type: 'separator' }));
      const displaySearchText = this.truncateText(searchText, 30);
      menu.append(new MenuItem({
        label: `搜索 ${displaySearchText}`,
        click: () => {
          const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(searchText)}`;
          this.openUrlInNewWindow(searchUrl);
        }
      }));
    }
    
    // 如果没有添加任何菜单项，添加一个默认菜单
    if (menu.items.length === 0) {
      menu.append(new MenuItem({ label: 'Reload', role: 'reload' }));
    }
    
    return menu;
  }

  /**
   * 设置IPC通信
   */
  setupIPC() {
    // 窗口控制事件
    ipcMain.on('window-minimize', () => {
      const window = this.getMainWindow();
      if (window) {
        window.minimize();
      }
    });

    ipcMain.on('window-maximize', () => {
      const window = this.getMainWindow();
      if (window) {
        if (window.isMaximized()) {
          window.unmaximize();
        } else {
          window.maximize();
        }
      }
    });

    ipcMain.on('window-close', () => {
      const window = this.getMainWindow();
      if (window) {
        window.close();
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

    // 返回窗口是否处于最大化
    ipcMain.handle('window-is-maximized', () => {
      const w = this.getMainWindow();
      return !!(w && w.isMaximized());
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

    // 同步最大化/还原状态到渲染进程
    this.mainWindow.on('maximize', () => {
      try {
        this.mainWindow.webContents.send('window-maximized');
      } catch (err) {}
    });

    this.mainWindow.on('unmaximize', () => {
      try {
        this.mainWindow.webContents.send('window-unmaximized');
      } catch (err) {}
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