@echo off
echo Rebuilding Admin Dashboard...
cd /d "%~dp0"
node build.js
echo Build complete!
pause
