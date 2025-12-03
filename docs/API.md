# Python-Node.js 集成 API 文档

## LLMService API

### `analyzeContent(text, imageUrls, sourceUrl, useWebSearch, stream)`

分析内容真实性。

**参数：**

- `text` (string): 要分析的文本内容
- `imageUrls` (string[]): 图片 URL 数组或 base64 编码的图片数据
- `sourceUrl` (string, 可选): 内容来源 URL
- `useWebSearch` (boolean, 默认 true): 是否使用网络搜索验证
- `stream` (boolean, 默认 false): 是否使用流式响应

**返回值：**

```javascript
{
  "success": true,
  "probability": 0.85,
  "type": 1,
  "explanation": "判断理由",
  "analysis_points": [
    {
      "description": "分析描述",
      "status": "positive" // 或 "warning" 或 "negative"
    }
  ],
  "fake_parts": [
    {
      "text": "虚假片段",
      "reason": "虚假原因"
    }
  ],
  "search_references": [
    {
      "title": "参考资料标题",
      "url": "URL 地址",
      "relevance": "相关性说明"
    }
  ],
  "thinking": "AI 思考过程（仅流式模式）",
  "search_queries": ["搜索关键词1", "搜索关键词2"]
}
```

**使用示例：**

```javascript
const LLMService = require('./src/main/llmService');
const service = new LLMService();

// 基本使用
const result = await service.analyzeContent(
  "新闻文本",
  [],
  "",
  true,
  false
);

// 带图片分析
const result = await service.analyzeContent(
  "新闻文本",
  ["http://example.com/image.jpg"],
  "http://example.com/news",
  true,
  false
);

// 流式响应
service.on('event', (event) => {
  console.log(event.type, event.data);
});

const result = await service.analyzeContent(
  "新闻文本",
  [],
  "",
  true,
  true
);
```

## 流式事件

当 `stream=true` 时，可以监听以下事件：

### `thinking_start`

AI 开始思考过程。

```javascript
{
  "type": "thinking_start",
  "data": {
    "timestamp": "2024-12-03T15:00:00.000Z"
  }
}
```

### `thinking_delta`

AI 思考过程的增量输出。

```javascript
{
  "type": "thinking_delta",
  "data": {
    "delta": "思考内容片段"
  }
}
```

### `search_start`

开始网络搜索。

```javascript
{
  "type": "search_start",
  "data": {
    "timestamp": "2024-12-03T15:00:01.000Z"
  }
}
```

### `search_query`

搜索关键词。

```javascript
{
  "type": "search_query",
  "data": {
    "query": "搜索关键词"
  }
}
```

### `search_complete`

搜索完成。

```javascript
{
  "type": "search_complete",
  "data": {
    "timestamp": "2024-12-03T15:00:05.000Z"
  }
}
```

### `answer_start`

开始生成回答。

```javascript
{
  "type": "answer_start",
  "data": {
    "timestamp": "2024-12-03T15:00:06.000Z"
  }
}
```

### `answer_delta`

回答内容的增量输出。

```javascript
{
  "type": "answer_delta",
  "data": {
    "delta": "回答内容片段"
  }
}
```

### `complete`

分析完成。

```javascript
{
  "type": "complete",
  "data": {
    // 完整的分析结果
  }
}
```

### `error`

发生错误。

```javascript
{
  "type": "error",
  "data": {
    "success": false,
    "error": "错误信息"
  }
}
```

## Python Bridge API

### `PythonBridge` 类

管理 Node.js 与 Python 进程的通信。

**构造函数参数：**

```javascript
{
  pythonPath: 'python3',      // Python 可执行文件路径
  scriptPath: './python/llm_service.py', // Python 脚本路径
  maxRetries: 3,               // 最大重试次数
  timeout: 120000,             // 超时时间（毫秒）
  poolSize: 2                  // 进程池大小
}
```

**方法：**

- `call(params)`: 调用 Python 服务
- `destroy()`: 清理资源

## IPC 通道

### `analyze-content`

主进程处理器，调用 LLM 服务分析内容。

**请求：**

```javascript
ipcRenderer.invoke('analyze-content', {
  text: "新闻文本",
  imageUrls: ["url1", "url2"],
  url: "source url"
})
```

**响应：**

```javascript
{
  success: true,
  data: {
    // 分析结果
  }
}
```

## 配置

### 环境变量

- `ARK_API_KEY`: 火山方舟 API 密钥
- `PYTHONIOENCODING`: Python IO 编码（默认 utf-8）

### Python Bridge 配置

在 `llmService.js` 中配置：

```javascript
this.pythonBridge = new PythonBridge({
  pythonPath: 'python3',
  timeout: 120000,
  maxRetries: 3,
  poolSize: 2
});
```

## 错误代码

- `TIMEOUT`: Python 进程超时
- `SPAWN_ERROR`: 启动 Python 进程失败
- `PARSE_ERROR`: 解析 JSON 输出失败
- `API_ERROR`: API 调用失败
- `VALIDATION_ERROR`: 参数验证失败

## 数据格式

### 图片数据格式

支持以下格式：

1. HTTP/HTTPS URL: `http://example.com/image.jpg`
2. Data URL: `data:image/jpeg;base64,/9j/4AAQ...`
3. Base64 字符串: `/9j/4AAQ...`
4. 文件路径: `/path/to/image.jpg`

### 文本编码

所有文本数据使用 UTF-8 编码，确保：

- 中文字符正确传输
- JSON 序列化使用 `ensure_ascii=False`
- Node.js 端使用 `utf-8` 解码

## 性能考虑

- 进程池避免频繁创建进程（开销约 100-200ms）
- 请求队列管理并发，避免系统过载
- 超时机制防止资源泄漏
- 重试机制提高可靠性

## 安全考虑

- 输入验证防止注入攻击
- 进程隔离保证稳定性
- 错误信息不暴露敏感数据
- API 密钥通过环境变量管理
