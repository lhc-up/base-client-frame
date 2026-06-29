#!/bin/sh
# DEB 卸载后钩子：清命令行链接、清桌面快捷方式
APP_DIR="{{APP_DIR_NAME}}"
BIN_LINK="/usr/local/bin/${APP_DIR}"

rm -f "${BIN_LINK}" 2>/dev/null || true
exit 0
