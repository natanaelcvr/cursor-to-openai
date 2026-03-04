#!/bin/bash

echo "start update process..."

# Restore specific proxy server files
git checkout HEAD -- src/proxy/cursor_proxy_server_android_arm64 \
                   src/proxy/cursor_proxy_server_linux_amd64 \
                   src/proxy/cursor_proxy_server_windows_amd64.exe

if [ $? -ne 0 ]; then
    echo "error:restore proxy server file failed"
    exit 1
fi

# Pull remote updates, keeping server-side changes
git pull -X theirs

if [ $? -ne 0 ]; then
    echo "error:pull update failed,maybe network problem or conflict"
    exit 1
fi

echo "update success" 
