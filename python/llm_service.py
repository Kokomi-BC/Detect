#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LLM Service for Content Analysis with Web Search
This module provides AI-powered content authenticity analysis with real-time web search capabilities.
"""

import os
import sys
import json
import base64
from datetime import datetime
from typing import List, Dict, Any, Optional
from openai import OpenAI


class LLMService:
    """
    LLM Service for analyzing content authenticity with web search support
    """
    
    def __init__(self, api_key: str = None, base_url: str = None):
        """
        Initialize the LLM Service
        
        Args:
            api_key: API key for the service (defaults to env var ARK_API_KEY)
            base_url: Base URL for the API (defaults to Volcengine ARK)
        """
        self.api_key = api_key or os.getenv("ARK_API_KEY", "914b3c31-1b7b-4053-81e2-ea7546afae5a")
        self.base_url = base_url or "https://ark.cn-beijing.volces.com/api/v3"
        self.model = "doubao-seed-1-6-251015"
        
        self.client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url
        )
    
    def analyze_content(
        self,
        text: str = "",
        image_urls: List[str] = None,
        source_url: str = "",
        use_web_search: bool = True,
        stream: bool = False
    ) -> Dict[str, Any]:
        """
        Analyze content for authenticity with optional web search
        
        Args:
            text: Text content to analyze
            image_urls: List of image URLs or base64 encoded images
            source_url: Source URL of the content
            use_web_search: Whether to use web search for verification
            stream: Whether to stream the response
            
        Returns:
            Dictionary containing analysis results
        """
        try:
            # Build system prompt
            current_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            system_prompt = self._build_system_prompt(current_date, source_url, use_web_search)
            
            # Build user content
            user_content = self._build_user_content(text, image_urls, source_url)
            
            if not user_content:
                return {
                    "success": False,
                    "error": "没有提供文本或图片进行分析"
                }
            
            # Build messages
            messages = [
                {"role": "system", "content": [{"type": "input_text", "text": system_prompt}]},
                {"role": "user", "content": user_content}
            ]
            
            # Prepare API call parameters
            api_params = {
                "model": self.model,
                "input": messages,
                "stream": stream
            }
            
            # Add web search tool if enabled
            if use_web_search:
                api_params["tools"] = [
                    {
                        "type": "web_search",
                        "limit": 10
                    }
                ]
                api_params["extra_body"] = {"thinking": {"type": "auto"}}
            
            # Make API call
            if stream:
                return self._handle_stream_response(api_params)
            else:
                return self._handle_sync_response(api_params)
                
        except Exception as e:
            return {
                "success": False,
                "error": f"分析失败: {str(e)}"
            }
    
    def _build_system_prompt(self, current_date: str, source_url: str, use_web_search: bool) -> str:
        """Build system prompt for content analysis"""
        base_prompt = f"""你是一个专业的新闻真伪检测助手。当前时间是：{current_date}。
请分析用户提供的文本和图片{f'（来源链接：{source_url}）' if source_url else ''}。"""

        if use_web_search:
            base_prompt += """

核心规则如下：
一、思考与搜索判断（必须实时输出思考过程）：
1. 若问题涉及"时效性（如近3年数据）、知识盲区（如具体企业薪资）、信息不足"，必须调用web_search；
2. 思考时需说明"是否需要搜索""为什么搜""搜索关键词是什么"。

二、回答规则：
1. 优先使用搜索到的资料，引用格式为`[1] (URL地址)`；
2. 结构清晰（用序号、分段），多使用简单易懂的表述；
3. 结尾需列出所有参考资料（格式：1. [资料标题](URL)）。
"""

        base_prompt += """

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
6. search_references: (数组，可选) 如果使用了网络搜索，列出参考资料，每个对象包含：
   - "title": "资料标题"
   - "url": "URL地址"
   - "relevance": "相关性说明"

请确保返回的是合法的JSON字符串。"""
        
        return base_prompt
    
    def _build_user_content(
        self,
        text: str,
        image_urls: List[str],
        source_url: str
    ) -> List[Dict[str, Any]]:
        """Build user content for API request"""
        user_content = []
        
        if source_url:
            user_content.append({
                "type": "input_text",
                "text": f"[来源链接]: {source_url}\n"
            })
        
        if text:
            user_content.append({
                "type": "input_text",
                "text": text
            })
        
        if image_urls:
            for url in image_urls:
                # Check if it's base64 encoded or a URL
                if url.startswith('data:image'):
                    # Already in data URL format
                    user_content.append({
                        "type": "image_url",
                        "image_url": {"url": url}
                    })
                elif url.startswith('http://') or url.startswith('https://'):
                    # Regular URL
                    user_content.append({
                        "type": "image_url",
                        "image_url": {"url": url}
                    })
                else:
                    # Assume it's a file path or base64 without prefix
                    if os.path.isfile(url):
                        # Read file and convert to base64
                        with open(url, 'rb') as f:
                            image_data = base64.b64encode(f.read()).decode('utf-8')
                            user_content.append({
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}
                            })
                    else:
                        # Try as base64
                        user_content.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{url}"}
                        })
        
        return user_content
    
    def _handle_sync_response(self, api_params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle synchronous API response"""
        try:
            # For non-streaming mode, use standard chat.completions API
            messages = []
            for msg in api_params["input"]:
                if msg["role"] == "system":
                    content_text = msg["content"][0]["text"]
                    messages.append({"role": "system", "content": content_text})
                else:
                    # User message with mixed content
                    user_content = []
                    for item in msg["content"]:
                        if item["type"] == "input_text":
                            user_content.append({"type": "text", "text": item["text"]})
                        elif item["type"] == "image_url":
                            user_content.append(item)
                    messages.append({"role": "user", "content": user_content})
            
            # Create API call without stream
            response = self.client.chat.completions.create(
                model=api_params["model"],
                messages=messages
            )
            
            content = response.choices[0].message.content
            
            # Parse JSON response
            result = self._parse_json_response(content)
            result["success"] = True
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"API调用失败: {str(e)}"
            }
    
    def _handle_stream_response(self, api_params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle streaming API response"""
        try:
            response = self.client.responses.create(**api_params)
            
            thinking_text = ""
            answer_text = ""
            search_queries = []
            thinking_started = False
            answering_started = False
            
            for chunk in response:
                chunk_type = getattr(chunk, "type", "")
                
                # Handle thinking process
                if chunk_type == "response.reasoning_summary_text.delta":
                    if not thinking_started:
                        thinking_started = True
                        # Send thinking start event
                        self._send_event("thinking_start", {
                            "timestamp": datetime.now().isoformat()
                        })
                    
                    delta = getattr(chunk, "delta", "")
                    thinking_text += delta
                    self._send_event("thinking_delta", {"delta": delta})
                
                # Handle search status
                elif "web_search_call" in chunk_type:
                    if "in_progress" in chunk_type:
                        self._send_event("search_start", {
                            "timestamp": datetime.now().isoformat()
                        })
                    elif "completed" in chunk_type:
                        self._send_event("search_complete", {
                            "timestamp": datetime.now().isoformat()
                        })
                
                # Handle search keywords
                elif (chunk_type == "response.output_item.done" 
                      and hasattr(chunk, "item") 
                      and str(getattr(chunk.item, "id", "")).startswith("ws_")):
                    if hasattr(chunk.item.action, "query"):
                        search_keyword = chunk.item.action.query
                        search_queries.append(search_keyword)
                        self._send_event("search_query", {"query": search_keyword})
                
                # Handle answer
                elif chunk_type == "response.output_text.delta":
                    if not answering_started:
                        answering_started = True
                        self._send_event("answer_start", {
                            "timestamp": datetime.now().isoformat()
                        })
                    
                    delta = getattr(chunk, "delta", "")
                    answer_text += delta
                    self._send_event("answer_delta", {"delta": delta})
            
            # Parse final answer
            result = self._parse_json_response(answer_text)
            result["success"] = True
            result["thinking"] = thinking_text
            result["search_queries"] = search_queries
            
            # Send complete event
            self._send_event("complete", result)
            
            return result
            
        except Exception as e:
            error_result = {
                "success": False,
                "error": f"流式处理失败: {str(e)}"
            }
            self._send_event("error", error_result)
            return error_result
    
    def _parse_json_response(self, content: str) -> Dict[str, Any]:
        """Parse JSON response from LLM"""
        try:
            # Clean markdown code blocks if present
            json_str = content.strip()
            if json_str.startswith('```json'):
                json_str = json_str.replace('```json', '', 1).replace('```', '', 1)
            elif json_str.startswith('```'):
                json_str = json_str.replace('```', '', 1).replace('```', '', 1)
            
            return json.loads(json_str.strip())
            
        except json.JSONDecodeError:
            # Try to extract JSON from text
            import re
            match = re.search(r'\{.*\}', content, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    pass
            
            return {
                "error": "解析响应失败",
                "raw": content
            }
    
    def _send_event(self, event_type: str, data: Dict[str, Any]):
        """Send event to stdout for Node.js to consume"""
        event = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        # Print as JSON with special marker for easy parsing
        print(f"__EVENT__{json.dumps(event, ensure_ascii=False)}__END__", flush=True)


def main():
    """
    Main entry point for CLI usage
    Expects JSON input from stdin with the following structure:
    {
        "text": "content text",
        "imageUrls": ["url1", "url2"],
        "sourceUrl": "source url",
        "useWebSearch": true,
        "stream": false
    }
    """
    try:
        # Read input from stdin
        input_data = sys.stdin.read()
        request = json.loads(input_data)
        
        # Extract parameters
        text = request.get("text", "")
        image_urls = request.get("imageUrls", [])
        source_url = request.get("sourceUrl", "")
        use_web_search = request.get("useWebSearch", True)
        stream = request.get("stream", False)
        
        # Create service and analyze
        service = LLMService()
        result = service.analyze_content(
            text=text,
            image_urls=image_urls,
            source_url=source_url,
            use_web_search=use_web_search,
            stream=stream
        )
        
        # Output result as JSON
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0)
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": f"处理请求失败: {str(e)}"
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
