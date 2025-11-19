const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    // 移除frame: false以启用标题栏
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  // 直接加载构建后的index.html
  win.loadFile(path.join(__dirname, '../../dist/index.html')).catch((error) => {
    console.error('加载主窗口失败:', error);
    throw error;
  });
}

app.whenReady().then(() => {
  // 隐藏菜单栏
  Menu.setApplicationMenu(null);
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 存储当前正在提取的窗口和事件引用，用于取消操作
let currentExtractionWindow = null;
let currentExtractionEvent = null;
let isExtractionCancelled = false;

// 取消提取IPC通信处理
ipcMain.on('cancel-extraction', () => {
  console.log('收到取消提取请求');
  isExtractionCancelled = true;
  
  // 关闭当前提取窗口
  if (currentExtractionWindow && !currentExtractionWindow.isDestroyed()) {
    try {
      currentExtractionWindow.destroy();
      console.log('已关闭提取窗口');
    } catch (e) {
      console.error('关闭窗口时出错:', e);
    }
  }
  
  // 通知渲染进程提取已取消
  if (currentExtractionEvent) {
    currentExtractionEvent.sender.send('extraction-cancelled');
  }
  
  // 重置状态
  currentExtractionWindow = null;
  currentExtractionEvent = null;
});

// 内容提取IPC通信处理
ipcMain.on('extract-content', async (event, url) => {
  // 重置取消标志
  isExtractionCancelled = false;
  currentExtractionEvent = event;
  currentExtractionWindow = null;
  
  try {
    // 先检查URL是否指向图像文件
    const headResponse = await fetch(url, { method: 'HEAD' });
    const contentType = headResponse.headers.get('Content-Type') || '';
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const search = urlObj.search.toLowerCase();
    const imageExtensions = ['.webp', '.jpg', '.jpeg', '.png'];
    const isImageExtension = imageExtensions.some(ext => pathname.endsWith(ext) || search.endsWith(ext));
    
    if (contentType.startsWith('image/') || isImageExtension) {
      // 如果URL指向图像文件，直接返回图像结果
      event.sender.send('extract-content-result', {
        success: true,
        title: '图像文件',
        content: 'URL指向图像文件',
        images: [url],
        url: url
      });
      return;
    }

    // 检测是否为微信文章
    const isWechatArticle = url.includes('mp.weixin.qq.com');
    
    // 检查是否已取消
    if (isExtractionCancelled) {
      throw new Error('提取已取消');
    }
    
    // 创建隐藏的浏览器窗口用于加载动态内容
    let win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: false,
        allowRunningInsecureContent: true
      },
      // 设置微信浏览器用户代理，避免被检测
      userAgent
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0)'
    });
    
    // 存储当前提取窗口引用
    currentExtractionWindow = win;

    // 页面加载重试机制
    const maxRetries = isWechatArticle ? 5 : 3; // 微信文章增加重试次数
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`尝试加载URL（第${attempt}次）: ${url}`);
        
        // 等待页面加载完成
        await new Promise((resolve, reject) => {
          let loadTimeout;
          
          const cleanup = () => {
            if (loadTimeout) clearTimeout(loadTimeout);
            win.webContents.removeListener('did-finish-load', onLoadSuccess);
            win.webContents.removeListener('did-fail-load', onLoadFail);
            win.webContents.removeListener('did-stop-loading', onStopLoading);
          };

          const onLoadSuccess = async () => {
            console.log(`页面加载成功: ${url}`);
            // 清除 did-stop-loading 设置的超时，因为页面已经加载完成
            if (loadTimeout) {
              clearTimeout(loadTimeout);
              loadTimeout = null;
            }
            
            try {
              // 对于微信文章，需要等待更长时间确保内容完全加载
              if (isWechatArticle) {
                // 等待微信文章内容区域加载
                await win.webContents.executeJavaScript(`
                  (async function() {
                    // 等待微信文章主要内容区域出现
                    let retries = 0;
                    while (retries < 40) { // 增加重试次数到40次
                      const articleContent = document.querySelector('#js_content, .rich_media_content, .article-content');
                      if (articleContent && articleContent.textContent.trim().length > 50) { // 降低文本长度要求到50
                        // 检查内容是否真的加载完成
                        const images = articleContent.querySelectorAll('img');
                        let imagesLoaded = true;
                        
                        // 检查图片是否加载完成
                        for (let img of images) {
                          if (!img.complete && img.src) {
                            imagesLoaded = false;
                            break;
                          }
                        }
                        
                        if (imagesLoaded) {
                          break;
                        }
                      }
                      await new Promise(resolve => setTimeout(resolve, 500));
                      retries++;
                    }
                    // 额外等待1秒确保动态内容加载完成
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return true;
                  })()
                `);
                console.log(`微信文章内容加载完成: ${url}`);
              }
              
              // 等待DOM完全加载并获取图片真实尺寸
              const extraWaitTime = isWechatArticle ? 2000 : 2000;
              await win.webContents.executeJavaScript(`
                (async function() {
                  // 等待所有图片加载完成
                  const images = Array.from(document.querySelectorAll('img'));
                  const imagePromises = images.map(img => {
                    return new Promise((resolve) => {
                      if (img.complete) {
                        // 图片已加载，直接获取尺寸
                        const width = img.naturalWidth || img.width || 0;
                        const height = img.naturalHeight || img.height || 0;
                        img.setAttribute('data-real-width', width);
                        img.setAttribute('data-real-height', height);
                        resolve();
                      } else {
                        // 等待图片加载完成
                        img.onload = () => {
                          const width = img.naturalWidth || img.width || 0;
                          const height = img.naturalHeight || img.height || 0;
                          img.setAttribute('data-real-width', width);
                          img.setAttribute('data-real-height', height);
                          resolve();
                        };
                        img.onerror = () => {
                          // 加载失败，设置为0
                          img.setAttribute('data-real-width', '0');
                          img.setAttribute('data-real-height', '0');
                          resolve();
                        };
                        // 设置超时，避免无限等待
                        setTimeout(() => {
                          const width = img.naturalWidth || img.width || 0;
                          const height = img.naturalHeight || img.height || 0;
                          img.setAttribute('data-real-width', width);
                          img.setAttribute('data-real-height', height);
                          resolve();
                        }, 2000);
                      }
                    });
                  });
                  
                  // 等待所有图片处理完成，微信文章等待更长时间
                  await Promise.all(imagePromises);
                  
                  // 额外等待确保动态内容加载完成
                  await new Promise(resolve => setTimeout(resolve, ${extraWaitTime}));
                  
                  return true;
                })()
              `);
              console.log(`图片真实尺寸获取完成: ${url}`);
            } catch (error) {
              console.error(`获取图片真实尺寸时出错: ${error.message}`);
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
            // 如果已经触发了 did-finish-load，就不需要设置超时了
            // did-stop-loading 可能在 did-finish-load 之后触发
            // 设置一个较长的超时作为兜底，但会在 onLoadSuccess 中被清除
            const timeout = isWechatArticle ? 12000 : 6000; // 微信12秒，其他6秒
            if (loadTimeout) {
              clearTimeout(loadTimeout);
            }
            loadTimeout = setTimeout(() => {
              console.error(`页面加载超时: ${url}`);
              cleanup();
              reject(new Error(`Page load timeout: ${url}`));
            }, timeout);
          };

          win.webContents.once('did-finish-load', onLoadSuccess);
          win.webContents.once('did-fail-load', onLoadFail);
          win.webContents.once('did-stop-loading', onStopLoading);

          win.loadURL(url).catch((error) => {
            console.error(`加载URL异常: ${error.message}`);
            cleanup();
            reject(error);
          });
        });
        
        console.log(`页面加载完成: ${url}`);
        break; // 成功则跳出重试循环
        
      } catch (error) {
        lastError = error;
        console.error(`第${attempt}次加载失败:`, error.message);
        
        if (attempt < maxRetries) {
          const waitTime = isWechatArticle ? 3000 : 2000; // 微信文章等待更长时间
          console.log(`等待${waitTime/1000}秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          // 重新创建窗口以清理状态
          if (win && !win.isDestroyed()) {
            try {
              win.destroy();
            } catch (e) {
              // 忽略销毁错误
            }
          }
          
          // 创建新的浏览器窗口
          win = new BrowserWindow({
            width: 1200,
            height: 800,
            show: false,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
              webSecurity: false,
              allowRunningInsecureContent: true
            },
            userAgent: isWechatArticle 
              ? 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.47.2560(Android 13;SM-G998B)'
              : 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36 MicroMessenger/6.5.2.501 NetType/WIFI WindowsWechat QBCore/3.43.884.400 QQBrowser/9.0.2524.400)'
          });
        }
      }
    }

    // 如果所有重试都失败，抛出最后一个错误
    if (lastError) {
      throw new Error(`无法加载页面，经过${maxRetries}次重试后失败: ${lastError.message}`);
    }

    // 获取完整HTML内容，添加重试机制
    let htmlContent;
    let jsRetryAttempts = 0;
    const maxJSReruns = 3; // 增加重试次数到3次
    
    while (jsRetryAttempts < maxJSReruns) {
      try {
        console.log(`尝试获取HTML内容（第${jsRetryAttempts + 1}次）`);
        
        htmlContent = await win.webContents.executeJavaScript(`
          (function() {
            try {
              // 检查页面是否真的加载完成
              if (document.readyState !== 'complete') {
                throw new Error('Page not fully loaded');
              }
              
              // 检查是否有明显的内容
              const bodyText = document.body ? document.body.textContent.trim() : '';
              const images = document.querySelectorAll('img');
              const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
              
              console.log('页面状态检查:', {
                readyState: document.readyState,
                bodyTextLength: bodyText.length,
                imagesCount: images.length,
                headingsCount: headings.length
              });
              
              // 对于微信文章，使用更宽松的判断条件
              const isWechatArticle = document.querySelector('#js_content, .rich_media_content, .article-content');
              const minTextLength = isWechatArticle ? 50 : 100;
              const minImagesCount = isWechatArticle ? 1 : 0;
              
              // 如果内容太少，可能需要等待
              if (bodyText.length < minTextLength && images.length < minImagesCount && headings.length === 0) {
                console.log('页面内容过少，等待2秒后重试');
                setTimeout(() => {}, 2000);
              }
              
              return document.documentElement.outerHTML;
            } catch (error) {
              console.error('JavaScript执行错误:', error.message);
              throw error;
            }
          })()
        `);
        
        if (htmlContent && htmlContent.length > 300) { // 降低最小长度要求到300
          console.log(`成功获取HTML内容，长度: ${htmlContent.length}`);
          break;
        } else {
          console.warn(`HTML内容过短，长度: ${htmlContent ? htmlContent.length : 0}，重试中...`);
          jsRetryAttempts++;
          if (jsRetryAttempts < maxJSReruns) {
            await new Promise(resolve => setTimeout(resolve, 1500)); // 缩短等待时间到1.5秒
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
    
    if (!htmlContent || htmlContent.length < 500) {
      throw new Error(`HTML内容无效或过短，长度: ${htmlContent ? htmlContent.length : 0}`);
    }

    // 关闭窗口
    win.destroy();

    // 使用Readability提取文章内容
    const dom = new JSDOM(htmlContent, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    // 检查是否成功解析文章
    if (!article) {
      throw new Error('无法解析文章内容');
    }

    // 使用Cheerio提取图片
    const cheerio = require('cheerio');
    const $ = cheerio.load(htmlContent);
    const images = [];
    const filteredImagesCount = {
      total: 0,
      tooSmall: 0,
      blockedFormat: 0,
      blockedDomain: 0,
      added: 0
    };
    const uniqueImageUrls = new Set(); // 用于存储唯一图片URL

    // 屏蔽列表配置
    const blockedFormats = ['gif', 'svg']; // 屏蔽的图片格式
    const blockedDomains = [ // 屏蔽的域名列表
      'example-blocked.com',
      'adserver.com',
      // 可以在这里添加更多需要屏蔽的域名
    ];

    // 辅助函数：标准化URL，去除片段部分(#后的内容)并按字母顺序排序参数
    const normalizeUrl = (urlString) => {
      try {
        const url = new URL(urlString);
        url.hash = '';
        
        // 按字母顺序排序URL参数
        const params = new URLSearchParams(url.search);
        const sortedParams = new URLSearchParams();
        
        // 确保参数按键名的ASCII字母顺序排序
        Array.from(params.entries())
          .sort(([keyA], [keyB]) => keyA.localeCompare(keyB, 'en-US'))
          .forEach(([key, value]) => sortedParams.append(key, value));
        
        url.search = sortedParams.toString();
        return url.href;
      } catch (error) {
        // 如果URL解析失败，返回原始URL
        console.error('URL标准化失败:', urlString, error);
        return urlString;
      }
    };

    // 处理所有图片，包括 <img> 和 <picture> 中的 WebP
    const allMediaElements = $('img, picture source');
    
    for (let i = 0; i < allMediaElements.length; i++) {
        const element = allMediaElements[i];
        const tagName = element.name;
        
        // 根据标签类型提取URL
        let elementUrls = [];
        
        if (tagName === 'img' || tagName === 'source') {
          // 获取元素属性的函数
          const getElementAttribute = (attrName) => {
            return $(element).attr(attrName) || 
                   $(element).attr(`data-${attrName}`) || 
                   $(element).attr(`data-lazy-${attrName}`) || 
                   $(element).attr(`data-original-${attrName}`) || 
                   $(element).attr(`data-img-${attrName}`) || 
                   $(element).attr(`data-image-${attrName}`) || 
                   $(element).attr(`data-lazyload-${attrName}`);
          };
          
          // 处理source标签时只处理图像类型
          if (tagName === 'source') {
            const type = getElementAttribute('type');
            if (!type || !type.startsWith('image/')) continue;
          }
          
          // 提取主要URL
          const src = getElementAttribute('src');
          if (src) {
            try {
              const fullUrl = new URL(src, url).href;
              const normalizedUrl = normalizeUrl(fullUrl);
              
              // 优先获取真实尺寸（在DOM加载完成后设置），否则使用元素属性
              const width = parseInt(
                $(element).attr('data-real-width') ||
                $(element).attr('width') || 
                $(element).attr('data-width') || 
                $(element).attr('data-original-width') || 
                $(element).attr('data-lazy-width') || 
                '0', 10
              );
              const height = parseInt(
                $(element).attr('data-real-height') ||
                $(element).attr('height') || 
                $(element).attr('data-height') || 
                $(element).attr('data-original-height') || 
                $(element).attr('data-lazy-height') || 
                '0', 10
              );
              
              console.log(`提取到图片URL: ${normalizedUrl}, 尺寸: ${width}x${height}`);
              
              elementUrls.push({ url: normalizedUrl, width: width, height: height });
            } catch (error) {
              // 跳过无效URL
              console.error(`跳过无效URL: ${src}, 错误: ${error.message}`);
              continue;
            }
          }
          
          // 提取srcset中的所有URL
          const srcset = getElementAttribute('srcset');
          if (srcset) {
            const sources = srcset.split(',');
            for (const source of sources) {
              const parts = source.trim().split(' ');
              const urlPart = parts[0];
              if (!urlPart) continue;
              
              try {
                const fullUrl = new URL(urlPart, url).href;
                const normalizedUrl = normalizeUrl(fullUrl);
                
                // 优先获取真实尺寸（在DOM加载完成后设置），否则使用元素属性作为后备
                const width = parseInt(
                  $(element).attr('data-real-width') ||
                  $(element).attr('width') || 
                  $(element).attr('data-width') || 
                  $(element).attr('data-original-width') || 
                  $(element).attr('data-lazy-width') || 
                  '0', 10
                );
                const height = parseInt(
                  $(element).attr('data-real-height') ||
                  $(element).attr('height') || 
                  $(element).attr('data-height') || 
                  $(element).attr('data-original-height') || 
                  $(element).attr('data-lazy-height') || 
                  '0', 10
                );
                
                console.log(`从srcset提取到图片URL: ${normalizedUrl}, 尺寸: ${width}x${height}`);
                
                elementUrls.push({ url: normalizedUrl, width: width, height: height });
              } catch (error) {
                // 跳过无效URL
                console.error(`跳过无效URL (srcset): ${urlPart}, 错误: ${error.message}`);
                continue;
              }
            }
          }
        } else {
          // 其他标签类型，跳过
          continue;
        }
        
        // 对每个提取到的 URL 应用过滤逻辑
        for (const imgInfo of elementUrls) {
          filteredImagesCount.total++;
          const { url: imgUrl, width: finalWidth, height: finalHeight } = imgInfo;
          
          // 检查图片格式是否在屏蔽列表中
          try {
            const parsedUrl = new URL(imgUrl);
            const pathname = parsedUrl.pathname.toLowerCase();
            const ext = pathname.split('.').pop();
            if (blockedFormats.includes(ext)) {
              filteredImagesCount.blockedFormat++;
              console.log(`过滤图片（格式被屏蔽）: ${imgUrl}, 格式: ${ext}`);
              continue;
            }
          } catch (error) {
            // URL解析失败时使用简单的后缀检查作为后备
            const lowerUrl = imgUrl.toLowerCase();
            if (blockedFormats.some(format => lowerUrl.endsWith(`.${format}`))) {
              filteredImagesCount.blockedFormat++;
              console.log(`过滤图片（格式被屏蔽）: ${imgUrl}`);
              continue;
            }
          }
          
          // 检查域名是否在屏蔽列表中
          try {
            const parsedUrl = new URL(imgUrl);
            const hostname = parsedUrl.hostname.toLowerCase();
            if (blockedDomains.some(blocked => hostname.includes(blocked))) {
              filteredImagesCount.blockedDomain++;
              console.log(`过滤图片（域名被屏蔽）: ${imgUrl}, 域名: ${hostname}`);
              continue;
            }
          } catch (error) {
            // URL解析失败，跳过域名检查
          }
          
          // 过滤任意一边尺寸小于180的图片，或者宽高都为0的图片
          if ((finalWidth > 0 && finalHeight > 0 && (finalWidth < 180 || finalHeight < 180)) || (finalWidth === 0 && finalHeight === 0)) {
            filteredImagesCount.tooSmall++;
            if (finalWidth === 0 && finalHeight === 0) {
              console.log(`过滤图片（尺寸未知）: ${imgUrl}, 尺寸: ${finalWidth}x${finalHeight}`);
            } else {
              console.log(`过滤图片（尺寸太小，任意一边小于180）: ${imgUrl}, 尺寸: ${finalWidth}x${finalHeight}`);
            }
            continue;
          }
          
          // 将符合条件的图片 URL 添加到结果中（去重）
          const normalizedUrl = normalizeUrl(imgUrl);
          if (!uniqueImageUrls.has(normalizedUrl)) {
            uniqueImageUrls.add(normalizedUrl);
            images.push(imgUrl);
            filteredImagesCount.added++;
            console.log(`添加图片: ${imgUrl}, 尺寸: ${finalWidth}x${finalHeight}`);
            if (images.length >= 10) break;
          }
        }
        
        if (images.length >= 10) break;
      }
      
      // 输出过滤统计信息
      console.log(`图片过滤统计:`);
      console.log(`- 总图片数: ${filteredImagesCount.total}`);
      console.log(`- 格式被屏蔽: ${filteredImagesCount.blockedFormat}`);
      console.log(`- 域名被屏蔽: ${filteredImagesCount.blockedDomain}`);
      console.log(`- 尺寸过小过滤: ${filteredImagesCount.tooSmall}`);
      console.log(`- 最终添加: ${filteredImagesCount.added}`);

    // 限制提取的内容长度（改为20000字符）
    const MAX_CONTENT_LENGTH = 20000;
    const content = article?.textContent ? (article.textContent.length > MAX_CONTENT_LENGTH ? `${article.textContent.substring(0, MAX_CONTENT_LENGTH)}...` : article.textContent) : '';

    event.sender.send('extract-content-result', {
      success: true,
      title: article?.title || '',
      content: content,
      images: images.slice(0, 10), // 最多提取10张图片
      url: url
    });
  } catch (error) {
    console.error('内容提取失败:', error);
    event.sender.send('extract-content-result', {
      success: false,
      error: `内容提取失败: ${error.message}`
    });
  }
});

// 清理浏览器数据
ipcMain.handle('clear-browser-data', async () => {
  try {
    const browserWindow = BrowserWindow.getFocusedWindow();
    if (!browserWindow) {
      return { success: false, error: '没有找到聚焦的窗口' };
    }
    
    const session = browserWindow.webContents.session;
    
    // 清理所有指定类型的数据，包括cookies
    await session.clearStorageData({
      storages: [
        'cookies',
        'localstorage',
        'sessionstorage',
        'indexdb',
        'websql',
        'cachestorage'
      ]
    });
    
    return { success: true };
  } catch (error) {
    console.error('清理浏览器数据失败:', error);
    return { success: false, error: error.message };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});