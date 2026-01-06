const cheerio = require('cheerio');
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
      loadFailed: 0,
      transparent: 0,
      added: 0
    };
  }

  /**
   * 从原始HTML中提取图片元数据
   * @param {string} htmlContent 原始HTML内容
   * @param {string} baseUrl 基础URL
   * @returns {Map<string, Object>} 图片URL到元数据的映射
   */
  extractImageMetadata(htmlContent, baseUrl) {
    const $ = cheerio.load(htmlContent);
    const metadataMap = new Map();
    
    const allMediaElements = $('img, picture source');
    
    for (let i = 0; i < allMediaElements.length; i++) {
      const element = allMediaElements[i];
      const tagName = element.name;
      
      if (tagName === 'img' || tagName === 'source') {
        const getElementAttribute = (attrName) => {
          return $(element).attr(attrName) || 
                 $(element).attr(`data-${attrName}`) || 
                 $(element).attr(`data-lazy-${attrName}`) || 
                 $(element).attr(`data-original-${attrName}`) || 
                 $(element).attr(`data-img-${attrName}`) || 
                 $(element).attr(`data-image-${attrName}`) || 
                 $(element).attr(`data-lazyload-${attrName}`);
        };
        
        if (tagName === 'source') {
          const type = getElementAttribute('type');
          if (!type || !type.startsWith('image/')) continue;
        }
        
        const src = getElementAttribute('src');
        if (src) {
          try {
            const fullUrl = new URL(src, baseUrl).href;
            const normalizedUrl = this.urlProcessor.normalizeUrl(fullUrl);
            
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
            
            const loadFailed = $(element).attr('data-load-failed') === 'true';
            const hasTransparency = $(element).attr('data-has-transparency') === 'true';

            // 存储元数据，如果已存在则保留尺寸较大的（假设）
            if (!metadataMap.has(normalizedUrl) || (width > 0 && height > 0)) {
              metadataMap.set(normalizedUrl, { width, height, loadFailed, hasTransparency });
            }
          } catch (error) {
            // 忽略无效URL
          }
        }
      }
    }
    return metadataMap;
  }

  /**
   * 处理Readability提取的内容，过滤图片并返回清洗后的HTML和图片列表
   * @param {string} articleContent Readability提取的HTML内容
   * @param {Map<string, Object>} imageMetadataMap 图片元数据映射
   * @param {string} baseUrl 基础URL
   * @param {boolean} isWechatArticle 是否为微信文章
   * @returns {Object} { cleanedContent, images }
   */
  processReadabilityContent(articleContent, imageMetadataMap, baseUrl, isWechatArticle) {
    console.log('开始处理Readability内容中的图片...');
    this.resetFilterStats();
    
    const $ = cheerio.load(articleContent);
    const images = [];
    const uniqueImageUrls = new Set();

    // 移除视频、音频、iframe等非必要元素
    $('video, audio, iframe, embed, object').remove();

    $('img').each((i, element) => {
      const src = $(element).attr('src');
      if (!src) {
        $(element).remove();
        return;
      }

      try {
        const fullUrl = new URL(src, baseUrl).href;
        const normalizedUrl = this.urlProcessor.normalizeUrl(fullUrl);
        let metadata = imageMetadataMap.get(normalizedUrl);
        
        // 如果Map中没有，尝试直接解析当前元素属性作为备选
        if (!metadata) {
           const width = parseInt($(element).attr('width') || '0', 10);
           const height = parseInt($(element).attr('height') || '0', 10);
           metadata = { width, height, loadFailed: false, hasTransparency: false };
        }

        const { width, height, loadFailed, hasTransparency } = metadata;
        
        // 检查加载失败
        if (loadFailed) {
          this.incrementFilterCount('加载失败');
          $(element).remove();
          return;
        }

        // 检查透明度
        if (hasTransparency) {
          this.incrementFilterCount('透明图片');
          $(element).remove();
          return;
        }

        // 检查是否应该过滤
        const filterResult = this.shouldFilterImage(normalizedUrl, width, height, isWechatArticle);
        
        if (filterResult.shouldFilter) {
          this.incrementFilterCount(filterResult.reason);
          $(element).remove();
          return;
        }
        
        // 图片保留，添加到列表
        if (!uniqueImageUrls.has(normalizedUrl)) {
          uniqueImageUrls.add(normalizedUrl);
          images.push(normalizedUrl);
          this.filteredImagesCount.added++;
        }
        
        // 更新src为绝对路径，确保预览正常显示
        $(element).attr('src', normalizedUrl);
        
      } catch (error) {
        console.error(`处理图片出错: ${src}`, error);
        $(element).remove();
      }
    });


    return {
      cleanedContent: $.html(), // 返回处理后的HTML
      images: images.slice(0, 4)
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
      console.log(`过滤图片 [格式屏蔽]: ${imgUrl}`);
      return { shouldFilter: true, reason: '格式被屏蔽' };
    }
    
    // 检查域名是否在屏蔽列表中
    if (this.urlProcessor.isDomainBlocked(imgUrl)) {
      console.log(`过滤图片 [域名屏蔽]: ${imgUrl}`);
      return { shouldFilter: true, reason: '域名被屏蔽' };
    }
    
    // 图片尺寸过滤：过滤掉过小或尺寸未知的图片
    // 微信网址时额外屏蔽272x272尺寸的图片
    if (isWechatArticle && width === 272 && height === 272) {
      console.log(`过滤图片 [微信特定尺寸]: ${imgUrl} (${width}x${height})`);
      return { shouldFilter: true, reason: '微信网址272x272尺寸' };
    }
    
    // 原有过滤条件：尺寸小于201x201或尺寸未知
    if ((width > 0 && height > 0 && (width < 201 || height < 201)) || 
        (width === 0 && height === 0) || 
        (width > 4400 || height > 4400)) {
      const reason = width === 0 && height === 0 ? '尺寸未知' : '尺寸过小';
      console.log(`过滤图片 [${reason}]: ${imgUrl} (${width}x${height})`);
      return { 
        shouldFilter: true, 
        reason: reason 
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
      case '加载失败':
        this.filteredImagesCount.loadFailed++;
        break;
      case '透明图片':
        this.filteredImagesCount.transparent++;
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
      loadFailed: 0,
      transparent: 0,
      added: 0
    };
  }
    /**
     * 等待所有图片加载完成
     * @param {BrowserWindow} window 浏览器窗口
     * @returns {Promise<boolean>}
     */
  async waitForImagesLoad(window) {
    try {
      if (!window || window.isDestroyed()) {
        return false;
      }
      await window.webContents.executeJavaScript(`
        (async () => {
          // 等待所有图片加载
          await Promise.all(Array.from(document.images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
              img.onload = img.onerror = resolve;
              // 设置超时防止无限等待
              setTimeout(resolve, 3000);
            });
          }));

          // 将真实尺寸写入属性，供后续提取使用
          Array.from(document.images).forEach(img => {
            if (img.naturalWidth > 0) {
              img.setAttribute('data-real-width', img.naturalWidth);
              img.setAttribute('data-real-height', img.naturalHeight);
            }
          });
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
      if (!window || window.isDestroyed()) {
        return false;
      }
      await window.webContents.executeJavaScript(`
        (async () => {
          // 简单的滚动以触发懒加载
          const scrollStep = 500;
          const delay = 100;
          let lastHeight = 0;
          let retries = 0;
          
          while (retries < 3) {
            window.scrollBy(0, scrollStep);
            await new Promise(r => setTimeout(r, delay));
            
            const newHeight = document.body.scrollHeight;
            if (newHeight === lastHeight) {
              retries++;
            } else {
              lastHeight = newHeight;
              retries = 0;
            }
            
            if (window.scrollY + window.innerHeight >= document.body.scrollHeight) {
              break;
            }
          }
          
          // 滚回顶部
          window.scrollTo(0, 0);
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