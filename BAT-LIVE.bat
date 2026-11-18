@echo off
chcp 65001 >nul
title CHU THAU TI HON - TikTok LIVE
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Chua cai Node.js. Tai ban LTS tai https://nodejs.org roi chay lai file nay.
  start https://nodejs.org
  pause
  exit /b
)
if not exist node_modules (
  echo Dang cai thu vien lan dau, cho 1-2 phut...
  call npm install --no-audit --no-fund
)
set PORT=3010
start "" http://localhost:3010
node server.js
pause
