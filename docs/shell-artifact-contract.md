# 安装器脚本契约

安装器所需的 NSIS/FPM 脚本由 frame 在打包阶段生成，业务项目不需要也不应该维护这些脚本。

## 业务项目边界

- 业务项目的 `build/` 不放 `shell/` 目录。
- 业务项目的 `electron-builder.config.js` 不配置 `build/shell/*` 路径。
- 业务只提供自己的产品配置、图标、证书等输入；安装器脚本模板和变量替换由 frame 负责。

## frame 产物

pack/installer 阶段 frame 会在 `dist/shell/` 生成：

- `win-installer.nsh`
- `deb-preinstall.sh`
- `deb-postinstall.sh`
- `deb-postrm.sh`

如果业务没有显式覆盖对应的 electron-builder 字段，frame 会自动将 NSIS/FPM 配置指向这些产物。`dist/shell/` 是构建中间产物，不属于业务源码目录，也不对业务运行时代码开放。
