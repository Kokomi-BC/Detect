/**
 * Chat应用启动入口
 * 
 * 这个文件作为主入口点，负责启动模块化的Electron应用
 */

const { app } = require('electron');
const ChatApp = require('./main');

// 全局错误处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

// 启动应用
async function startChatApp() {
  try {
    console.log('正在启动Chat应用...');
    
    // 等待Electron完全准备就绪
    await app.whenReady();
    
    // 初始化并启动主应用
    const chatApp = new ChatApp();
    await chatApp.initialize();
    
    console.log('Chat应用已成功启动');
    
  } catch (error) {
    console.error('Chat应用启动失败:', error);
    
    // 优雅地退出
    app.quit();
    process.exit(1);
  }
}

// 启动应用
startChatApp();

// 导出应用类供测试使用
module.exports = { ChatApp };