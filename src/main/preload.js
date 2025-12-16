const { contextBridge, ipcRenderer, webFrame } = require('electron');

/**
 * 预加载脚本 - 在渲染进程加载前执行
 * 通过 contextBridge 安全地向渲染进程暴露API
 */

// 核心API - 只保留必要的IPC操作
contextBridge.exposeInMainWorld('electronAPI', {
  // IPC通信方法
  send: (channel, ...args) => {
    ipcRenderer.send(channel, ...args);
  },
  on: (channel, listener) => {
    ipcRenderer.on(channel, listener);
  },
  once: (channel, listener) => {
    ipcRenderer.once(channel, listener);
  },
  off: (channel, listener) => {
    ipcRenderer.off(channel, listener);
  },
  removeListener: (channel, listener) => {
    ipcRenderer.removeListener(channel, listener);
  },
  invoke: (channel, ...args) => {
    return ipcRenderer.invoke(channel, ...args);
  },
  // 缩放控制
  setZoomFactor: (factor) => {
    webFrame.setZoomFactor(factor);
  },
  // 打开外部链接
  openExternal: (url) => {
    ipcRenderer.send('open-external', url);
  }
});

