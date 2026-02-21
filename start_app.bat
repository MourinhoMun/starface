@echo off
echo Starting My Star Face App...

:: 1. Start Backend Server
echo Starting Backend (Port 3001)...
cd backend
start "My Star Face Backend" cmd /k "npm start"
cd ..

:: 2. Start Frontend Client
echo Starting Frontend (Port 5173)...
cd frontend
start "My Star Face Frontend" cmd /k "npm run dev"
cd ..

:: 3. Open Browser
echo Opening Browser...
timeout /t 3 >nul
explorer "http://localhost:5173"

echo App started! You can close this window if you want, but keep the other two windows open.
pause
