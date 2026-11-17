# @base-client/frame

Electron 客户端工程化构建框架。业务项目主要提供 `bc.config.js` 和
`electron-builder.config.js`，由 frame 统一处理 Web、Electron、加密、打包、安装器和子进程包。

## 命令

| 命令 | target / mode | 说明 |
|---|---|---|
| `dev:web` | web / development | 启动 webpack-dev-server |
| `build` | web / production | 产出 Web 发布包 |
| `dev:app` | app / development | 编译 main/preload/renderer 并启动 Electron |
| `pack` | app / production | 编译、加密/更新包/bytenode，并调用 electron-builder；`--pkg-only` 只产出更新包 |
| `installer` | app / production | 复用 `pack --dir` 产出的 unpacked 目录生成安装器 |

全局选项：`--env <name>`、`--config <path>`、`--pack-config <path>`、`--debug`。

## bc.config.js

`bc.config.js` 可以导出配置对象，也可以导出 `(ctx) => config`：

```js
module.exports = () => ({
    web: {},
    main: {},
    preload: {},
    renderer: {},
    encrypt: {
        key: '0123456789abcdef0123456789abcdef', // 启用加密时必填，32 个 ASCII 字节
        iv: 'fedcba9876543210',                  // 可选，16 个 ASCII 字节
    },
    bytenode: false,
});
```

客户端由宿主与包组成，项目必须提供 `src/main/pkg.js`（包主进程入口）。`main` 片段同时作用于
宿主（`src/main/index.js`）与包（`src/main/pkg.js`）两个入口（一次编译）。产物契约见 `docs/pkg-contract.md`。

加密 key 只从 `bc.config.js` 的 `encrypt.key` 读取，不读取环境变量，也不读取
`build/encrypt.key`。启用加密但缺少 key 时构建直接失败；`encrypt: false` 可显式关闭加密。
省略 `encrypt.iv` 时使用 key 的前 16 个字节，以保持现有兼容行为。

配置片段由 frame 使用 `webpack-merge` 合并；`renderer` 支持多入口配置。

## 库入口

```js
const {
    MODES, TARGETS,
    createCli, runCommand,
    replace, customMerge,
    logger,
} = require('@base-client/frame');
```

## 构建产物契约

- [加密构建产物契约](docs/crypto-artifact-contract.md)
- [证书文件契约](docs/certificate-artifact-contract.md)
- [图标构建产物契约](docs/icon-artifact-contract.md)
- [安装器脚本契约](docs/shell-artifact-contract.md)
- [bytenode 构建产物契约](docs/bytenode-artifact-contract.md)
- [构建目标解析契约](docs/build-target-resolution-contract.md)

## 环境与依赖

- Node `>=18.12.0`
- 必需 peer：`webpack@^5`、`webpack-dev-server@^5`
- 可选 peer：`electron`、`electron-builder`、`bytenode`

更多设计说明见 `docs/design/`。
