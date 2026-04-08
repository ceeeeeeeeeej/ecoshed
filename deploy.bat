@echo off
REM EcoSched Admin Dashboard - Supabase Migration & Build Script
REM This script handles building the project and provides info for Supabase management

echo.
echo 🌱 EcoSched Admin Dashboard - Build & Supabase Info
echo ===================================================
echo.

REM Install dependencies
echo [INFO] Checking dependencies...
if exist package.json (
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencies are ready!
)

REM Run build
echo.
echo [INFO] Starting Production Build...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed!
    pause
    exit /b 1
)
echo [SUCCESS] Build completed successfully! Location: ./dist

echo.
echo 🛡️  Supabase Management Info
echo ============================
echo [REMINDER] Supabase does not host static websites directly.
echo [ACTION] Upload the contents of the 'dist' folder to your preferred host:
echo          - Netlify
echo          - Vercel
echo          - GitHub Pages
echo.
echo [INFO] Dashboard API is currently pointing to:
echo        URL: https://bfqktqtsjchbmopafgzf.supabase.co
echo.
echo [TIP] To manage your database schema, use the Supabase SQL Editor
echo       or the Supabase CLI: npm install -g supabase
echo.

set /p run_local="Do you want to run the dashboard locally now? (y/n): "
if /i "%run_local%"=="y" (
    echo [INFO] Starting local server at http://localhost:8000
    npm run serve:dist
)

echo.
echo 🎉 Done!
pause
