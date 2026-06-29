#!/bin/sh
# DEB 安装前钩子：杀进程、清旧快捷方式
APP_NAME="{{APP_NAME}}"
APP_DIR="{{APP_DIR_NAME}}"
APP_ID="{{APP_ID}}"

# 杀进程
pkill -f "${APP_DIR}" 2>/dev/null || true

# 龙芯系统识别（loongnix）
if [ -f /etc/loongnix-release ] || grep -qi "loongnix" /etc/os-release 2>/dev/null; then
    echo "[${APP_NAME}] Loongnix system detected"
fi

exit 0
