# Build target resolution contract

本文档属于 `@base-client/frame`，定义 app 打包命令的目标平台、架构与 unpacked 路径解析规则。

## 参数解析

`pack` 与 `installer` 在加载业务配置前统一解析 CLI 参数：

- 显式 `--platform` 支持 `win`、`mac`、`linux`；
- 省略 `--platform` 时，宿主 `win32`、`darwin`、`linux` 分别映射为 `win`、`mac`、`linux`；
- 显式 `--arch` 支持 `ia32`、`x64`、`armv7l`、`arm64`、`universal`、`loongarch64`（龙芯旧世界）、`loong64`（龙芯新世界，尚未支持）；
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

## 龙芯

龙架构上有两套互不兼容的软件体系（旧世界 ABI1.0、新世界 ABI2.0），deb 的架构名不同，Electron 也必须是对应世界编译的。
frame 按 dpkg 的架构名分成两个打包目标，**一个命令打一个包**，各自的配置固定在 `src/electron/loong.js`，项目不需要写：

| `--arch` | 世界 | Electron | deb `Architecture` | 状态 |
|---|---|---|---|---|
| `loongarch64` | 旧世界（如 Loongnix 20） | 龙芯镜像 22.3.27（`http://ftp.loongnix.cn/electron/LoongArch/`，`customDir: v22.3.27`） | `loongarch64` | 可用 |
| `loong64` | 新世界（如 deepin V23、新版麒麟） | 待定（官方没有龙芯版本） | `loong64` | 尚未支持：`pack`（`--pkg-only` 除外）与 `installer` 在编译前直接报错 |

- 判断目标机属于哪个世界看 `dpkg --print-architecture`（`uname -m` 两边都是 `loongarch64`，不能用来判断）。
- 两个目标在 electron-builder 内部都是 `Arch.loong64`：unpacked 目录都是 `linux-loong64-unpacked`；产物文件名里的架构改为 deb 架构名
  （如 `…_linux_loongarch64_…deb`），便于区分。
- electron-builder 用的是 frame 依赖的 `@base-client/electron-builder` 改版（支持 `loong64` 与 `deb.architecture`），
  不再需要从龙芯源安装龙芯版 electron-builder，也不用在官方版与龙芯版之间切换。
- 只能在 Linux 或 macOS 上打 deb（electron-builder 依赖 fpm）；`--dir` 可在任何系统上打。
- 项目的 `electron-builder.config.js` 仍可覆盖 `electronVersion`、`electronDownload`、`deb.architecture`（项目配置优先）。
