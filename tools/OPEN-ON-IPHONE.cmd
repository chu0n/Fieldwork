@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required on this Windows computer. Use Node.js 20.19+ or 22.12+.
  pause
  exit /b 1
)
node "%~dp0serve-iphone.mjs"
pause
