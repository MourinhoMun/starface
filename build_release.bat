@echo off
chcp 65001 >nul
echo ===== My Star Face 打包 =====

:: 读取 API key
for /f "tokens=2 delims==" %%A in ('findstr /i "AI_API_KEY" backend\.env') do set EMBED_KEY=%%A

if "%EMBED_KEY%"=="" (
    echo 错误：未找到 AI_API_KEY，请检查 backend\.env
    pause
    exit /b 1
)

:: 构建前端
echo [1/3] 构建前端...
cd frontend
call npm run build
if errorlevel 1 ( echo 前端构建失败 & pause & exit /b 1 )
cd ..

:: 内嵌 API key 到 backend/server.js（临时替换，打包后还原）
echo [2/3] 内嵌 API Key...
powershell -NoProfile -Command "(Get-Content 'backend\server.js') -replace '__EMBEDDED_AI_KEY__', '%EMBED_KEY%' | Set-Content 'backend\server.js'"

:: 打包 Electron
echo [3/3] 打包 Electron...
cd frontend
call npx electron-builder --win
cd ..

:: 还原 server.js（把 key 替换回占位符）
powershell -NoProfile -Command "(Get-Content 'backend\server.js') -replace '%EMBED_KEY%', '__EMBEDDED_AI_KEY__' | Set-Content 'backend\server.js'"

echo.
echo ===== 完成！安装包在 frontend\dist_electron\ =====
pause
