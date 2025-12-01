const OpenAI = require('openai');

class LLMService {
  constructor() {
    this.client = new OpenAI({
      apiKey: '914b3c31-1b7b-4053-81e2-ea7546afae5a',
      baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    });
    this.model = 'doubao-seed-1-6-251015';
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
    const systemPrompt = `你是一个专业的新闻真伪检测助手。当前时间是：${currentDate}。
请分析用户提供的文本和图片${sourceUrl ? `（来源链接：${sourceUrl}）` : ''}。
请判断该新闻的真假，并返回严格的JSON格式响应（不要包含markdown代码块标记），包含以下字段：

1. probability: (0-1之间的浮点数) 新闻为真的概率。
2. type: (整数) 
   - 1: 大概率为真 (Probability >= 0.8)
   - 2: 部分为假 (0.2 < Probability < 0.8)
   - 3: 大概率为假 (Probability <= 0.2)
3. explanation: (字符串) 简短的判断理由（为什么是真新闻，或者为什么是假新闻）。
4. analysis_points: (数组) 包含3个关键维度的详细分析点，每个对象包含：
   - "description": "分析描述"
   - "status": "positive" (正面/可靠) | "warning" (存疑/需核实) | "negative" (负面/虚假)
   请从以下维度进行分析：内容来源可靠性、语言表达客观性、图文一致性/信息核实情况。
5. fake_parts: (数组) 仅在type为2或3时提供，用于标出虚假内容。每个元素为对象：
   - "text": "原文中被认为是虚假的具体片段（必须与原文完全一致以便定位）"
   - "reason": "该片段为假的原因"

请确保返回的是合法的JSON字符串。`;

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

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
      });

      const content = response.choices[0].message.content;
      return this.parseResponse(content);
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
