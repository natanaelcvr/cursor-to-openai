@echo off
chcp 65001 >nul
REM Encoding: UTF-8

REM Install dependencies
echo install dependencies...
call npm install --no-fund --quiet --no-audit

REM Check exit status of previous command
if %ERRORLEVEL% neq 0 (
    echo dependencies installation failed,maybe start application failed
)

REM Start application
echo start application...
call npm start
pause