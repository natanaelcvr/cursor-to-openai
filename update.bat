@echo off
chcp 65001 >nul
REM Encoding: UTF-8

echo start update process...

REM Restore specific proxy server files
git checkout HEAD -- src/proxy/cursor_proxy_server_android_arm64 ^
                   src/proxy/cursor_proxy_server_linux_amd64 ^
                   src/proxy/cursor_proxy_server_windows_amd64.exe

if %ERRORLEVEL% neq 0 (
    echo error:restore proxy server file failed
    goto fail
)

REM Pull remote updates, keeping server-side changes
git pull -X theirs

if %ERRORLEVEL% neq 0 (
    echo error:pull update failed,maybe network problem or conflict
    goto fail
)

echo update success
goto end

:fail
echo update failed,please check network connection or solve conflict
exit /b 1

:end
pause