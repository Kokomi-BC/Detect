# 假新闻检测应用 AI 开发指南

## 项目概述

一个基于 **Electron + React** 的假新闻检测桌面应用，支持文本输入和 URL 内容提取。架构采用**主进程-渲染进程分离**的经典 Electron 模式，通过 IPC 通信实现前后端交互。

## 架构关键要素

### 核心分层

```
┌─ 渲染进程（Renderer Process）
│  ├─ React UI (src/renderer/App.jsx, components/)
│  └─ IPC 客户端通信
│
├─ IPC 通道 (ipcMain/ipcRenderer)
│
└─ 主进程（Main Process）
   ├─ WindowManager (窗口生命周期管理)
   ├─ ExtractionManager (内容提取核心)
   ├─ URLProcessor (URL 验证和标准化)
   ├─ ImageExtractor (图像下载和验证)
   └─ 其他工具模块
```

### IPC 通信模式

**渲染进程 → 主进程**：
- `extract-content` (send) - 触发 URL 内容提取
- `cancel-extraction` (send) - 取消进行中的提取
- `clear-browser-data` (invoke) - 清理浏览器数据（期望同步回复）

**主进程 → 渲染进程**：
- `extract-content-result` (send) - 返回提取结果
- `extraction-progress` (send) - 进度更新（进度条使用）

### 关键数据结构

**内容提取结果**（`ExtractionManager.extractContent()` 返回）：
```javascript
{
  title: string,              // 文章标题
  content: string,            // 提取的主要内容
  images: Array<{
    url: string,
    data: string,             // Base64 编码
    size?: { width, height }
  }>,
  metadata: {
    author?: string,
    publishDate?: string,
    source?: string
  },
  extractedAt: timestamp
}
```

**URL 验证规则**（`URLProcessor` 类）：
- 屏蔽域名黑名单：`mmbiz.qlogo.cn`, `avatar.bdstatic.com` 等（用户头像、logo CDN）
- 图像扩展白名单：`.webp`, `.jpg`, `.jpeg`, `.png`（禁止 `.gif`, `.svg`）
- 微信文章特殊处理：`mp.weixin.qq.com` URLs 需额外头部支持

## 开发工作流

### 构建命令（npm scripts）

| 命令 | 用途 |
|-----|------|
| `npm run dev` | 启动开发模式：并发运行 webpack-dev-server (8080) + Electron，支持热重载 |
| `npm run build:renderer` | 生产构建 React 渲染进程（输出 → `dist/bundle.js`) |
| `npm start` | 直接启动 Electron（需先执行 build:renderer） |
| `npm run build` | 同义词：执行 build:renderer |
| `npm run build:electron` | Electron Builder 打包（生成 release/ 构件） |

### 开发流程特定事项

1. **热重载不完全**：webpack dev-server 支持前端热重载（8080），但主进程修改仍需手动重启 Electron
2. **开发 vs 生产路径**：
   - 开发：`windowManager.js` 加载 `http://localhost:8080` → 失败回退到 `public/index.html`
   - 生产：加载 `dist/index.html`（需预构建）
3. **IPC 通道命名**：主进程 `ipcMain.on()` 和渲染进程 `ipcRenderer.send()` 的通道名必须严格匹配

### 调试技巧

- **查看渲染进程日志**：DevTools 自动加载（若禁用，在 `WindowManager.createMainWindow()` 移除注释）
- **查看主进程日志**：控制台直接输出（通过 `console.log()`）
- **IPC 通道验证**：检查 `preload.js` 暴露的 API 与 main 进程的 `ipcMain.on/handle` 调用

## 项目特定的模式和约定

### 1. 模块化的管理器模式

所有服务端逻辑封装为独立 `Manager` 类，main.js 中实例化并协调：
```javascript
class ChatApp {
  constructor() {
    this.windowManager = new WindowManager();
    this.extractionManager = new ExtractionManager();
  }
}
```
**规则**：添加新功能时创建 `*Manager.js` 而非直接在 `main.js` 中堆积逻辑。

### 2. 内容提取的渐进式降级

ExtractionManager 尝试 Mozilla Readability → 微信 SDK → 降级 cheerio 解析 → 最后返回图像。
**规则**：新增解析器时应沿此优先级层级扩展（见 `extractionManager.js` 的 `extractContent()` 方法）。

### 3. URL 黑名单和白名单

URLProcessor 维护：
- `blockedDomains` - 屏蔽 CDN/头像域名
- `blockedFormats` - 禁止动图格式
- 在 `isValidImageResource()` 中逐项检查

**规则**：遇到错误的 URL 识别时，先检查黑名单而非修改提取逻辑。

### 4. 错误处理约定

所有异步操作用 `try-catch` + 重试机制（`utils.retry()`）：
```javascript
const result = await retry(
  () => fetchContent(url),
  3,                 // 重试次数
  1000               // 延迟 ms
);
```
**规则**：网络错误应重试，验证错误应立即失败。

### 5. 自定义颜色方案

App.jsx 在挂载时设置 MDUI 配色为淡粉色（#F5E6E6）：
```javascript
useEffect(() => setColorScheme('#F5E6E6'), []);
```
**规则**：颜色主题配置保持在此处，不在 CSS 中重复定义。

## 文件结构导航

| 路径 | 职责 |
|------|------|
| `src/main/main.js` | Electron 主进程入口，IPC 路由配置 |
| `src/main/windowManager.js` | 窗口创建和菜单管理 |
| `src/main/extractionManager.js` | 网页内容提取核心逻辑（Readability + cheerio） |
| `src/main/urlProcessor.js` | URL 验证、域名黑名单、格式检查 |
| `src/main/imageExtractor.js` | 图像下载、格式转换、大小验证 |
| `src/main/preload.js` | Electron 预加载脚本（IPC API 暴露） |
| `src/renderer/App.jsx` | React 主组件（UI 状态管理、IPC 调用） |
| `src/renderer/style.css` | 全局样式（分栏布局、高亮样式） |
| `webpack.config.js` | Webpack 配置（React 编译、dev-server） |
| `public/index.html` | Electron 加载的 HTML 模板 |

## 常见任务速查

### 添加新的 IPC 事件
1. 在 `preload.js` 的 `exposeInMainWorld` 中添加通道名
2. 在 `main.js` 中用 `ipcMain.on()` 或 `ipcMain.handle()` 注册处理器
3. 在 `App.jsx` 中调用 `ipcRenderer.send()/invoke()`

### 修改内容提取逻辑
编辑 `extractionManager.js` → `extractContent()` 方法的相应分支（XML 解析 → cheerio 解析等）

### 调整 UI 样式
修改 `src/renderer/style.css`（仅此处定义样式，避免内联 style）

### 增加 URL 过滤规则
在 `urlProcessor.js` 的 `blockedDomains` 或 `blockedFormats` 数组中添加

### 打包为独立应用
执行 `npm run build:electron` → 输出位置 `release/`（Windows 打包配置见 `electron-builder` 配置字段）

## 外部依赖关键点

| 包 | 用途 |
|----|------|
| `@mozilla/readability` | 网页内容提取（优先级最高） |
| `cheerio` | DOM 解析和查询（降级方案） |
| `jsdom` | DOM 环境模拟（与 Readability 配套） |
| `@chatui/core` | （代码中有导入但实际未大量使用） |
| `mdui` | Material Design UI 组件库 + 配色系统 |
| `electron` | 跨平台桌面应用框架 |
| `electron-builder` | 应用打包和分发 |

## 性能和安全注意事项

1. **内容长度限制**：URL 长度上限 2000 字符（主进程验证），防止异常输入
2. **CSP 和导航安全**：`setupSecurity()` 禁用外部链接打开和文件协议外导航
3. **用户代理伪装**：添加自定义 UA（`ChatApp/1.0`）以获得某些网站的完整内容
4. **图像下载并发**：ImageExtractor 内部管理并发数量（防止资源耗尽）

---

## 向 AI 代理的建议

- **修改前读源码**：这个项目工程化程度较高，架构设计精细，勿以通用 Electron 模式假设
- **追踪数据流**：优先理解 IPC 通道的端到端链路，再修改具体实现
- **测试构建流程**：前后端分离意味着修改需分别验证 webpack 构建（renderer）和 Electron 启动（main）
