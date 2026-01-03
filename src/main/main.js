const { app, BrowserWindow, ipcMain, session, Menu, MenuItem, shell, nativeTheme, dialog, clipboard, nativeImage, net } = require('electron');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { WindowManager, WindowType } = require('./windowManager');
const ExtractionManager = require('./extractionManager');
const LLMService = require('./llmService');

/**
 * 主应用入口 - 使用模块化架构的Electron应用
 */
class DetectApp {
  constructor() {
    this.mainWindow = null;
    this.isAppReady = false;
    this.initialized = false;
    
    // 初始化各个管理器实例
    this.windowManager = new WindowManager();
    this.extractionManager = new ExtractionManager();
    this.llmService = new LLMService();

    // Limits
    this.PDF_MAX_TEXT_LENGTH = 20000;
  }

  /**
   * 初始化应用
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      console.log('正在初始化应用...');
      
      // 设置应用基本配置
      this.setupApp();
      
      // 设置IPC事件监听
      this.setupIPC();
      
      // 创建主窗口
      this.createMainWindow();
      
      this.initialized = true;
      console.log('应用初始化完成');
      
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
    this.setupSingleInstance();
    this.setupAppEvents();
    this.setupUserAgent();
    this.disableWebRTCConnections();
  }


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

      // 监听新窗口创建事件，为新窗口添加右键菜单
      app.on('web-contents-created', (event, contents) => {
        // 忽略主窗口的 webContents (主窗口有自定义菜单)
        if (this.mainWindow && contents === this.mainWindow.webContents) {
            return;
        }

        
        contents.on('context-menu', (e, params) => {
          // 如果窗口已经被销毁，直接返回
          if (contents.isDestroyed()) return;

          // 尝试获取所属窗口
          const win = BrowserWindow.fromWebContents(contents);
          if (!win) return;

          // 检查窗口是否已经被 WindowManager 标记并处理
          // 如果窗口有 __windowType 标记，说明 WindowManager 已经接管了它的右键菜单
          if (win.__windowType === 'browser' || win.__windowType === 'navigation') {
             return;
          }

          const menu = new Menu();

          // 文本编辑相关
          if (params.isEditable) {
            menu.append(new MenuItem({ label: '撤销', role: 'undo' }));
            menu.append(new MenuItem({ label: '重做', role: 'redo' }));
            menu.append(new MenuItem({ type: 'separator' }));
            menu.append(new MenuItem({ label: '剪切', role: 'cut' }));
            menu.append(new MenuItem({ label: '复制', role: 'copy' }));
            menu.append(new MenuItem({ label: '粘贴', role: 'paste' }));
            menu.append(new MenuItem({ label: '全选', role: 'selectAll' }));
          } else if (params.selectionText) {
            // 选中文本
            menu.append(new MenuItem({ label: '复制', role: 'copy' }));
            menu.append(new MenuItem({ label: '搜索', click: () => {
                shell.openExternal(`https://www.bing.com/search?q=${encodeURIComponent(params.selectionText)}`);
            }}));
          } else if (params.mediaType === 'image') {
             // 图片
             menu.append(new MenuItem({ label: '复制图片', role: 'copyImage' }));
             menu.append(new MenuItem({ label: '复制图片地址', click: () => {
                 clipboard.writeText(params.srcURL);
             }}));
          } else {
             // 普通区域
             menu.append(new MenuItem({ label: '后退', role: 'back', enabled: contents.navigationHistory.canGoBack() }));
             menu.append(new MenuItem({ label: '前进', role: 'forward', enabled: contents.navigationHistory.canGoForward() }));
             menu.append(new MenuItem({ label: '刷新', role: 'reload' }));
          }
          
          menu.popup({ window: win });
        });
      });
    });


  }

 

  /**
   * 设置用户代理
   */
  setupUserAgent() {
    // 设置默认用户代理，确保主窗口能被正确识别
    const defaultUserAgent = app.userAgentFallback;
    const customUserAgent = `${defaultUserAgent} DetctApp/1.0`;
    app.userAgentFallback = customUserAgent;
  }

  /**
   * 禁用WebRTC连接，避免STUN错误
   */
  disableWebRTCConnections() {
    // 通过命令行开关禁用WebRTC
    app.commandLine.appendSwitch('disable-webrtc');
  }

  /**
   * 在新窗口中打开URL（新窗口使用原生右键菜单）
   * @param {string} url 要打开的URL
   */
  openUrlInNewWindow(url) {
    try {
      // 使用窗口管理器创建浏览器窗口
      const browserWindow = this.windowManager.createBrowserWindow(url);
      
      // 窗口关闭时清理
      browserWindow.on('closed', () => {
        console.log('浏览器窗口已关闭');
      });

    } catch (error) {
      console.error('打开新窗口失败:', error);
    }
  }

  // setupNavigationControls方法已迁移到WindowManager类

  /**
   * 检查是否为有效的URL
   * @param {string} text 要检查的文本
   * @returns {boolean}
   */
  isValidUrl(text) {
    if (!text || typeof text !== 'string') return false;
    
    const trimmedText = text.trim();
    
    // 更宽松的URL格式检查
    // 检查各种URL格式：完整的http/https URL、www开头的URL、域名格式
    const urlPatterns = [
      /^https?:\/\/.+/i,  // http:// 或 https:// 开头的完整URL
      /^www\./i,         // www. 开头的URL
      /^[\w-]+\.[\w.-]+(?:\.[\w.-]+)*(?:\/[^\s]*)?$/i, // 域名格式，包括子域名
      /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/i, // 标准域名
      /^[\w-]+\.(com|net|org|edu|gov|co\.uk|co\.cn|com\.cn|net\.cn|org\.cn)(?:\/[^\s]*)?$/i // 常见顶级域名
    ];
    
    const result = urlPatterns.some(pattern => pattern.test(trimmedText));
    return result;
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
    
    // 如果有链接，添加转到链接选项（在专用跳转窗口中导航）
    if (linkUrl) {
      menu.append(new MenuItem({ type: 'separator' }));
      const displayUrl = this.truncateText(linkUrl, 50);
      menu.append(new MenuItem({
        label: `转到 ${displayUrl}`,
        click: () => {
          this.windowManager.jumpurl(linkUrl);
        }
      }));
    }
    
    // 搜索功能（在专用跳转窗口中导航）
    if (params.selectionText && params.selectionText.trim()) {
      const searchText = params.selectionText.trim();
      menu.append(new MenuItem({ type: 'separator' }));
      const displaySearchText = this.truncateText(searchText, 30);
      menu.append(new MenuItem({
        label: `搜索 ${displaySearchText}`,
        click: () => {
          const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(searchText)}`;
          this.windowManager.jumpurl(searchUrl);
        }
      }));
    }
    
    // 添加清除内容选项（仅在右侧界面有内容时显示）
    // 判断是否有实际内容（检测结果、提取内容等）
    const hasContent = (params.selectionText && params.selectionText.trim()) || 
                      (params.linkURL) ||
                      params.editFlags.canCopy ||
                      params.editFlags.canCut ||
                      params.editFlags.canSelectAll;
    
    if (hasContent) {
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: '清空内容',
        click: () => {
          console.log('请求在渲染进程展示清空确认弹窗');
          // 获取主窗口并发送请求，由渲染进程展示自定义确认弹窗并在确认后清空内容
          const mainWindow = this.getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('request-clear');
          }
        }
      }));
    }
    
    // 如果没有添加任何菜单项，添加一个默认菜单
    if (menu.items.length === 0) {
      menu.append(new MenuItem({ label: '刷新', role: 'reload' }));
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
    
    // 处理切换原生主题的请求
    ipcMain.on('toggle-native-theme', (event, isDarkMode) => {
      if (this.mainWindow) {
        // 设置原生主题
        nativeTheme.themeSource = isDarkMode ? 'dark' : 'light';
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

    // 设置主题事件
    ipcMain.handle('set-theme', async (event, isDarkMode) => {
      try {
        const { nativeTheme } = require('electron');
        
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          // 设置原生主题
          nativeTheme.themeSource = isDarkMode ? 'dark' : 'light';
          
          // 动态设置窗口背景色，防止页面切换时闪烁
          this.mainWindow.setBackgroundColor(isDarkMode ? '#111315' : '#ffffff');

          // 通知渲染进程主题已更改
          this.mainWindow.webContents.send('theme-changed', {
            isDarkMode: isDarkMode,
            shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
            shouldUseHighContrastColors: nativeTheme.shouldUseHighContrastColors,
            shouldInvertColorScheme: nativeTheme.shouldInvertColorScheme
          });
          
          console.log('主题已设置为:', isDarkMode ? '深色' : '浅色');
          return { success: true, message: '主题设置成功' };
        } else {
          return { success: false, error: '主窗口不存在' };
        }
      } catch (error) {
        console.error('设置主题失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 下载图片
    ipcMain.on('download-image', (event, url) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      win.webContents.downloadURL(url);
    });

    // 打开外部链接
    ipcMain.on('open-external', (event, url) => {
      shell.openExternal(url);
    });

    // 复制图片
    ipcMain.on('copy-image', async (event, src) => {
      try {
        if (src.startsWith('data:')) {
          const image = nativeImage.createFromDataURL(src);
          clipboard.writeImage(image);
        } else {
          if (src.startsWith('http')) {
            try {
              const response = await net.fetch(src);
              if (response.ok) {
                const buffer = await response.arrayBuffer();
                const image = nativeImage.createFromBuffer(Buffer.from(buffer));
                clipboard.writeImage(image);
              }
            } catch(e) {
              console.error('Copy failed', e);
              clipboard.writeText(src);
            }
          } else {
            const image = nativeImage.createFromPath(src);
            if (!image.isEmpty()) {
              clipboard.writeImage(image);
            } else {
              clipboard.writeText(src);
            }
          }
        }
      } catch (e) {
        console.error('Copy image failed:', e);
        clipboard.writeText(src);
      }
    });

    // 执行粘贴
    ipcMain.on('perform-paste', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.webContents.paste();
      }
    });

    // 显示图片右键菜单
    ipcMain.on('show-image-context-menu', (event, { src, type }) => {
      const menu = new Menu();
      const win = BrowserWindow.fromWebContents(event.sender);

      if (type === 'left-side') {
        // 粘贴
        menu.append(new MenuItem({
          label: '粘贴',
          accelerator: 'CmdOrCtrl+V',
          click: () => {
            event.sender.send('menu-action-paste');
          }
        }));
        
        // 删除
        menu.append(new MenuItem({
          label: '删除',
          click: () => {
            event.sender.send('menu-action-delete-selected');
          }
        }));

        menu.append(new MenuItem({ type: 'separator' }));

        // 复制
        menu.append(new MenuItem({
          label: '复制',
          accelerator: 'CmdOrCtrl+C',
          click: async () => {
             try {
               if (src.startsWith('data:')) {
                 const image = nativeImage.createFromDataURL(src);
                 clipboard.writeImage(image);
               } else {
                 if (src.startsWith('http')) {
                    try {
                        const response = await net.fetch(src);
                        if (response.ok) {
                            const buffer = await response.arrayBuffer();
                            const image = nativeImage.createFromBuffer(Buffer.from(buffer));
                            clipboard.writeImage(image);
                        }
                    } catch(e) {
                        console.error('Copy failed', e);
                        clipboard.writeText(src);
                    }
                 } else {
                    const image = nativeImage.createFromPath(src);
                    if (!image.isEmpty()) {
                        clipboard.writeImage(image);
                    } else {
                        clipboard.writeText(src);
                    }
                 }
               }
             } catch (e) {
               console.error('Copy image failed:', e);
               clipboard.writeText(src);
             }
          }
        }));

        // 另存为
        menu.append(new MenuItem({
          label: '另存为...',
          click: () => {
            win.webContents.downloadURL(src);
          }
        }));

      } else if (type === 'right-side') {
        // 复制
        menu.append(new MenuItem({
          label: '复制',
          accelerator: 'CmdOrCtrl+C',
          click: async () => {
             try {
                const response = await net.fetch(src);
                if (response.ok) {
                    const buffer = await response.arrayBuffer();
                    const image = nativeImage.createFromBuffer(Buffer.from(buffer));
                    clipboard.writeImage(image);
                }
             } catch (e) {
                console.error('Copy remote image failed:', e);
                clipboard.writeText(src);
             }
          }
        }));

        // 复制图片地址
        menu.append(new MenuItem({
          label: '复制图片地址',
          click: () => {
            clipboard.writeText(src);
          }
        }));

        menu.append(new MenuItem({ type: 'separator' }));

        // 另存为
        menu.append(new MenuItem({
          label: '另存为...',
          click: () => {
            win.webContents.downloadURL(src);
          }
        }));
      }

      menu.popup({ window: win });
    });

    // 显示结果区域右键菜单
    ipcMain.on('show-result-context-menu', (event) => {
      const menu = new Menu();
      const win = BrowserWindow.fromWebContents(event.sender);

      // 导出检测结果
      menu.append(new MenuItem({
        label: '导出检测结果',
        click: () => {
          event.sender.send('menu-action-export');
        }
      }));

      menu.append(new MenuItem({ type: 'separator' }));

      // 复制
      menu.append(new MenuItem({
        label: '复制',
        role: 'copy',
        accelerator: 'CmdOrCtrl+C'
      }));

      // 全选
      menu.append(new MenuItem({
        label: '全选',
        role: 'selectAll',
        accelerator: 'CmdOrCtrl+A'
      }));

      menu.popup({ window: win });
    });

    // 提取内容事件
    ipcMain.on('extract-content', async (event, url) => {
      await this.handleExtractContent(event, url);
    });

    // 同步提取内容事件 (Promise based)
    ipcMain.handle('extract-content-sync', async (event, url) => {
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
        return result;
        
      } catch (error) {
        console.error('内容提取错误:', error);
        return {
          success: false,
          error: error.message || '内容提取失败',
          url: url
        };
      }
    });

    // 大模型分析事件
    ipcMain.handle('analyze-content', async (event, { text, imageUrls, url }) => {
      try {
        console.log('收到大模型分析请求:', { textLength: text ? text.length : 0, imageCount: imageUrls ? imageUrls.length : 0, url });
        const result = await this.llmService.analyzeContent(text, imageUrls, url);
        return { success: true, data: result };
      } catch (error) {
        console.error('分析内容失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 将图片转换为Base64
    ipcMain.handle('convert-image-to-base64', async (event, url) => {
      try {
        // 如果是本地文件
        if (url.startsWith('file://') || /^[a-zA-Z]:\\/.test(url)) {
           let filePath = url.startsWith('file://') ? url.slice(7) : url; // Remove file://
           // Handle Windows paths with file:///C:/... -> /C:/... -> C:/...
           if (process.platform === 'win32' && filePath.startsWith('/') && filePath[2] === ':') {
               filePath = filePath.slice(1);
           }
           
           const decodedPath = decodeURIComponent(filePath);
           if (fs.existsSync(decodedPath)) {
               const buffer = fs.readFileSync(decodedPath);
               const base64 = buffer.toString('base64');
               const ext = path.extname(decodedPath).substring(1).toLowerCase();
               const mimeType = ext === 'jpg' ? 'jpeg' : (ext === 'svg' ? 'svg+xml' : ext);
               return { success: true, data: `data:image/${mimeType};base64,${base64}` };
           }
        }
        
        // 如果是网络图片
        if (url.startsWith('http')) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const contentType = response.headers.get('content-type') || 'image/jpeg';
            return { success: true, data: `data:${contentType};base64,${buffer.toString('base64')}` };
        }

        return { success: false, error: 'Unsupported URL format' };
      } catch (error) {
        console.error('图片转换失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 导出检测结果
    ipcMain.handle('export-result', async (event, htmlContent) => {
      try {
        const mainWindow = this.getMainWindow();
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
          title: '导出检测结果',
          defaultPath: '检测报告.html',
          filters: [
            { name: 'HTML 文件', extensions: ['html'] }
          ]
        });

        if (canceled || !filePath) {
          return { success: false, error: '已取消导出' };
        }

        fs.writeFileSync(filePath, htmlContent, 'utf-8');
        return { success: true, filePath };
      } catch (error) {
        console.error('导出失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 打开系统图片选择对话框（renderer 调用）
    ipcMain.handle('open-image-dialog', async (event) => {
      try {
        const mainWindow = this.getMainWindow();
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
          ]
        });

        if (canceled) return [];

        // 限制返回最多3个文件路径（renderer 端也会再校验）
        return filePaths.slice(0, 3);
      } catch (err) {
        console.error('open-image-dialog error:', err);
        return [];
      }
    });

    // 选择文件（PDF/Excel/Word/Text/Markdown）
    ipcMain.handle('select-file', async (event) => {
      try {
        const mainWindow = this.getMainWindow();
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: 'Documents', extensions: ['pdf','doc','docx' ,'xlsx', 'xls', 'docx', 'txt', 'md'] }
          ]
        });

        if (canceled) return { canceled: true, filePaths: [] };
        return { canceled: false, filePaths };
      } catch (err) {
        console.error('select-file error:', err);
        return { canceled: true, error: err.message };
      }
    });

    // 返回窗口是否处于最大化
    ipcMain.handle('window-is-maximized', () => {
      const w = this.getMainWindow();
      return !!(w && w.isMaximized());
    });

    // 返回右侧界面是否有内容
    ipcMain.handle('has-right-content', () => {
      const w = this.getMainWindow();
      if (!w || w.isDestroyed()) {
        return false;
      }
      
      // 通过IPC同步查询渲染进程状态
      return new Promise((resolve) => {
        w.webContents.send('query-right-content-status');
        // 设置超时，避免无限等待
        const timeout = setTimeout(() => {
          resolve(false);
        }, 1000);
        
        w.webContents.once('right-content-status', (event, hasContent) => {
          clearTimeout(timeout);
          resolve(hasContent);
        });
      });
    });

    // 历史记录相关
    ipcMain.handle('read-file-content', async (event, filePath) => {
      console.log('[read-file-content] start', { filePath });
      try {
        const ext = path.extname(filePath).toLowerCase();
        console.log('[read-file-content] detected ext', ext);

        // Normalize text across all imported files: unify newlines and collapse blank lines
        const sanitizeText = (raw) => {
          if (typeof raw !== 'string') return '';
          let text = raw.replace(/\r\n/g, '\n');
          text = text.replace(/\n{2,}/g, '\n');
          return text.trim();
        };
        
        if (ext === '.pdf') {
          try {
            const pdf = require('pdf-parse');
            const dataBuffer = fs.readFileSync(filePath);
            console.log('[read-file-content] pdf size(bytes)', dataBuffer.length);
            const data = await pdf(dataBuffer);
            console.log('[read-file-content] pdf pages', data.numpages, 'rendered pages', data.numrender, 'info', data.info);
            
            // PDF Text Cleanup
            let text = data.text;
            // Remove page numbers (simple heuristic: single digits on a line)
            text = text.replace(/^\s*\d+\s*$/gm, '');
            // Normalize spacing and blank lines
            text = sanitizeText(text);

            // Enforce max length
            let truncated = false;
            if (text.length > this.PDF_MAX_TEXT_LENGTH) {
              text = text.substring(0, this.PDF_MAX_TEXT_LENGTH);
              truncated = true;
              console.warn('[read-file-content] pdf text truncated to limit', { limit: this.PDF_MAX_TEXT_LENGTH });
            }
            
            // PDF Image Extraction (Simple JPEG Carving)
            // Note: This is a basic heuristic to find embedded JPEGs without heavy dependencies.
            // It scans for JPEG headers (FF D8) and footers (FF D9).
            const images = [];
            const seenHashes = new Set();
            try {
              let offset = 0;
              const maxImages = 10;
              const minSize = 2048; // Raise floor to skip tiny/blank embeds
              const startTime = Date.now();
              
              while (offset < dataBuffer.length && images.length < maxImages) {
                // Find JPEG Start (FF D8)
                const start = dataBuffer.indexOf(Buffer.from([0xFF, 0xD8]), offset);
                if (start === -1) break;
                
                // Find JPEG End (FF D9)
                // We look for the next FF D9
                const end = dataBuffer.indexOf(Buffer.from([0xFF, 0xD9]), start);
                if (end === -1) break;
                
                const length = end - start + 2;
                if (length > minSize) {
                  const imageBuffer = dataBuffer.subarray(start, end + 2);
                  // Validate buffer is a real image (non-empty, non-tiny)
                  const imageObj = nativeImage.createFromBuffer(imageBuffer);
                  if (imageObj.isEmpty()) {
                    console.warn('[read-file-content] skip empty carved image', { start, end, length });
                  } else {
                    const { width, height } = imageObj.getSize();
                    if (width < 8 || height < 8) {
                      console.warn('[read-file-content] skip tiny carved image', { width, height, length });
                    } else {
                      const hash = crypto.createHash('sha1').update(imageBuffer).digest('hex');
                      if (seenHashes.has(hash)) {
                        console.warn('[read-file-content] skip duplicate carved image', { hash, length, width, height });
                      } else {
                        seenHashes.add(hash);
                        const base64 = imageBuffer.toString('base64');
                        images.push(`data:image/jpeg;base64,${base64}`);
                      }
                    }
                  }
                }
                
                offset = end + 2;
              }
              console.log('[read-file-content] pdf image carve done', { found: images.length, elapsedMs: Date.now() - startTime });
            } catch (imgErr) {
              console.error('PDF Image extraction failed:', imgErr);
            }
            
            // Sanitize images to avoid undefined/blank entries
            const sanitizedImages = images.filter(img => {
              if (!img || typeof img !== 'string') return false;
              const trimmed = img.trim();
              return trimmed.startsWith('data:image/') && trimmed.length > 'data:image/jpeg;base64,'.length;
            });

            if (sanitizedImages.length !== images.length) {
              console.warn('[read-file-content] pdf image sanitized', { before: images.length, after: sanitizedImages.length });
            }

            console.log('[read-file-content] pdf result summary', { textLength: text.length, images: sanitizedImages.length, truncated });

            return { 
              success: true, 
              type: 'pdf', 
              data: { 
                text: text, 
                images: sanitizedImages,
                truncated
              } 
            };
          } catch (e) {
            if (e.code === 'MODULE_NOT_FOUND') {
              return { success: false, error: '缺少依赖: pdf-parse。请运行 npm install pdf-parse' };
            }
            console.error('[read-file-content] pdf parse error', e);
            throw e;
          }
        } else if (ext === '.xlsx' || ext === '.xls') {
          try {
            const xlsx = require('xlsx');
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            console.log('[read-file-content] excel rows', rows.length);
            
            const items = [];
            
            // Helper to check if string is URL
            const isUrl = (str) => {
              if (typeof str !== 'string') return false;
              return /^(http|https):\/\/[^ "]+$/.test(str);
            };

            // Helper to check if string is Image URL/Path
            const isImage = (str) => {
              if (typeof str !== 'string') return false;
              // Allow query params: ends with extension or extension followed by ? or #
              // Also allow data:image
              if (str.startsWith('data:image/')) return true;
              return /\.(jpg|jpeg|png|gif|webp|bmp)($|[?#])/i.test(str);
            };

            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              if (!row || row.length === 0) continue;
              
              let content = null;
              const images = [];
              
              for (let j = 0; j < row.length; j++) {
                const cell = row[j];
                if (!cell) continue;
                
                const str = String(cell).trim();
                if (!str) continue;
                
                // Check for Image
                if (isImage(str)) {
                  if (images.length < 4) {
                    images.push(str);
                  }
                  continue; 
                }
                
                // Check for Content (First text > 10 chars)
                if (content === null && str.length > 10) {
                  // Check if it's NOT just a URL (unless it's a very long URL that isn't an image?)
                  // Usually content is not just a URL.
                  // If it is a URL but not an image URL, it might be the article link.
                  // But the requirement says "text > 10 chars".
                  // Let's assume if it is a URL, it might be content if we haven't found content yet?
                  // But usually we want the body text.
                  // Let's stick to: if it's not an image, and > 10 chars, it's content.
                  
                  // Truncate to 20000
                  content = str.substring(0, 20000);
                }
              }
              
              // Only add if we found valid content
              if (content) {
                items.push({ content, images });
              }
            }
            
            return { success: true, type: 'excel', data: items };
            
          } catch (e) {
            if (e.code === 'MODULE_NOT_FOUND') {
              return { success: false, error: '缺少依赖: xlsx。请运行 npm install xlsx' };
            }
            console.error('[read-file-content] excel parse error', e);
            throw e;
          }
        } else if (ext === '.txt') {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return { success: true, type: 'txt', data: { text: sanitizeText(content), images: [] } };
          } catch (e) {
            console.error('[read-file-content] txt read error', e);
            throw e;
          }
        } else if (ext === '.md') {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            // Extract images from markdown: ![alt](url)
            const images = [];
            const regex = /!\[.*?\]\((.*?)\)/g;
            let match;
            while ((match = regex.exec(content)) !== null) {
                images.push(match[1]);
            }
            return { success: true, type: 'md', data: { text: sanitizeText(content), images } };
          } catch (e) {
            console.error('[read-file-content] md read error', e);
            throw e;
          }
        } else if (ext === '.doc') {
          try {
            const WordExtractor = require('word-extractor');
            const extractor = new WordExtractor();
            const doc = await extractor.extract(filePath);
            
            const text = sanitizeText(doc.getBody());
            const images = [];
            
            // Extract images from .doc
            const attachments = doc.getAnnotations(); // word-extractor doesn't directly expose images in a simple way, but we can try to get them from the document structure if available
            // Note: word-extractor is primarily for text. For images in .doc, it's very complex.
            // However, we can try to get images if they are stored as attachments/ole objects.
            
            // If word-extractor doesn't support images well, we'll just return text.
            // Most .doc users are okay with text-only if images are hard to get without heavy native deps.
            
            return { success: true, type: 'doc', data: { text, images } };
          } catch (e) {
            if (e.code === 'MODULE_NOT_FOUND') {
                return { success: false, error: '缺少依赖: word-extractor。请运行 cnpm install word-extractor' };
            }
            console.error('[read-file-content] doc parse error', e);
            throw e;
          }
        } else if (ext === '.docx') {
          try {
            const mammoth = require('mammoth');
            // Convert to HTML to get images (mammoth converts images to base64 by default)
            const result = await mammoth.convertToHtml({path: filePath});
            const html = result.value; 
            
            // Extract raw text for the content
            const textResult = await mammoth.extractRawText({path: filePath});
            const text = sanitizeText(textResult.value);

            // Extract images from the generated HTML
            const images = [];
            const imgRegex = /src="(data:image\/[^;]+;base64,[^"]+)"/g;
            let imgMatch;
            while ((imgMatch = imgRegex.exec(html)) !== null) {
                if (imgMatch[1] && !imgMatch[1].includes('undefined')) {
                    images.push(imgMatch[1]);
                }
            }

            return { success: true, type: 'docx', data: { text, images } };
          } catch (e) {
            if (e.code === 'MODULE_NOT_FOUND') {
                return { success: false, error: '缺少依赖: mammoth。请运行 cnpm install mammoth' };
            }
            console.error('[read-file-content] docx parse error', e);
            throw e;
          }
        }
        
        console.warn('[read-file-content] unsupported file format', { filePath, ext });
        return { success: false, error: '不支持的文件格式' };
      } catch (error) {
        console.error('[read-file-content] Fatal Error:', error);
        return { success: false, error: error.message || '读取文件时发生未知错误' };
      }
    });

    ipcMain.handle('save-history', async (event, historyItem) => {
      try {
        const historyDir = path.join(app.getPath('userData'), 'history');
        if (!fs.existsSync(historyDir)) {
          fs.mkdirSync(historyDir, { recursive: true });
        }
        
        // 处理图片保存
        if (historyItem.images && historyItem.images.length > 0) {
          const timestamp = historyItem.timestamp;
          const imagesDir = path.join(historyDir, 'images', timestamp.toString());
          
          // 确保图片目录存在
          if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
          }

          // 遍历并保存图片
          historyItem.images = historyItem.images.map((img, index) => {
            if (img.url && img.url.startsWith('data:image')) {
              try {
                // 解析 Base64 数据
                const matches = img.url.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
                if (matches) {
                  const ext = matches[1];
                  const data = matches[2];
                  const buffer = Buffer.from(data, 'base64');
                  const fileName = `image_${index}.${ext}`;
                  const filePath = path.join(imagesDir, fileName);
                  
                  fs.writeFileSync(filePath, buffer);
                  
                  // 更新 URL 为本地文件路径 (使用 file:// 协议)
                  // 注意：webSecurity: false 允许加载本地资源
                  return {
                    ...img,
                    url: `file://${filePath.replace(/\\/g, '/')}`,
                    originalUrl: img.url // 保留原始 URL (如果是 Base64 则可能太长，可视情况决定是否保留)
                  };
                }
              } catch (err) {
                console.error('保存图片失败:', err);
              }
            }
            return img;
          });
        }

        const historyFile = path.join(historyDir, 'history.json');
        let history = [];
        if (fs.existsSync(historyFile)) {
          const content = fs.readFileSync(historyFile, 'utf8');
          history = JSON.parse(content);
        }
        
        // 添加到开头
        history.unshift(historyItem);
        
        // 限制数量，比如最多50条
        if (history.length > 50) {
          // 删除超出的历史记录对应的图片文件夹
          const removedItems = history.slice(50);
          removedItems.forEach(item => {
            const itemImagesDir = path.join(historyDir, 'images', item.timestamp.toString());
            if (fs.existsSync(itemImagesDir)) {
              try {
                fs.rmSync(itemImagesDir, { recursive: true, force: true });
              } catch (e) {
                console.error('清理旧图片失败:', e);
              }
            }
          });
          
          history = history.slice(0, 50);
        }
        
        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf8');
        return { success: true };
      } catch (error) {
        console.error('保存历史记录失败:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('get-history', async () => {
      try {
        const historyFile = path.join(app.getPath('userData'), 'history', 'history.json');
        if (fs.existsSync(historyFile)) {
          const content = fs.readFileSync(historyFile, 'utf8');
          return JSON.parse(content);
        }
        return [];
      } catch (error) {
        console.error('获取历史记录失败:', error);
        return [];
      }
    });

    ipcMain.handle('delete-history', async (event, timestamp) => {
      try {
        const historyDir = path.join(app.getPath('userData'), 'history');
        const historyFile = path.join(historyDir, 'history.json');
        
        if (fs.existsSync(historyFile)) {
          const content = fs.readFileSync(historyFile, 'utf8');
          let history = JSON.parse(content);
          
          // Filter out the item with the matching timestamp
          const newHistory = history.filter(item => item.timestamp !== timestamp);
          
          // 删除对应的图片文件夹
          const imagesDir = path.join(historyDir, 'images', timestamp.toString());
          if (fs.existsSync(imagesDir)) {
            try {
              fs.rmSync(imagesDir, { recursive: true, force: true });
            } catch (e) {
              console.error('删除图片文件夹失败:', e);
            }
          }
          
          fs.writeFileSync(historyFile, JSON.stringify(newHistory, null, 2), 'utf8');
          return { success: true, data: newHistory };
        }
        return { success: false, error: 'History file not found' };
      } catch (error) {
        console.error('删除历史记录失败:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('clear-history', async () => {
      try {
        const historyDir = path.join(app.getPath('userData'), 'history');
        if (fs.existsSync(historyDir)) {
          // 删除整个 history 目录并重新创建
          fs.rmSync(historyDir, { recursive: true, force: true });
          fs.mkdirSync(historyDir, { recursive: true });
        }
        return { success: true };
      } catch (error) {
        console.error('清空历史记录失败:', error);
        return { success: false, error: error.message };
      }
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
    
    // 直接为主窗口设置自定义右键菜单
    this.setupMainWindowContextMenu(this.mainWindow);
    
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
   * 为主窗口设置自定义右键菜单
   * @param {BrowserWindow} window 主窗口实例
   */
  setupMainWindowContextMenu(window) {
    if (!window || window.isDestroyed()) {
      return;
    }

    // 等待webContents准备就绪
    if (window.webContents) {
      window.webContents.on('context-menu', async (event, params) => {
        try {
          const menu = await this.buildDynamicContextMenu(params);
          menu.popup();
        } catch (error) {
          console.error('构建右键菜单失败:', error);
          // 如果构建失败，使用一个简单的菜单
          const simpleMenu = new Menu();
          simpleMenu.append(new MenuItem({ label: '菜单构建失败', enabled: false }));
          simpleMenu.popup();
        }
      });
    } else {
      // 如果webContents还没有准备，监听did-finish-load事件
      window.webContents.once('did-finish-load', () => {
        window.webContents.on('context-menu', async (event, params) => {
          try {
            const menu = await this.buildDynamicContextMenu(params);
            menu.popup();
          } catch (error) {
            console.error('构建右键菜单失败:', error);
            // 如果构建失败，使用一个简单的菜单
            const simpleMenu = new Menu();
            simpleMenu.append(new MenuItem({ label: '菜单构建失败', enabled: false }));
            simpleMenu.popup();
          }
        });
      });
    }
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
const detectApp = new DetectApp();

// 导出应用类供外部使用
module.exports = DetectApp;
