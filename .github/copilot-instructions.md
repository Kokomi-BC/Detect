# Detect — AI 助手使用说明（供 Copilot / AI 代码代理）

目标：帮助 AI 代码代理快速上手本仓库并在不破坏现有结构的前提下做出安全、可验证的改动。

要点速览
- 主进程（Node/Electron）代码在 `src/main/`；渲染进程是单文件、非框架的 `public/Main.html`。
- 切勿把渲染端重构为 React/框架，除非得到明确要求。
- 与 LLM 的交互通过 `src/main/llmService.js`，该模块期待并返回严格的 JSON 输出。

架构与关键文件
- `src/main/main.js`：应用入口，管理窗口、IPC 路由和启动逻辑。
- `src/main/llmService.js`：封装对 Volcengine（Doubao）或其它 LLM 的调用；提示语必须要求“strict JSON”以避免解析失败。
- `src/main/extractionManager.js`、`imageExtractor.js`、`urlProcessor.js`：负责网页内容与图片提取、预处理逻辑。
- `src/main/preload.js`：用 `contextBridge` 暴露 `electronAPI` 给渲染进程；检视此处可以了解渲染端可用的 IPC 接口名与用法。
- `public/Main.html`：单页 UI（HTML + 内联 CSS 变量 + 原生 JS）——所有前端逻辑均集中在此文件。

IPC / 通信模式（必须遵循）
- 请求/响应（同步语义）：渲染端 `await window.electronAPI.invoke('channel', data)` ⇄ 主端 `ipcMain.handle('channel', async (evt, data) => { ... })`。
    - 常见 channel：`analyze-content`、`open-image-dialog`、`set-theme`。
- 事件推送（fire-and-forget）：渲染端 `window.electronAPI.send('channel', data)` ⇄ 主端 `ipcMain.on('channel', ...)`。
    - 示例：`extract-content`（主进程异步处理并通过事件回传结果）。
- 主到渲染：主窗口使用 `mainWindow.webContents.send('channel', data)`，渲染端通过 `window.electronAPI.on('channel', handler)` 监听。
    - 示例：`extract-content-result`、`theme-changed`。

错误处理约定
- 所有 `ipcMain.handle` 的實現应捕获异常并返回结构化对象，例如：

    {
        success: false,
        error: '错误信息'
    }

    这样渲染端统一检查 `success` 字段而不是抛原始异常。

开发与调试
- 启动（开发模式）：`npm run dev` — 启动 webpack-dev-server（渲染）并并行运行 `electron .`。
- 构建渲染：`npm run build:renderer`。
- 构建 Electron 应用：`npm run build:electron`（使用 electron-builder，见 `package.json`）。
- 在开发时打开主/渲染端控制台调试：渲染端直接在 `public/Main.html` 中使用 `console.log`，主进程日志输出到终端。

项目惯例与注意事项（针对 AI 代理）
- 渲染端：坚持 Vanilla JS + DOM 操作；不要把现有 UI 拆分为组件或引入框架。
- LLM 输出必须为严格 JSON。修改 `llmService.js` 时，始终把提示语写成明确的“Return only JSON” 格式，并在接收端做稳健的 JSON.parse 异常处理。
- 任何新增 IPC channel：
    - 若需要返回结果，使用 `ipcMain.handle` + `window.electronAPI.invoke`。
    - 若仅触发侧效应，使用 `ipcMain.on` + `window.electronAPI.send`。
    - 主端通知渲染端使用 `mainWindow.webContents.send`。
- 主题与样式使用 `public/Main.html` 中的 CSS 变量（`:root` 与 `[data-theme="dark"]`）。修改主题时请更新这两个位置。

快速定位示例
- 查看入口与 IPC：[src/main/main.js](src/main/main.js#L1)
- LLM 提示与 API：[src/main/llmService.js](src/main/llmService.js#L1)
- 内容提取：[src/main/extractionManager.js](src/main/extractionManager.js#L1)
- 渲染端完整 UI：[public/Main.html](public/Main.html#L1)

如何提交变更（建议）
- 小范围改动：在本地分支提交并推 PR；在 PR 描述里注明为何不重构渲染端（若改动涉及 `Main.html`）。
- 涉及 LLM 提示或解析的改动：提供示例输入/输出并在单元或集成测试里验证 JSON 可解析性。

反馈与迭代
- 如果你需要我补充：明确想要更详细的 `llmService` 提示模板、常见错误示例或为 `Main.html` 编写小型重构指南。

—— 结束 ——
