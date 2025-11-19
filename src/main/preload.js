const { ipcRenderer } = require('electron');

/**
 * 预加载脚本 - 在渲染进程加载前执行
 * 当 contextIsolation: false 时，这些对象会直接可用于渲染进程
 */

// 在全局对象上暴露 ipcRenderer
if (!window.ipcRenderer) {
  window.ipcRenderer = {
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
    }
  };
}

