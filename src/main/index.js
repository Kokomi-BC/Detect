const { app } = require('electron');
const DetectApp = require('./main');
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  process.exit(1);
});

// 启动应用
async function startChatApp() {
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
startChatApp();

// 导出应用类供测试使用
module.exports = { DetectApp };