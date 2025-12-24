# Detect — AI 助手使用说明（供 Copilot / AI 代码代理）

目标：帮助 AI 代码代理快速上手本仓库并在不破坏现有结构的前提下做出安全、可验证的改动。

## 核心架构与关键文件

### 主进程 (Node.js/Electron) - `src/main/`
- **入口流程**：`src/main/index.js` (启动脚本) -> `src/main/main.js` (`DetectApp` 类，核心逻辑)。
- **`src/main/main.js`**：应用的主控制器，负责窗口管理、IPC 路由注册、应用生命周期。
- **`src/main/llmService.js`**：LLM 服务层。
    - **关键点**：使用 `openai` SDK 连接 Volcengine (Doubao)。
    - **协议**：必须请求并解析 **Strict JSON**。提示词中必须包含 `JSON格式响应` 和 `不要包含markdown代码块标记` 的指令。
- **`src/main/extractionManager.js`**：内容提取编排器，协调 `imageExtractor.js` 和 `urlProcessor.js`。
- **`src/main/preload.js`**：安全桥梁。通过 `contextBridge` 暴露 `electronAPI`。**新增 IPC 必须在此处注册**。

### 渲染进程 (Frontend) - `public/`
- **`public/Main.html`**：**单文件架构**。
    - 包含所有 HTML 结构、内联 CSS 变量定义、以及所有前端 JavaScript 逻辑。
    - **严禁**引入 React/Vue 等框架。保持原生 JS (Vanilla JS) + DOM 操作。
    - **导航建议**：文件巨大 (~7000行)，修改时请搜索特定的 DOM ID 或事件监听器（如 `document.getElementById('btn-analyze')`）。

## IPC 通信模式（必须遵循）

1.  **请求/响应 (双向)**：
    - **渲染端**：`const result = await window.electronAPI.invoke('channel-name', data)`
    - **主进程**：`ipcMain.handle('channel-name', async (event, data) => { ... })`
    - **用途**：耗时操作、需要返回结果的操作（如：分析内容、打开文件对话框）。

2.  **单向通知 (渲染 -> 主)**：
    - **渲染端**：`window.electronAPI.send('channel-name', data)`
    - **主进程**：`ipcMain.on('channel-name', (event, data) => { ... })`
    - **用途**：触发无返回值的动作（如：打开外部链接）。

3.  **主进程推送 (主 -> 渲染)**：
    - **主进程**：`mainWindow.webContents.send('channel-name', data)`
    - **渲染端**：`window.electronAPI.on('channel-name', (event, data) => { ... })`
    - **用途**：异步任务完成通知、状态更新。

## 开发与构建工作流

- **启动开发环境**：
    ```bash
    npm run dev
    ```
    - 此命令并发运行 `webpack --watch` (构建渲染端) 和 `electron .` (启动主进程)。
    - 注意：修改 `Main.html` 后通常需要刷新 Electron 窗口 (Ctrl+R)。修改主进程代码需要重启 Electron。

- **构建发布**：
    - `npm run build:renderer`：仅构建前端资源。
    - `npm run build`：完整构建（前端 + Electron Builder 打包）。

## 项目特定惯例

1.  **错误处理**：
    - IPC Handler 必须捕获所有异常，并返回 `{ success: false, error: 'msg' }` 结构，避免主进程崩溃或渲染端 Promise 永远挂起。
    - 渲染端接收结果后，先检查 `if (!res.success)`。

2.  **样式系统**：
    - 样式定义在 `public/Main.html` 的 `<style>` 标签中。
    - 使用 CSS 变量 (`:root`) 管理主题。
    - 暗色模式通过 `[data-theme="dark"]` 选择器覆盖变量实现。

3.  **LLM 交互**：
    - 修改 `analyzeContent` 提示词时，务必保留 JSON 格式约束。
    - 解析 LLM 返回值时，使用 `try-catch` 包裹 `JSON.parse`，并处理可能的 Markdown 代码块标记（如 LLM 错误地返回了 ```json ... ```）。

## 常见任务指南

- **添加新功能**：
    1. 在 `src/main/preload.js` 添加 API 定义。
    2. 在 `src/main/main.js` 或相关 Service 中添加 `ipcMain.handle` 实现。
    3. 在 `public/Main.html` 中添加 UI 元素和调用逻辑。

- **调试**：
    - **渲染端**：在 Electron 窗口中打开 DevTools (Ctrl+Shift+I)，使用 `console.log`。
    - **主进程**：查看启动终端的输出日志。

—— 结束 ——
