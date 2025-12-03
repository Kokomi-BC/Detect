@echo off
echo ================================
echo 设置 Python 环境
echo ================================

REM 检查 Python 是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到 Python 3
    echo 请安装 Python 3.8 或更高版本
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version') do set PYTHON_VERSION=%%i
echo 找到 Python 版本: %PYTHON_VERSION%

REM 安装 Python 依赖
echo.
echo 安装 Python 依赖...
cd python
python -m pip install -r requirements.txt --user

if errorlevel 1 (
    echo × Python 依赖安装失败
    exit /b 1
) else (
    echo √ Python 依赖安装成功
)

cd ..

REM 检查环境变量
echo.
echo 检查环境变量...
if "%ARK_API_KEY%"=="" (
    echo ⚠ 警告: 未设置 ARK_API_KEY 环境变量
    echo 请在 .env 文件中设置或设置环境变量：
    echo   set ARK_API_KEY=your-api-key-here
) else (
    echo √ 找到 ARK_API_KEY
)

echo.
echo ================================
echo Python 环境设置完成
echo ================================
pause
