#!/bin/bash

# 软件安装完成之后执行的脚本

# ============================================
# 以下变量由打包脚本自动注入，请勿手动修改
# APP_NAME: 应用可执行文件名，来自 package.json 的 name 字段
# APP_DIR_NAME: 应用安装目录名，来自 electron-builder-config.js 的 productName 字段
# ============================================
APP_NAME={{APP_NAME}}
APP_DIR_NAME={{APP_DIR_NAME}}

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L "/usr/bin/$APP_NAME" -a -e "/usr/bin/$APP_NAME" -a "`readlink "/usr/bin/$APP_NAME"`" != "/etc/alternatives/$APP_NAME" ]; then
        rm -f "/usr/bin/$APP_NAME"
    fi
    update-alternatives --install "/usr/bin/$APP_NAME" "$APP_NAME" "/opt/$APP_DIR_NAME/$APP_NAME" 100 || ln -sf "/opt/$APP_DIR_NAME/$APP_NAME" "/usr/bin/$APP_NAME"
else
    ln -sf "/opt/$APP_DIR_NAME/$APP_NAME" "/usr/bin/$APP_NAME"
fi

# SUID chrome-sandbox for Electron 5+
chmod 4755 "/opt/$APP_DIR_NAME/chrome-sandbox" || true

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

#################################################
# 1. 生成桌面快捷方式
function mk_shorcut {
    # 此脚本是以root权限运行的，无法获取当前USER、HOME等这些环境变量，这里遍历home文件夹，找到/home/${USER}/Desktop，并把快捷方式复制过去
    SHOTCUT_NAME=$APP_NAME.desktop
    SHOTCUT_PATH=/usr/share/applications/$SHOTCUT_NAME
    # 赋予当前用户所有权限（至少要包含可执行权限，否则快捷方式不生效；权限缺失的话，图标上会有个权限的标志，不美观）
    for FILENAME in /home/*; do
    if [ -d "${FILENAME}/桌面" ]; then
        cp $SHOTCUT_PATH $FILENAME/桌面
        chmod 4777 $FILENAME/桌面/$SHOTCUT_NAME
    elif [ -d "${FILENAME}/Desktop" ]; then
        cp $SHOTCUT_PATH $FILENAME/Desktop
        chmod 4777 $FILENAME/Desktop/$SHOTCUT_NAME
    fi
    done
}

os=$(lsb_release -i -s)
if [ "$os" != "Loongnix" ]; then
    # 非龙芯系统时，创建快捷方式
    mk_shorcut;
fi

exit 0;