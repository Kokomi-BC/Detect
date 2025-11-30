# 修改项目配置为使用 code.html 作为启动页面

## 1. 修改 Webpack 配置
- 更新 `webpack.config.js` 中的 `HtmlWebpackPlugin` 配置，将模板文件从 `public/index.html` 改为 `public/code.html`

## 2. 修改窗口管理器配置
- 更新 `windowManager.js` 中的主窗口加载逻辑：
  - 开发模式：保持加载 `http://localhost:8080`（由 Webpack Dev Server 提供）
  - 生产模式：将加载的文件从 `dist/index.html` 改为 `dist/code.html`
  - 错误回退：将本地 HTML 文件路径从 `public/index.html` 改为 `public/code.html`

## 3. 迁移沉浸式窗口功能
- 检查 `code.html` 是否已经包含沉浸式窗口相关的 CSS 和 JavaScript
- 如果需要，从原项目中迁移沉浸式窗口的实现代码

## 4. 确保功能正常工作
- 验证右键菜单功能：确保 `code.html` 中的文本输入区域能触发正确的右键菜单
- 验证图片提取功能：确保图片上传和预览功能正常
- 验证内置浏览器功能：确保链接能在新窗口中正确打开

## 5. 清理冗余文件
- 删除不再需要的 `public/index.html`
- 删除不再使用的 React 组件文件（如果 code.html 不使用 React）
- 清理 `src/renderer/` 目录中不再需要的文件

## 6. 测试和验证
- 运行开发模式，确保应用能正常启动
- 测试所有功能，确保右键菜单、图片提取和内置浏览器功能正常工作
- 构建生产版本，确保能正常运行

## 预期结果
- 应用使用 `code.html` 作为启动页面
- 所有原有功能保持正常工作
- 项目结构更加清晰，移除了冗余文件