const cheerio = require('cheerio');
const { sleep } = require('./utils');
const URLProcessor = require('./urlProcessor');

/**
 * 图片提取器 - 负责从HTML中提取和过滤图片
 */
class ImageExtractor {
  constructor() {
    this.urlProcessor = new URLProcessor();
    this.filteredImagesCount = {
      total: 0,
      tooSmall: 0,
      blockedFormat: 0,
      blockedDomain: 0,
      added: 0
    };
  }

  /**
   * 从HTML中提取图片
   * @param {string} htmlContent HTML内容
   * @param {string} baseUrl 基础URL
   * @param {boolean} isWechatArticle 是否为微信文章
   * @returns {Promise<Object>}
   */
  async extractImages(htmlContent, baseUrl, isWechatArticle = false) {
    console.log('开始提取图片...');
    
    // 重置统计信息
    this.resetFilterStats();
    
    const $ = cheerio.load(htmlContent);
    const images = [];
    const uniqueImageUrls = new Set(); // 用于存储唯一图片URL

    // 处理所有图片，包括 <img> 和 <picture> 中的 WebP
    const allMediaElements = $('img, picture source');
    
    for (let i = 0; i < allMediaElements.length; i++) {
      const element = allMediaElements[i];
      const tagName = element.name;
      
      // 根据标签类型提取URL
      const elementUrls = [];
      
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
            const fullUrl = new URL(src, baseUrl).href;
            const normalizedUrl = this.urlProcessor.normalizeUrl(fullUrl);
            
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
          const srcsetUrls = this.urlProcessor.parseSrcset(srcset, baseUrl);
          for (const srcsetUrl of srcsetUrls) {
            // 优先获取真实尺寸
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
            
            elementUrls.push({ 
              url: srcsetUrl.url, 
              width: width, 
              height: height,
              descriptors: srcsetUrl.descriptors
            });
          }
        }
      }
      
      // 对每个提取到的 URL 应用过滤逻辑
      for (const imgInfo of elementUrls) {
        this.filteredImagesCount.total++;
        const { url: imgUrl, width: finalWidth, height: finalHeight } = imgInfo;
        
        // 检查是否应该过滤这个图片
        const filterResult = this.shouldFilterImage(imgUrl, finalWidth, finalHeight, isWechatArticle);
        
        if (filterResult.shouldFilter) {
          this.incrementFilterCount(filterResult.reason);
          console.log(`过滤图片（${filterResult.reason}）: ${imgUrl}, 尺寸: ${finalWidth}x${finalHeight}`);
          continue;
        }
        
        // 将符合条件的图片 URL 添加到结果中（去重）
        const normalizedUrl = this.urlProcessor.normalizeUrl(imgUrl);
        if (!uniqueImageUrls.has(normalizedUrl)) {
          uniqueImageUrls.add(normalizedUrl);
          images.push(imgUrl);
          this.filteredImagesCount.added++;
          console.log(`添加图片: ${imgUrl}, 尺寸: ${finalWidth}x${finalHeight}`);
          if (images.length >= 10) break;
        }
      }
      
      if (images.length >= 10) break;
    }
    
    // 输出过滤统计信息
    this.logFilterStats();
    
    return {
      images: images.slice(0, 10), // 最多提取10张图片
      stats: this.filteredImagesCount
    };
  }

  /**
   * 检查图片是否应该被过滤
   * @param {string} imgUrl 图片URL
   * @param {number} width 图片宽度
   * @param {number} height 图片高度
   * @param {boolean} isWechatArticle 是否为微信文章
   * @returns {Object}
   */
  shouldFilterImage(imgUrl, width, height, isWechatArticle) {
    // 检查图片格式是否在屏蔽列表中
    if (this.urlProcessor.isImageFormatBlocked(imgUrl)) {
      return { shouldFilter: true, reason: '格式被屏蔽' };
    }
    
    // 检查域名是否在屏蔽列表中
    if (this.urlProcessor.isDomainBlocked(imgUrl)) {
      return { shouldFilter: true, reason: '域名被屏蔽' };
    }
    
    // 图片尺寸过滤：过滤掉过小或尺寸未知的图片
    // 微信网址时额外屏蔽272x272尺寸的图片
    if (isWechatArticle && width === 272 && height === 272) {
      return { shouldFilter: true, reason: '微信网址272x272尺寸' };
    }
    
    // 原有过滤条件：尺寸小于201x201或尺寸未知
    if ((width > 0 && height > 0 && (width < 201 || height < 201)) || 
        (width === 0 && height === 0) || 
        (width > 4400 || height > 4400)) {
      return { 
        shouldFilter: true, 
        reason: width === 0 && height === 0 ? '尺寸未知' : '尺寸过小' 
      };
    }
    
    return { shouldFilter: false, reason: '' };
  }

  /**
   * 增加过滤计数
   * @param {string} reason 过滤原因
   */
  incrementFilterCount(reason) {
    switch (reason) {
      case '格式被屏蔽':
        this.filteredImagesCount.blockedFormat++;
        break;
      case '域名被屏蔽':
        this.filteredImagesCount.blockedDomain++;
        break;
      case '尺寸未知':
      case '尺寸过小':
        this.filteredImagesCount.tooSmall++;
        break;
    }
  }

  /**
   * 重置过滤统计信息
   */
  resetFilterStats() {
    this.filteredImagesCount = {
      total: 0,
      tooSmall: 0,
      blockedFormat: 0,
      blockedDomain: 0,
      added: 0
    };
  }

  /**
   * 记录过滤统计信息
   */
  logFilterStats() {
    console.log('图片过滤统计:');
    console.log(`- 总图片数: ${this.filteredImagesCount.total}`);
    console.log(`- 格式被屏蔽: ${this.filteredImagesCount.blockedFormat}`);
    console.log(`- 域名被屏蔽: ${this.filteredImagesCount.blockedDomain}`);
    console.log(`- 尺寸过小过滤: ${this.filteredImagesCount.tooSmall}`);
    console.log(`- 最终添加: ${this.filteredImagesCount.added}`);
  }

  /**
   * 等待所有图片加载完成
   * @param {BrowserWindow} window 浏览器窗口
   * @param {boolean} isWechatArticle 是否为微信文章
   * @returns {Promise<boolean>}
   */
  async waitForImagesLoad(window, isWechatArticle = false) {
    try {
      const extraWaitTime = isWechatArticle ? 2000 : 2000;
      
      await window.webContents.executeJavaScript(`
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
      
      console.log('图片真实尺寸获取完成');
      return true;
    } catch (error) {
      console.error('获取图片真实尺寸时出错:', error.message);
      return false;
    }
  }

  /**
   * 等待微信文章内容加载
   * @param {BrowserWindow} window 浏览器窗口
   * @returns {Promise<boolean>}
   */
  async waitForWechatContent(window) {
    try {
      await window.webContents.executeJavaScript(`
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
      
      console.log('微信文章内容加载完成');
      return true;
    } catch (error) {
      console.error('等待微信内容加载时出错:', error.message);
      return false;
    }
  }
}

module.exports = ImageExtractor;