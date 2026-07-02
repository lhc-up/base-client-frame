#!/bin/bash

# 软件卸载之后执行的脚本

# ============================================
# 以下变量由打包脚本自动注入，请勿手动修改
# APP_NAME: 应用可执行文件名，来自 package.json 的 name 字段
# ============================================
APP_NAME={{APP_NAME}}

# Delete the link to the binary
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove "$APP_NAME" "/usr/bin/$APP_NAME"
else
    rm -f "/usr/bin/$APP_NAME"
fi

#############################################################################

# 删掉桌面的快捷方式
function rm_shorcut {
    for FILENAME in /home/*; do
    if [ -d "${FILENAME}/桌面" ]; then
        rm -f $FILENAME/桌面/$APP_NAME.desktop
    elif [ -d "${FILENAME}/Desktop" ]; then
        rm -f $FILENAME/Desktop/$APP_NAME.desktop
    fi
    done
}

os=$(lsb_release -i -s)
if [ "$os" != "Loongnix" ]; then
    # 非龙芯系统时，删除快捷方式
    rm_shorcut;
fi

exit 0;