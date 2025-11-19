/**
 * URL处理器 - 负责URL的验证、标准化和处理
 */
class URLProcessor {
  constructor() {
    this.imageExtensions = ['.webp', '.jpg', '.jpeg', '.png'];
    this.blockedFormats = ['gif', 'svg'];
    this.blockedDomains = [
      'mmbiz.qlogo.cn',
      'avatar.bdstatic.com',
      't11.baidu.com',
      't12.baidu.com',
      't10.baidu.com',
      'i-operation.csdnimg.cn',
      'g.csdnimg.cn',
      'res.wx.qq.com'
    ];
  }

  /**
   * 检查URL是否指向图像文件
   * @param {string} url 要检查的URL
   * @returns {boolean}
   */
  isImageUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      const search = urlObj.search.toLowerCase();
      
      return this.imageExtensions.some(ext => 
        pathname.endsWith(ext) || search.includes(ext)
      );
    } catch (error) {
      console.error('URL检查失败:', error);
      return false;
    }
  }

  /**
   * 检查URL是否为微信文章
   * @param {string} url 要检查的URL
   * @returns {boolean}
   */
  isWechatArticle(url) {
    return url.includes('mp.weixin.qq.com');
  }

  /**
   * 检查URL的域名是否被屏蔽
   * @param {string} url 要检查的URL
   * @returns {boolean}
   */
  isDomainBlocked(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      return this.blockedDomains.some(blocked => hostname.includes(blocked));
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查图片格式是否被屏蔽
   * @param {string} url 要检查的URL
   * @returns {boolean}
   */
  isImageFormatBlocked(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      const ext = pathname.split('.').pop();
      return this.blockedFormats.includes(ext);
    } catch (error) {
      // URL解析失败时使用简单的后缀检查作为后备
      const lowerUrl = url.toLowerCase();
      return this.blockedFormats.some(format => lowerUrl.endsWith(`.${format}`));
    }
  }

  /**
   * 标准化URL，去除片段部分并排序参数
   * @param {string} urlString 要标准化的URL
   * @returns {string}
   */
  normalizeUrl(urlString) {
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
  }

  /**
   * 获取URL的Content-Type
   * @param {string} url 要检查的URL
   * @returns {Promise<string>}
   */
  async getContentType(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.headers.get('Content-Type') || '';
    } catch (error) {
      console.error('获取Content-Type失败:', error);
      return '';
    }
  }

  /**
   * 检查URL是否为有效的图像资源
   * @param {string} url 要检查的URL
   * @returns {Promise<boolean>}
   */
  async isValidImageResource(url) {
    try {
      // 检查Content-Type
      const contentType = await this.getContentType(url);
      if (contentType.startsWith('image/')) {
        return true;
      }

      // 检查URL扩展名
      if (this.isImageUrl(url)) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('检查图像资源失败:', error);
      return false;
    }
  }

  /**
   * 根据URL类型返回合适的用户代理
   * @param {string} url 要处理的URL
   * @returns {string}
   */
  getUserAgentForUrl(url) {
    if (this.isWechatArticle(url)) {
      return 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.47.2560(Android 13;SM-G998B)';
    }
    
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0';
  }

  /**
   * 解析srcset字符串中的所有URL
   * @param {string} srcset srcset字符串
   * @param {string} baseUrl 基础URL
   * @returns {Array<Object>}
   */
  parseSrcset(srcset, baseUrl) {
    const urls = [];
    const sources = srcset.split(',');
    
    for (const source of sources) {
      const parts = source.trim().split(' ');
      const urlPart = parts[0];
      if (!urlPart) continue;
      
      try {
        const fullUrl = new URL(urlPart, baseUrl).href;
        const normalizedUrl = this.normalizeUrl(fullUrl);
        
        // 提取描述符（如 1x, 2x, 300w等）
        const descriptors = {};
        for (let i = 1; i < parts.length; i++) {
          const part = parts[i];
          if (part.includes('x')) {
            descriptors.density = parseFloat(part);
          } else if (part.includes('w')) {
            descriptors.width = parseInt(part.replace('w', ''));
          } else if (part.includes('h')) {
            descriptors.height = parseInt(part.replace('h', ''));
          }
        }
        
        urls.push({
          url: normalizedUrl,
          descriptors
        });
      } catch (error) {
        console.error(`解析srcset URL失败: ${urlPart}`, error);
        continue;
      }
    }
    
    return urls;
  }
}

module.exports = URLProcessor;