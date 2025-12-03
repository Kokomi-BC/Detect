#!/bin/bash

echo "================================"
echo "设置 Python 环境"
echo "================================"

# 检查 Python 是否安装
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到 Python 3"
    echo "请安装 Python 3.8 或更高版本"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
echo "找到 Python 版本: $PYTHON_VERSION"

# 安装 Python 依赖
echo ""
echo "安装 Python 依赖..."
cd python
python3 -m pip install -r requirements.txt --user

if [ $? -eq 0 ]; then
    echo "✓ Python 依赖安装成功"
else
    echo "✗ Python 依赖安装失败"
    exit 1
fi

cd ..

# 检查环境变量
echo ""
echo "检查环境变量..."
if [ -z "$ARK_API_KEY" ]; then
    echo "⚠ 警告: 未设置 ARK_API_KEY 环境变量"
    echo "请在 .env 文件中设置或导出环境变量："
    echo "  export ARK_API_KEY=your-api-key-here"
else
    echo "✓ 找到 ARK_API_KEY"
fi

echo ""
echo "================================"
echo "Python 环境设置完成"
echo "================================"
