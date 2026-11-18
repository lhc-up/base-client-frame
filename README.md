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

## 环境变量

`--env <name>` 指代码对接的**后台环境**（如 dev / test / prod），与是否本地调试无关。是否本地调试只由命令决定：
`dev:web`、`dev:app` 即本地调试；两者可任意组合，例如 `pack --env test` 打出对接测试后台的安装包。

变量有两个来源，都挂在 `ctx.env` 上：

| 来源 | 变量 |
|---|---|
| `.env`（所有环境共用）与 `.env.<name>`（同名变量后者覆盖） | 项目自定义 |
| frame 在命令启动后生成（无法提前写进 `.env`，`.env` 中声明会报错） | 见下表 |

| frame 生成的变量 | 值 |
|---|---|
| `BC_DEV` | 本地调试状态：dev 命令下为 `'true'`，其他命令下为 `undefined` |
| `BC_DEV_URL` | 本地调试时的页面地址（由 host、port 拼出，如 `http://localhost:8023/`），其他命令下为 `undefined`。端口可能来自 `bc.config.js`，因此 `bc.config.js` 中读不到 |
| `BC_ENV` | `.env` 未声明时取 `--env` 的值 |

访问规则：

| 变量 | 可访问范围 | 写法 |
|---|---|---|
| `BC_` 开头 | 构建期 + 业务代码整个生命周期（main / preload / renderer / web） | 只能静态写 `process.env.BC_xxx`，构建期替换为字面量写进产物 |
| 其他 | 只在构建期（`bc.config.js`、`electron-builder.config.js` 经 `ctx.env`） | — |

- 不支持动态写法（`process.env[name]`、解构、整体引用 `process.env`）：不会被替换，运行时也读不到——
  `dev:app` 启动 Electron 时去掉了全部 `BC_*` 变量，与打包后的行为一致。
- `BC_` 变量会写进产物，不要放密钥等不能随客户端分发的值。

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
