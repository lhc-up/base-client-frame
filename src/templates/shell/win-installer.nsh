; Windows NSIS 自定义安装脚本（{{APP_NAME}} / {{APP_DIR_NAME}} / {{APP_ID}}）
; 版本检测 / 自定义安装页面 / 注册表清理等
!define APP_NAME "{{APP_NAME}}"
!define APP_DIR "{{APP_DIR_NAME}}"
!define APP_ID "{{APP_ID}}"

!macro preInit
    ; 安装前置逻辑
!macroend

!macro customInstall
    ; 自定义安装步骤
!macroend
