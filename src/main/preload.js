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

// 注入加载动画
window.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    #app-loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: var(--app-loading-bg, #fff);
      z-index: 99999;
      display: flex;
      justify-content: center;
      align-items: center;
      transition: opacity 0.5s cubic-bezier(.4,0,.2,1), background-color 0.2s;
    }
    .app-loading-spinner {
      width: 56px;
      height: 56px;
      border: 6px solid #e0e0e0;
      border-top: 6px solid #1976d2;
      border-radius: 50%;
      box-shadow: 0 2px 16px 0 rgba(0,0,0,0.10);
      animation: app-loading-spin 0.8s cubic-bezier(.4,0,.2,1) infinite;
      background: transparent;
    }
    @keyframes app-loading-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'app-loading-overlay';
  overlay.innerHTML = '<div class="app-loading-spinner"></div>';
  document.body.appendChild(overlay);

  // 主题切换处理
  function setLoadingBg(isDark) {
    overlay.style.setProperty('--app-loading-bg', isDark ? '#181818' : '#fff');
  }
  // 初始主题（尝试从window.matchMedia或默认浅色）
  setLoadingBg(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  // 监听主进程推送的主题变更
  if (window.electronAPI && window.electronAPI.on) {
    window.electronAPI.on('theme-changed', (_event, data) => {
      setLoadingBg(data && data.isDarkMode);
    });
  }

  // 当页面完全加载后移除遮罩
  window.addEventListener('load', () => {
    // 稍微延迟一点以确保渲染完成
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 500);
    }, 100);
  });
});


