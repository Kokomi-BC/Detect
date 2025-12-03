# Python 环境配置

## 环境变量

在使用前，请设置以下环境变量：

```bash
export ARK_API_KEY="your-api-key-here"
```

或者在 `.env` 文件中设置：

```
ARK_API_KEY=your-api-key-here
```

## Python 依赖安装

```bash
cd python
pip install -r requirements.txt
```

## 测试 Python 服务

### 基本测试（不使用网络搜索）

```bash
echo '{"text":"测试新闻内容","imageUrls":[],"sourceUrl":"","useWebSearch":false,"stream":false}' | python3 python/llm_service.py
```

### 使用网络搜索

```bash
echo '{"text":"2024年世界杯足球赛在哪里举办？","imageUrls":[],"sourceUrl":"","useWebSearch":true,"stream":false}' | python3 python/llm_service.py
```

### 流式响应测试

```bash
echo '{"text":"测试新闻内容","imageUrls":[],"sourceUrl":"","useWebSearch":true,"stream":true}' | python3 python/llm_service.py
```

## 集成到 Node.js

Python 服务已经通过 `pythonBridge.js` 集成到主应用中。

### 使用示例

```javascript
const LLMService = require('./src/main/llmService');

const service = new LLMService();

// 分析内容
const result = await service.analyzeContent(
  "新闻文本内容",
  ["http://example.com/image.jpg"],
  "http://example.com/source",
  true, // useWebSearch
  false // stream
);

console.log(result);
```

### 监听流式事件

```javascript
const service = new LLMService();

// 监听思考过程
service.on('event', (event) => {
  if (event.type === 'thinking_delta') {
    console.log('AI 思考:', event.data.delta);
  } else if (event.type === 'search_query') {
    console.log('搜索关键词:', event.data.query);
  } else if (event.type === 'answer_delta') {
    console.log('AI 回答:', event.data.delta);
  }
});

// 开始分析
const result = await service.analyzeContent(
  "新闻文本内容",
  [],
  "",
  true, // useWebSearch
  true  // stream
);
```

## 架构说明

### 数据流

1. **前端（Renderer）** → 通过 IPC → **主进程（Main）**
2. **主进程** → 调用 `LLMService` → **Python Bridge**
3. **Python Bridge** → 启动 Python 进程 → **Python LLM Service**
4. **Python LLM Service** → 调用火山方舟 API → **返回结果**
5. **结果** → 通过 Python Bridge → LLMService → 主进程 → **前端**

### 进程池管理

Python Bridge 实现了进程池管理，默认配置：
- 池大小: 2 个进程
- 超时: 120 秒
- 重试次数: 3 次

### UTF-8 编码保证

所有文本数据在传输过程中使用 UTF-8 编码：
- Python 进程使用 `PYTHONIOENCODING=utf-8` 环境变量
- JSON 序列化使用 `ensure_ascii=False`
- Node.js 端使用 `utf-8` 解码

## 错误处理

服务实现了多层错误处理：

1. **Python 层**：捕获 API 调用错误，返回结构化错误信息
2. **Bridge 层**：实现重试机制，超时保护
3. **Service 层**：统一错误格式，向上传递

## 性能优化

- 进程池避免频繁创建 Python 进程
- 异步非阻塞调用
- 流式响应支持实时反馈
- 请求队列管理并发
