# 图标构建产物契约

## 业务输入

业务项目只提供一个客户端图标源文件：

```text
build/icon.png
```

`build/icon.png` 只服务于 Electron 客户端图标。业务项目不需要维护 `build/icons/`，也不需要预生成 ico、icns 或多尺寸 PNG。

## frame 产物

pack 阶段 frame 从 `build/icon.png` 生成客户端图标到 `dist/icons/`，并在业务没有显式覆盖时自动注入 electron-builder 的 Windows、macOS 和 Linux 图标配置。

pack 阶段 frame 还把 `build/icon.png` 原样复制为安装包的 `resources/app-icon.png`，运行时由 toolkit `BaseWindow` 在 Linux 上用作窗口图标（任务栏、Alt+Tab 不依赖 `.desktop` 的 `StartupWMClass` 能否关联上）。业务不要在 `resources/` 中另放图标。

网页 favicon 不属于 frame 的客户端图标契约，由业务在 renderer/public 静态资源中自行维护和引用。
