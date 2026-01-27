@echo off
echo ====================================
echo Cleaning Up Ports
echo ====================================
echo.

echo Checking for processes on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Killing PID %%a on port 3000
    taskkill /F /PID %%a 2>nul
)

echo Checking for processes on port 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo Killing PID %%a on port 3001
    taskkill /F /PID %%a 2>nul
)

echo.
echo ====================================
echo Ports 3000 and 3001 are now free!
echo ====================================
timeout /t 2 >nul
