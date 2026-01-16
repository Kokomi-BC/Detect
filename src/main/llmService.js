const OpenAI = require('openai');

class LLMService {
  constructor() {
    this.client = new OpenAI({
      apiKey: '914b3c31-1b7b-4053-81e2-ea7546afae5a',
      baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    });
    this.model = 'doubao-seed-1-8-251228';
    this.bochaApiKey = 'sk-3a242c2d462a460c9a378c181bd93c95';
  }

  /**
   * 将JSON转换为TOON格式以减少Token消耗
   * @param {Array} data 
   * @returns {string}
   */
  jsonToToon(data) {
    if (!Array.isArray(data) || data.length === 0) return '[]';
    const keys = Object.keys(data[0]);
    const header = `results[${data.length}]{${keys.join(',')}}:`;
    const rows = data.map(item => {
      return '  ' + keys.map(key => {
        let val = item[key];
        if (val === null || val === undefined) return '';
        val = String(val).trim();
        val = val.replace(/\s+/g, ' '); // 合并空白字符
        // TOON/CSV规范：仅当包含逗号或双引号时才需要引号，冒号不需要
        if (val.includes(',') || val.includes('"')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',');
    });
    return [header, ...rows].join('\n');
  }

  /**
   * 执行联网搜索
   * @param {string} query 搜索关键词
   * @returns {Promise<string>} 搜索结果摘要
   */
  async performWebSearch(query) {
    try {
      console.log(`正在执行联网搜索: ${query}`);
      const response = await fetch('https://api.bochaai.com/v1/web-search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.bochaApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: query,
          summary: true,
          count: 5
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Bocha API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // 兼容不同的返回结构 (data.webPages 或 data.data.webPages)
      const webPages = data.webPages || (data.data && data.data.webPages);
      
      if (webPages && webPages.value && webPages.value.length > 0) {
        // 优化：返回toon格式的搜索结果，方便模型解析
        const results = webPages.value.map(item => ({
          title: item.name,
          url: item.url,
          summary: item.summary,
          date: item.datePublished || '未知'
        }));
        const toonResult = this.jsonToToon(results);
        console.log('联网搜索结果 (类json格式):\n', toonResult);
        return toonResult;
      }
      console.log('联网搜索结果: 未找到相关内容');
      return '[]'; // 返回空表示无结果
    } catch (error) {
      console.error('联网搜索失败:', error);
      return `(搜索遇到错误: ${error.message})`;
    }
  }

  /**
   * 分析内容真伪
   * @param {string} text 文本内容
   * @param {string[]} imageUrls 图片URL数组
   * @param {string} sourceUrl 来源URL（可选）
   * @param {Function} onSearchStart 联网搜索开始时的回调函数（可选）
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeContent(text, imageUrls = [], sourceUrl = '', onSearchStart = null) {
    const currentDate = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const systemPrompt = `You are a professional fake news detection assistant. Current date: ${currentDate}.
  Analyze the provided content and determine its authenticity. You can request a web search for verification. If images are provided, you MUST also check text-image consistency (图文一致性): extract visible text from images (OCR mentally), identify key entities/objects/scenes/time/watermarks, and compare with the written claims and captions. Flag mismatches explicitly.

### JSON Output Format (STRICT JSON, NO MARKDOWN):
{
  "needs_search": boolean, // True if verification is needed for specific events, data, or recent facts.
  "search_query": string,  // If needs_search=true, provide concise Chinese keywords (entities, events, time). No long sentences.
  "title": string,         // Objective news title (Simplified Chinese).
  "probability": number,   // Float (0-1) of being true.
  "type": number,          // 1: Real (>=0.8), 2: Mixed/Uncertain (0.2-0.8), 3: Fake (<=0.2).
  "explanation": string,   // Brief judgment summary (Simplified Chinese).
  "analysis_points": [     // Variable length points (Simplified Chinese).
    // Rule 1: If NO images exist, provide EXACTLY 3 points (source reliability, linguistic objectivity, factual consistency).
    // Rule 2: If images exist, add a 4th point: "图文一致性分析" (Image-Text Consistency) to evaluate if labels/captions/context match the image content.
    { "description": "Analysis detail", "status": "positive"|"warning"|"negative" }
  ],
  "fake_parts": [          // Only if type is 2 or 3. List specific fake segments and reasons (Simplified Chinese). Include image-text mismatches clearly, e.g., reason starts with "图文不一致:".
    { "text": "Exact quote", "reason": "Why it is fake" }
  ]
}

### Core Rules:
1. **Search Priority**: If facts are unclear or time-sensitive, set "needs_search": true with concise Chinese keywords.
2. **Finality**: If search results are provided, "needs_search" MUST be false. Prioritize search evidence.
3. **Image-Text Consistency**: When images exist, assess whether images support, contradict, or are unrelated to textual claims. If contradiction or likely mismatch is found, lower the probability accordingly and put the specific claim into "fake_parts" with reason prefixed by "图文不一致" or "图文疑似不一致"; reference visible cues (e.g., 人物/地点/时间/水印/画面元素). Also, explicitly include a "图文一致性分析" point in "analysis_points".
4. **Language**: All descriptive fields MUST be in Simplified Chinese.
5. **Format**: Return ONLY raw JSON. No markdown blocks.

Summary: Use concise Chinese keywords for search; output strictly valid JSON; all analysis text must be in Simplified Chinese; explicitly check and report image-text consistency when images are provided.`;

    const userContent = [];
    
    if (sourceUrl) {
        userContent.push({ type: 'text', text: `[来源链接]: ${sourceUrl}\n` });
    }

    if (text) {
      userContent.push({ type: 'text', text: text });
    }

    if (imageUrls && imageUrls.length > 0) {
      for (const url of imageUrls) {
        userContent.push({
          type: 'image_url',
          image_url: { url: url }
        });
      }
    }

    if (userContent.length === 0) {
      throw new Error('没有提供文本或图片进行分析');
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];

    try {
      // 第一次调用
      console.log('第一次调用...');
      let response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
      });

      let content = response.choices[0].message.content;
      let result = this.parseResponse(content);

      // 检查是否需要搜索
      if (result.needs_search && result.search_query) {
        console.log(`Model requests search: ${result.search_query}`);
        
        // 执行回调通知前端
        if (typeof onSearchStart === 'function') {
          onSearchStart(result.search_query);
        }

        // 执行搜索
        const searchResults = await this.performWebSearch(result.search_query);
        
        // 构造第二轮对话
        messages.push({ role: 'assistant', content: content }); // 保留模型的第一轮回复
        messages.push({ 
          role: 'user', 
          content: `[联网搜索结果(类json格式)]:\n${searchResults}\n\n请根据以上搜索结果和原始信息，进行最终的真伪判断。请确保 needs_search 为 false，并填写完整的分析字段。搜索结果具有较高的可信度，请优先参考。` 
        });

        console.log('第二次调用...');
        response = await this.client.chat.completions.create({
          model: this.model,
          messages: messages,
        });

        content = response.choices[0].message.content;
        result = this.parseResponse(content);
      }

      return result;
    } catch (error) {
      console.error('LLM API调用失败:', error);
      throw error;
    }
  }

  parseResponse(content) {
    try {
      // 尝试清理可能存在的 Markdown 标记
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '');
      }
      
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('解析LLM响应失败:', e);
      // 尝试提取 JSON 部分
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (e2) {
          return { error: '解析响应失败', raw: content };
        }
      }
      return { error: '解析响应失败', raw: content };
    }
  }
}

module.exports = LLMService;
