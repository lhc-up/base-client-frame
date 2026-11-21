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

## 龙芯（loong64）

`--arch loong64` 只能在龙芯构建机（Linux）上打包，Windows 打不了 deb。

**Electron**：官方 Electron 没有 loong64 版本。frame 在 `--arch loong64` 时把龙芯镜像合并进打包预设，项目不需要再写：

```js
// src/electron/loong64.js
electronVersion: '22.3.27',
electronDownload: {
    version: '22.3.27',
    mirror: 'http://ftp.loongnix.cn/electron/LoongArch/',
    customDir: 'v22.3.27',
    platform: 'linux',
    arch: 'loong64',
},
```

项目的 `electron-builder.config.js` 仍可覆盖这两项（项目配置优先）。

**electron-builder**：官方版依赖的 builder-util 不认识 loong64。它不会报错，而是改用构建机架构，打出一个「装着龙芯 Electron、标成 amd64」的 deb，龙芯机器装不上。因此 `pack`（`--pkg-only` 除外）与 `installer` 在 `--arch loong64` 时，会先检查项目里 electron-builder 实际使用的 builder-util 的 `Arch` 是否含 `loong64`。不含就停止打包，并在控制台输出完整处理步骤：

```text
[base-client] 打包 loong64 需要龙芯版 electron-builder，当前项目装的是官方版，已停止打包。
官方版不认识 loong64，会改用构建机架构，打出一个标成 amd64、龙芯机器装不上的安装包。

请在龙芯构建机（Linux）的项目根目录依次执行：
  1. rm -rf node_modules/electron-builder node_modules/builder-util package-lock.json
  2. npm i electron-builder@24.13.3 -D --registry=https://registry.loongnix.cn:4873/
  3. <本次执行的命令>

打完包后恢复官方版（否则本地调试 dev:app 可能因 Electron 架构不对而报 SIGSEGV）：
  4. git checkout -- package.json package-lock.json
  5. rm -rf node_modules && npm i
```
