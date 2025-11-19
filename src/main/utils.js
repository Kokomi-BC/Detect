/**
 * 工具函数集合 - 提供通用的工具方法
 */

/**
 * 等待指定时间
 * @param {number} ms 等待时间（毫秒）
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试执行函数
 * @param {Function} fn 要执行的函数
 * @param {number} maxRetries 最大重试次数
 * @param {number} delay 初始延迟时间（毫秒）
 * @param {Function} isRetryCondition 可选的retry条件检查函数
 * @returns {Promise}
 */
async function retry(fn, maxRetries = 3, delay = 1000, isRetryCondition = null) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`第${attempt}次尝试失败:`, error.message);
      
      if (attempt < maxRetries) {
        // 检查是否应该重试
        if (isRetryCondition && !isRetryCondition(error)) {
          throw error;
        }
        
        const waitTime = delay * Math.pow(1.5, attempt - 1); // 指数退避
        console.log(`等待${waitTime}ms后重试...`);
        await sleep(waitTime);
      }
    }
  }
  
  throw lastError;
}

/**
 * 安全的JSON解析
 * @param {string} jsonString JSON字符串
 * @param {any} defaultValue 解析失败时返回的默认值
 * @returns {any}
 */
function safeJsonParse(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('JSON解析失败:', error);
    return defaultValue;
  }
}

/**
 * 安全的URL解析
 * @param {string} urlString URL字符串
 * @param {string} baseUrl 基础URL
 * @returns {URL|null}
 */
function safeUrlParse(urlString, baseUrl = null) {
  try {
    return new URL(urlString, baseUrl);
  } catch (error) {
    console.error('URL解析失败:', urlString, error);
    return null;
  }
}

/**
 * 限制文本长度
 * @param {string} text 原始文本
 * @param {number} maxLength 最大长度
 * @param {string} suffix 截断后添加的后缀
 * @returns {string}
 */
function truncateText(text, maxLength = 20000, suffix = '...') {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * 清理HTML标签
 * @param {string} html HTML字符串
 * @returns {string}
 */
function stripHtmlTags(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }
  
  return html.replace(/<[^>]*>/g, '');
}

/**
 * 格式化文件大小
 * @param {number} bytes 字节数
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 检查是否为有效的邮箱地址
 * @param {string} email 邮箱地址
 * @returns {boolean}
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 生成随机ID
 * @param {number} length ID长度
 * @returns {string}
 */
function generateRandomId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 深度克隆对象
 * @param {any} obj 要克隆的对象
 * @returns {any}
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  
  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  
  return cloned;
}

/**
 * 防抖函数
 * @param {Function} func 要执行的函数
 * @param {number} delay 延迟时间
 * @returns {Function}
 */
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * 节流函数
 * @param {Function} func 要执行的函数
 * @param {number} limit 时间限制
 * @returns {Function}
 */
function throttle(func, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 将错误对象转换为可序列化的格式
 * @param {Error} error 错误对象
 * @returns {Object}
 */
function serializeError(error) {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: error.code
  };
}

/**
 * 检查对象是否为空
 * @param {any} obj 要检查的对象
 * @returns {boolean}
 */
function isEmpty(obj) {
  if (obj == null) return true;
  if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
}

/**
 * 从URL中提取域名
 * @param {string} url URL字符串
 * @returns {string}
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return '';
  }
}

/**
 * 格式化日期
 * @param {Date} date 日期对象
 * @param {string} format 格式字符串
 * @returns {string}
 */
function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

module.exports = {
  sleep,
  retry,
  safeJsonParse,
  safeUrlParse,
  truncateText,
  stripHtmlTags,
  formatFileSize,
  isValidEmail,
  generateRandomId,
  deepClone,
  debounce,
  throttle,
  serializeError,
  isEmpty,
  extractDomain,
  formatDate
};