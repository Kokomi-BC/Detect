// 内容获取辅助函数（renderer 端）
// 提供：
// - getLeftInputContent(text, images) -> 返回 { text, images }
// - getUrlExtractedContent(url) -> 通过 IPC 请求主进程提取内容，并返回结果 Promise

function getLeftInputContent(text = '', images = []) {
  return Promise.resolve({
    text: text || '',
    images: Array.isArray(images) ? images : []
  });
}

function getUrlExtractedContent(url) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error('empty url'));

    // 监听一次结果事件
    const handler = (event, result) => {
      // result 应包含 { success, title, content, images, url }
      resolve(result);
    };

    // 在 renderer 端通过 exposed electronAPI 注册一次性监听器
    window.electronAPI.once('extract-content-result', handler);

    // 发送请求给主进程（主进程的 ExtractionManager 会处理并发送回结果）
    window.electronAPI.send('extract-content', url);
  });
}

module.exports = {
  getLeftInputContent,
  getUrlExtractedContent,
};
