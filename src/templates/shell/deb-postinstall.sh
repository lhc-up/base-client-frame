#!/bin/bash

# 软件安装完成之后执行的脚本

# ============================================
# 以下变量由打包脚本自动注入，请勿手动修改
# APP_NAME: 应用可执行文件名，来自 package.json 的 name 字段
# APP_INSTALL_DIR: 应用安装目录，来自 electron-builder 配置的 linux.installDir（frame 默认 /opt/<appId>）
# ============================================
APP_NAME={{APP_NAME}}
APP_INSTALL_DIR={{APP_INSTALL_DIR}}

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L "/usr/bin/$APP_NAME" -a -e "/usr/bin/$APP_NAME" -a "`readlink "/usr/bin/$APP_NAME"`" != "/etc/alternatives/$APP_NAME" ]; then
        rm -f "/usr/bin/$APP_NAME"
    fi
    update-alternatives --install "/usr/bin/$APP_NAME" "$APP_NAME" "$APP_INSTALL_DIR/$APP_NAME" 100 || ln -sf "$APP_INSTALL_DIR/$APP_NAME" "/usr/bin/$APP_NAME"
    # 去掉指向其他目录的同名候选（如旧版本装在 /opt/<productName> 时注册的）：优先级相同时自动模式可能仍指向旧目录
    for OTHER in $(update-alternatives --list "$APP_NAME" 2>/dev/null); do
        if [ "$OTHER" != "$APP_INSTALL_DIR/$APP_NAME" ]; then
            update-alternatives --remove "$APP_NAME" "$OTHER" || true
        fi
    done
else
    ln -sf "$APP_INSTALL_DIR/$APP_NAME" "/usr/bin/$APP_NAME"
fi

# SUID chrome-sandbox for Electron 5+
chmod 4755 "$APP_INSTALL_DIR/chrome-sandbox" || true

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
    for FILENAME in /home/*; do
        DESKTOP_DIR=""
        if [ -d "${FILENAME}/桌面" ]; then
            DESKTOP_DIR="${FILENAME}/桌面"
        elif [ -d "${FILENAME}/Desktop" ]; then
            DESKTOP_DIR="${FILENAME}/Desktop"
        fi
        if [ -n "$DESKTOP_DIR" ]; then
            cp "$SHOTCUT_PATH" "$DESKTOP_DIR/"
            # 属主改为该用户、权限 755：快捷方式需要可执行权限才生效（缺失时图标上会有权限标志）；
            # 不给其他用户写权限，避免被改写启动命令（原先的权限所有人可写且带 setuid 位）
            chown "$(stat -c '%u:%g' "$FILENAME")" "$DESKTOP_DIR/$SHOTCUT_NAME" || true
            chmod 755 "$DESKTOP_DIR/$SHOTCUT_NAME"
        fi
    done
}

os=$(lsb_release -i -s)
if [ "$os" != "Loongnix" ]; then
    # 非龙芯系统时，创建快捷方式
    mk_shorcut;
fi

exit 0;
