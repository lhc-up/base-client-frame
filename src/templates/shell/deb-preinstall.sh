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

# 更新依赖项，更新脚本优化
function update_depends {
    # 检查 libappindicator3-1 是否已安装
    if dpkg -l | grep -qw libappindicator3-1; then
        echo "libappindicator3-1 已安装。"
    else
        echo "libappindicator3-1 未安装，尝试安装..."
        # 更新软件包列表
        apt-get update
        # 尝试安装 libappindicator3-1
        apt-get install -y libappindicator3-1

        # 再次检查是否安装成功
        if dpkg -l | grep -qw libappindicator3-1; then
            echo "libappindicator3-1 安装成功。"
        else
            echo "安装失败，请手动安装或检查您的软件源设置。"
        fi
    fi
}
# update_depends;

os=$(lsb_release -i -s)
if [ "$os" != "Loongnix" ]; then
    # 非龙芯系统时，删除快捷方式
    rm_shorcut;
fi

exit 0;