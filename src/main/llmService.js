const OpenAI = require('openai');

class LLMService {
  constructor() {
    this.client = new OpenAI({
      apiKey: '914b3c31-1b7b-4053-81e2-ea7546afae5a',
      baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    });
    this.model = 'doubao-seed-1-6-vision-250815';
    this.bochaApiKey = 'sk-3a242c2d462a460c9a378c181bd93c95';
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
      console.log('博查搜索API返回结果:', JSON.stringify(data, null, 2));
      
      // 兼容不同的返回结构 (data.webPages 或 data.data.webPages)
      const webPages = data.webPages || (data.data && data.data.webPages);
      
      if (webPages && webPages.value && webPages.value.length > 0) {
        // 优化：返回JSON格式的搜索结果，方便模型解析
        const results = webPages.value.map(item => ({
          title: item.name,
          url: item.url,
          summary: item.summary,
          date: item.datePublished || '未知'
        }));
        return JSON.stringify(results, null, 2);
      }
      return '[]'; // 返回空JSON数组表示无结果
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
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeContent(text, imageUrls = [], sourceUrl = '') {
    const currentDate = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const systemPrompt = `You are a professional fake news detection assistant. Current date: ${currentDate}.
Analyze the provided content and determine its authenticity. You can request a web search for verification.

### JSON Output Format (STRICT JSON, NO MARKDOWN):
{
  "needs_search": boolean, // Set to true if the news involves specific events, data, or recent facts that require verification.
  "search_query": string,  // If needs_search is true, provide concise Chinese keywords (entities, events, time). Avoid long sentences.
  "title": string,         // A short, objective title for the news (Simplified Chinese).
  "probability": number,   // Float (0-1) representing the likelihood of the news being true.
  "type": number,          // 1: Likely Real (Prob >= 0.8), 2: Partial/Uncertain (0.2 < Prob < 0.8), 3: Likely Fake (Prob <= 0.2).
  "explanation": string,   // A brief summary of your judgment (Simplified Chinese).
  "analysis_points": [     // Exactly 3 analysis points (Simplified Chinese).
    { "description": "Detailed analysis", "status": "positive"|"warning"|"negative" }
  ],
  "fake_parts": [          // Only if type is 2 or 3. List specific fake segments and reasons (Simplified Chinese).
    { "text": "Exact quote from original", "reason": "Why it is fake" }
  ]
}

 Critical Requirements:
1. Search First: If information is vague or time-sensitive, set "needs_search": true and provide concise Chinese keywords.
2. Final Judgment: If search results are provided, "needs_search" MUST be false. Prioritize search evidence.
3. Language: All text fields (title, explanation, description, reason) MUST be in Simplified Chinese.
4. Format: Return ONLY the raw JSON string. No markdown blocks.

Summary: Prioritize web search for verification using concise Chinese keywords; ensure all descriptive fields are in Simplified Chinese; output strictly valid JSON.`;

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
      console.log('Requesting LLM analysis (第一次调用)...');
      let response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
      });

      let content = response.choices[0].message.content;
      let result = this.parseResponse(content);

      // 检查是否需要搜索
      if (result.needs_search && result.search_query) {
        console.log(`Model requests search: ${result.search_query}`);
        
        // 执行搜索
        const searchResults = await this.performWebSearch(result.search_query);
        
        // 构造第二轮对话
        messages.push({ role: 'assistant', content: content }); // 保留模型的第一轮回复
        messages.push({ 
          role: 'user', 
          content: `[联网搜索结果(JSON格式)]:\n${searchResults}\n\n请根据以上搜索结果和原始信息，进行最终的真伪判断。请确保 needs_search 为 false，并填写完整的分析字段。搜索结果具有较高的可信度，请优先参考。` 
        });

        console.log('Requesting LLM analysis (Round 2 with search results)...');
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
