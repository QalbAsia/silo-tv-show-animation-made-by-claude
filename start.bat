@echo off
title SILO - short film
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node "%~dp0serve.js"
goto end
:nonode
echo.
echo   Node.js was not found on this computer, so the phone link cannot be made.
echo   The film will open on this computer only.
echo   To watch on a phone, install Node.js from https://nodejs.org and start again.
echo.
start "" "%~dp0index.html"
pause
:end
