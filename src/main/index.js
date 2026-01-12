const { app } = require('electron');
const DetectApp = require('./main');

// 屏蔽 Chromium 内核的警告和错误日志 (如 STUN 域名解析失败)
app.commandLine.appendSwitch('log-level', '3');
app.commandLine.appendSwitch('disable-logging');

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  process.exit(1);
});

// 启动应用
async function startDectectApp() {
  try {
    console.log('Starting application...');
    
    // 等待Electron完全准备就绪
    await app.whenReady();
    
    // 初始化并启动主应用
    const detectApp = new DetectApp();
    await detectApp.initialize();
    
    console.log('Application started successfully');
    
  } catch (error) {
    console.error('Application startup failed:', error);
    
    // 优雅地退出
    app.quit();
    process.exit(1);
  }
}

// 启动应用
startDectectApp();

// 导出应用类供测试使用
module.exports = { DetectApp };