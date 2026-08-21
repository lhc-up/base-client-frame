# Build target resolution contract

本文档属于 `@base-client/frame`，定义 app 打包命令的目标平台、架构与 unpacked 路径解析规则。

## 参数解析

`pack` 与 `installer` 在加载业务配置前统一解析 CLI 参数：

- 显式 `--platform` 支持 `win`、`mac`、`linux`；
- 省略 `--platform` 时，宿主 `win32`、`darwin`、`linux` 分别映射为 `win`、`mac`、`linux`；
- 显式 `--arch` 支持 `ia32`、`x64`、`armv7l`、`arm64`、`universal`、`loong64`；
- 省略 `--arch` 时使用 `process.arch`；
- 无法映射的平台或不受支持的架构立即报错，不生成含 `undefined` 的产物路径。

解析后的值写回命令 ctx。`electron-builder.config.js`、`__BC_BUILD__.platform/arch`、electron-builder targets、`pack --dir` 产物检查和 `installer` 的 `prepackaged` 路径都消费同一结果。

## Unpacked 目录

frame 遵循 electron-builder 的目录命名：

- Windows/Linux x64：`win-unpacked` / `linux-unpacked`；
- Windows/Linux 其他架构：`{platform}-{arch}-unpacked`；
- macOS x64：`mac`；
- macOS 其他架构：`mac-{arch}`。

因此同一宿主上依次执行 `pack --dir` 与 `installer` 时，可以同时省略 platform/arch；两个命令会解析到同一目录。跨平台打包或两次命令目标不同时仍应显式传参。
