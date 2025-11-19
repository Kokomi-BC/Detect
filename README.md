# 假新闻检测前端界面

基于ChatUI组件库实现的类翻译器风格假新闻检测界面。

## 功能特性

1. **左右分栏布局**：左侧输入待检测新闻文本，右侧显示检测结果
2. **荧光标识系统**：可疑段落使用黄色高亮显示
3. **智能标签系统**：自动为可疑段落添加分类标签（如"可疑事实"、"来源存疑"等）
4. **响应式设计**：适配不同屏幕尺寸，支持移动端垂直布局
5. **实时检测**：点击按钮即可获取检测结果

## 安装依赖

```bash
npm install
```

## 运行项目

### 开发模式

```bash
npm run dev
```

### 生产构建

```bash
npm run build
```

## 组件结构

### 主应用组件 App.jsx

```javascript
import React, { useState } from 'react';
import { Input, Button } from '@chatui/core';
import './style.css';

function App() {
  // 状态管理
  const [inputText, setInputText] = useState('');
  const [detectedResult, setDetectedResult] = useState([]);

  // 检测假新闻的处理函数
  const handleDetect = () => {
    // 假新闻检测逻辑
  };

  return (
    <div className="app-container">
      {/* 左侧输入区域 */}
      <div className="input-area">
        <h2>新闻原文输入</h2>
        <Input
          type="textarea"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="请输入或粘贴待检测的新闻文本..."
          style={{ height: 'calc(100% - 100px)', resize: 'none' }}
        />
        <Button type="primary" onClick={handleDetect} style={{ width: '100%', marginTop: '12px' }}>
          开始检测假新闻
        </Button>
      </div>

      {/* 右侧输出区域 */}
      <div className="output-area">
        <h2>检测结果输出</h2>
        <div>
          {detectedResult.map((part, index) => (
            <div key={index} style={{ marginBottom: '12px' }}>
              {/* 高亮显示的文本 */}
              <span className={part.isSuspicious ? 'highlight-text' : ''}>
                {part.text}
              </span>

              {/* 标签显示 */}
              {part.isSuspicious && part.labels.map((label, labelIndex) => (
                <span key={labelIndex} className="suspicious-label">
                  {label}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
```

## 数据传递格式

### 输入数据

直接传递新闻文本字符串即可：

```javascript
inputText: string = "新闻文本内容..."
```

### 输出检测结果

检测结果采用数组格式，每个元素包含文本内容、是否可疑及标签信息：

```javascript
detectedResult: Array<{
  text: string,          // 新闻文本片段
  isSuspicious: boolean, // 是否为可疑段落
  labels: Array<string>  // 标签列表
}>
```

## 检测结果渲染接口

### 核心渲染逻辑

```javascript
detectedResult.map((part, index) => (
  <div key={index} style={{ marginBottom: '12px' }}>
    {/* 高亮显示的文本 */}
    <span className={part.isSuspicious ? 'highlight-text' : ''}>
      {part.text}
    </span>

    {/* 标签显示 */}
    {part.isSuspicious && part.labels.map((label, labelIndex) => (
      <span key={labelIndex} className="suspicious-label">
        {label}
      </span>
    ))}
  </div>
))
```

## 交互事件处理

### 输入事件

```javascript
<Input
  type="textarea"
  value={inputText}
  onChange={(e) => setInputText(e.target.value)}
  placeholder="请输入或粘贴待检测的新闻文本..."
  style={{ height: 'calc(100% - 100px)', resize: 'none' }}
/>
```

### 检测事件

```javascript
<Button type="primary" onClick={handleDetect} style={{ width: '100%', marginTop: '12px' }}>
  开始检测假新闻
</Button>
```

## 样式说明

### 主题风格

保持与ChatUI组件库风格一致，使用：
- 蓝色作为主色调（按钮、强调文本）
- 浅灰色作为边框和背景色
- 黄色作为可疑文本高亮色
- 红色作为标签背景色

### 响应式设计

- **桌面端**：左右分栏布局，各占50%宽度
- **移动端（<768px）**：垂直布局，上下各占50%高度

### 核心样式类

```css
/* 应用容器 */
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

/* 左侧输入区域 */
.input-area {
  width: 50%;
  padding: 20px;
  border-right: 1px solid #e8e8e8;
  overflowY: 'auto',
  box-sizing: border-box;
}

/* 右侧输出区域 */
.output-area {
  width: 50%;
  padding: 20px;
  overflowY: 'auto',
  box-sizing: border-box;
}

/* 高亮文本样式 */
.highlight-text {
  background-color: #fff78a;
  padding: 3px 6px;
  border-radius: 3px;
}

/* 可疑标签样式 */
.suspicious-label {
  display: inline-block;
  background-color: #f5222d;
  color: #fff;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  margin-left: 8px;
}
```

## 标签列表

支持的标签类型：
- 可疑事实
- 来源存疑
- 逻辑矛盾
- 夸大其词
- 图片不符

可以根据实际需求扩展标签类型。

## 扩展建议

1. **接入真实API**：将handleDetect方法替换为调用真实的假新闻检测API
2. **增加批量上传**：支持上传文件进行检测
3. **优化标签系统**：根据检测结果自动匹配最相关的标签
4. **增加详情说明**：点击标签显示详细的检测依据
5. **支持多语言**：扩展支持其他语言的新闻检测

## License

ISC