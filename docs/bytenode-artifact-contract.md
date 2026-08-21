# Bytenode artifact contract

本文档属于 `@base-client/frame`，定义 `pack` 开启 bytenode 后的构建与运行时产物约定。

## 构建期依赖

- 使用方项目安装兼容版本的 `electron` 与 `bytenode`，frame 从项目根目录解析二者。
- frame 使用目标 Electron 可执行文件编译 `app/main/index.js`，不使用启动 CLI 的 Node/V8 直接编译。
- frame 等待字节码编译完成后再进入 electron-builder 阶段。

这样生成的字节码与目标 Electron 的 V8 版本保持一致；不同平台的构建仍使用各自项目中安装的 Electron 可执行文件。

## 安装包产物

开启 bytenode 后，frame 生成：

- `main/index.jsc`：主进程字节码；
- `main/loader.js`：Electron 主入口；
- `main/vendor/bytenode/`：与编译版本一致的私有字节码加载运行时。

`main/loader.js` 只引用 `./vendor/bytenode` 和 `./index.jsc`。它不依赖安装包根目录的 `node_modules/bytenode`，因此使用方无需为了 frame 生成的加载器修改 electron-builder 的 `files` 白名单，也无需把构建工具作为业务运行时依赖。

`bc.config.js` 设置 `bytenode: false` 时不生成上述产物，Electron 继续使用普通的 `main/index.js`。
