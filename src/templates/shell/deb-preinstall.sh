#!/bin/bash

# 软件安装之前执行的脚本

# ============================================
# 以下变量由打包脚本自动注入，请勿手动修改
# APP_NAME: 应用可执行文件名，来自 package.json 的 name 字段
# ============================================
APP_NAME={{APP_NAME}}

# 杀掉正在运行的进程
function kill_running_app {
    pkill -f $APP_NAME
}
kill_running_app;

# 删掉桌面的快捷方式，以免用户打开旧版本
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