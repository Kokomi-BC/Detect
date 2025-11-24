@echo off
chcp 65001 >nul

:: 设置项目目录
set "PROJECT_DIR=C:\Users\Kokomi\Desktop\new\Detect"

echo 正在切换到项目目录: %PROJECT_DIR%
cd /d "%PROJECT_DIR%"

echo 正在执行 npm run build...
call npm run build&& npm start

if errorlevel 1 (
    echo.
    echo 构建失败!
    pause
    exit /b 1
)

echo.
echo 构建成功!
echo 正在启动项目...
