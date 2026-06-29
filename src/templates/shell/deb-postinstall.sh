#!/bin/sh
# DEB 安装后钩子：命令行链接、桌面快捷方式、SUID chrome-sandbox
APP_NAME="{{APP_NAME}}"
APP_DIR="{{APP_DIR_NAME}}"
APP_ID="{{APP_ID}}"

INSTALL_DIR="/opt/${APP_DIR}"
BIN_LINK="/usr/local/bin/${APP_DIR}"

# 命令行链接
ln -sf "${INSTALL_DIR}/${APP_DIR}" "${BIN_LINK}" 2>/dev/null || true

# SUID chrome-sandbox
if [ -f "${INSTALL_DIR}/chrome-sandbox" ]; then
    chmod 4755 "${INSTALL_DIR}/chrome-sandbox" || true
fi

# 龙芯系统额外步骤
if [ -f /etc/loongnix-release ] || grep -qi "loongnix" /etc/os-release 2>/dev/null; then
    echo "[${APP_NAME}] Loongnix postinstall completed"
fi

exit 0
