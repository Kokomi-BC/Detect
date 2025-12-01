1.实现对doubao模型的后端接入(避免api泄露)
以下是调用示例代码

curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 914b3c31-1b7b-4053-81e2-ea7546afae5a" \
  -d $'{
    "model": "doubao-seed-1-6-251015",
    "messages": [
        {
            "content": [
                {
                    "image_url": {
                        "url": "https://ark-project.tos-cn-beijing.ivolces.com/images/view.jpeg"
                    },
                    "type": "image_url"
                },
                {
                    "text": "图片主要讲了什么?",
                    "type": "text"
                }
            ],
            "role": "user"
        }
    ]
}'

2.编写prompt使doubao大模型判断文章和图片真假并返回特定文本（便于处理文本，详见4）

3.使用函数获取图片和文本输入至大模型（图片可以不存在）
 如果左侧输入框为链接，则在html提取完成后将提取出的图片和文本输入至大模型
 如果输入的是文本和图片，则将文本和图片输入至大模型
 如果提取失败（含超时），则不做任何动作

4.获取大模型的返回文本并进一步处理
内置部分假新闻逻辑问题

 获取大模型对新闻真假判断的概率值
   如果大概率为真则使用内置的逻辑（ai给出序号进行选择），并附加ai的简短解释（为什么是真新闻）
   如果有部分为假则给出假的部分及原因（文字描述）和带格式的假的部分完整的文本（哪里为假）
   如果大概率为假则使用内置的逻辑（ai给出序号进行选择），在界面附加ai的简短解释

 如果有部分为假使对格式进行处理，使得能够对ai给出的文本进行荧光色标黄，并附上标签（为何为假）

