!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "WinVer.nsh"
!include "LogicLib.nsh"

XPStyle on
Var Dialog
Var Label

; https://nsis.sourceforge.io/Docs/nsDialogs/Readme.html#step-page
; 在同一个自定义页面中通过逻辑判断即可实现，但把
; GetDlgItem $0 $HWNDPARENT 1
; ShowWindow $0 ${SW_HIDE}
; 语句写在If语句中时，触发了electron-builder的bug，导致安装包被windows报病毒(https://github.com/electron-userland/electron-builder/issues/4793)
; 尝试使用Goto语句也报错

; 这里通过两个自定义页面实现
; 检测失败页面写在前面，此页面只显示取消按钮，环境正常时直接跳过页面
; 检测成功页面写在后面，此页面隐藏上一步按钮
Page Custom OsCheckFail OsCheckFailLeave
Page Custom OsCheckPass OsCheckPassLeave

Function OsCheckPass

    ; 头部标题及描述
    !insertmacro MUI_HEADER_TEXT "客户端安装环境检测" "当前电脑软件安装环境检测通过！"

    ; 隐藏上一步按钮
    GetDlgItem $0 $HWNDPARENT 3
    ShowWindow $0 ${SW_HIDE}

    ; 正文部分
    nsDialogs::Create 1018
    Pop $Dialog
    ${If} $Dialog == error
        Abort
    ${EndIf}

    ;  Each of those macros takes 5 parameters - x, y, width, height and text.
    ${NSD_CreateLabel} 0 0 100% 100% "请点击“下一步”按钮进行客户端安装！（如电脑有安装还原卡、360安全卫士等软件，请先关闭后再继续安装）"
    Pop $Label
    nsDialogs::Show

FunctionEnd

Function OsCheckFail

    ${If} ${AtLeastWin7}
        Abort
    ${EndIf}

    ; 头部标题及描述
    !insertmacro MUI_HEADER_TEXT "客户端安装环境检测" "当前电脑操作系统版本较低！"

    ; 隐藏下一步按钮
    GetDlgItem $0 $HWNDPARENT 1
    ShowWindow $0 ${SW_HIDE}
        
    ; 修改取消按钮文字为【我知道了】，点击后退出向导
    GetDlgItem $1 $HWNDPARENT 2
    SendMessage $1 ${WM_SETTEXT} 0 'STR:我知道了'

    ; 正文部分
    nsDialogs::Create 1018
    Pop $Dialog
    ${If} $Dialog == error
        Abort
    ${EndIf}

    ;  Each of those macros takes 5 parameters - x, y, width, height and text.
    ${NSD_CreateLabel} 0 0 100% 100% "请在Windows7及以上操作系统环境（含各版本旗舰版、家庭版、专业版等）下安装使用，不支持XP系统及以下版本！"
    Pop $Label
    nsDialogs::Show

FunctionEnd

Function OsCheckPassLeave
  # Form validation here. Call Abort to go back to the page.
  # Use !insertmacro MUI_INSTALLOPTIONS_READ $Var "InstallOptionsFile.ini" ...
  # to get values.
FunctionEnd

Function OsCheckFailLeave
  # Form validation here. Call Abort to go back to the page.
  # Use !insertmacro MUI_INSTALLOPTIONS_READ $Var "InstallOptionsFile.ini" ...
  # to get values.
FunctionEnd
