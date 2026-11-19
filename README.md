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

## 变量

`--env <name>` 指代码对接的**后台环境**（如 dev / test / prod），与是否本地调试无关。是否本地调试只由命令决定：
`dev:web`、`dev:app` 即本地调试；两者可任意组合，例如 `pack --env test` 打出对接测试后台的安装包。

变量分三层，命名空间不交叉：

| 层 | 来源 | 业务代码写法 | 构建配置（`bc.config.js` 等） | 进产物 |
|---|---|---|---|---|
| `__BC_BUILD__` 构建信息 | frame 产生（`package.json`、命令、命令行参数等） | `__BC_BUILD__.version` | 读不到 | ✓ |
| `BC_` 开头的变量 | `.env`（所有环境共用）与 `.env.<name>`（同名后者覆盖） | `process.env.BC_xxx` | `ctx.env.BC_xxx` | ✓ |
| 其他变量 | 同上 | 读不到 | `ctx.env.XXX` | ✗ |

- `process.env.BC_xxx` 中**未声明**的变量（各环境文件都没写）同样在构建期替换为 `undefined`，并输出构建警告，
  列出变量名与位置：变量名写错、某个环境文件漏写时在构建期就能发现。可选的变量在 `.env` 中声明为空值（`BC_xxx=`）。
- 两种写法都是**静态引用**，构建期逐个替换为字面量。不支持动态写法（`process.env[name]`、解构、整体引用
  `process.env` 或 `__BC_BUILD__`）：`process.env` 的动态写法不会被替换，运行时也读不到——`dev:app` 启动 Electron
  时去掉了全部 `BC_*` 变量，与打包后的行为一致；整体引用 `__BC_BUILD__` 会把全部确定性字段带进产物。
- `BC_` 变量会写进产物，不要放密钥等不能随客户端分发的值。

`__BC_BUILD__` 字段：

| 字段 | 说明 |
|---|---|
| `target` | `'app'` / `'web'` |
| `name`、`productName`、`version` | `package.json` |
| `env`、`envName` | `.env` 的 `BC_ENV`（未声明时取 `--env`）、`BC_ENV_NAME`（未声明时回退为 `env` 并输出构建警告） |
| `platform`、`arch`、`dir`、`sign` | `pack` 的命令行参数，其他命令下为 `undefined` / `false` |
| `encrypted`、`encryptKey` | 加密状态；`encryptKey` 只注入 app 宿主主进程 |
| `isPkgDev` | 本产物是否本地调试构建：dev 命令下为 `true`，其他命令下为 `false`（宿主据此设置宿主运行时 `isHostDev`，见 toolkit `docs/design/pkg-source.md`） |
| `devUrl` | 本地调试时的页面地址（由 host、port 拼出，如 `http://localhost:8023/`），其他命令下为 `undefined` |

构建时间戳单独注入为 **`__BC_BUILD_TIME__`**（毫秒时间戳），**不属于 `__BC_BUILD__`**：它每次构建都不同，
放进整体对象会让「整体引用 `__BC_BUILD__`」的产物每次都不一样（`contenthash` 失效、构建不可复现）。
需要构建时间时逐字段读 `__BC_BUILD_TIME__`。

## 资源目录

项目根目录的 `resources/` 是安装包 `resources/` 的镜像，凡是随安装包分发、运行时读取的资源都放这里，打包时 frame 整体复制：

| 源码 | 安装包 |
|---|---|
| `resources/packages/*.asax`（内置的其他包） | `resources/packages/*.asar` |
| —（自身的包，frame 构建） | `resources/packages/<name>-<env>-v<版本>.asar` |
| `resources/` 下其他内容（如 `addons/`、`icons/`） | 原样复制 |

- 落盘名冲突（内置包与自身包同名、同一个包同时有 `.asax` 与 `.asar`）时构建报错。
- 业务不要再在 `electron-builder.config.js` 里为这些资源写 `extraResources`。
- 运行时取资源根目录用 toolkit `main/libs/resourceRoot`。`build/icon.png` 是生成安装包图标的构建输入，留在 `build/`。

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

// 产物布局常量（运行时 preload 定位等）
const { createLayout, toOutputRelative, resolvePreload } = require('@base-client/frame/paths');
```

## 产物布局

布局由 frame 固定，业务**不得在 `bc.config.js` 中覆盖 `output`**（构建期会校验并报错）：

| 产物 | 源码 | 编译产物 | 说明 |
|---|---|---|---|
| main | `src/main/index.js`、`src/main/pkg.js` | `app/main/index.js`、`app/main/pkg.js` | 一次编译、两个入口 |
| preload | `src/preload/index.js` | `app/preload/index.js` | 随宿主发布 |
| renderer | 业务定义 | `app/renderer/**`（可多入口，须落在 `app/` 内） | 更新包只带 `renderer/` |

代码里取路径统一用 `@base-client/frame/paths`：`createLayout(rootDir)` 返回 `src` / `out` 两组绝对路径，
`toOutputRelative` 转成 electron-builder / 描述文件用的相对写法，`resolvePreload(__dirname)` 供窗口定位 preload。
改布局只改 `src/paths.js`。

## 构建产物契约

- [加密构建产物契约](docs/crypto-artifact-contract.md)
- [证书文件契约](docs/certificate-artifact-contract.md)
- [图标构建产物契约](docs/icon-artifact-contract.md)
- [安装器脚本契约](docs/shell-artifact-contract.md)
- [bytenode 构建产物契约](docs/bytenode-artifact-contract.md)
- [构建目标解析契约](docs/build-target-resolution-contract.md)

## 环境与依赖

- **构建环境 Node：`^20.19.0 || ^22.13.0 || >=24`**（见 `engines`，`.nvmrc` 为 22.15.1）。
  这是运行 frame 命令、跑 lint / 测试的 Node 版本，也是 `css-minimizer-webpack-plugin` 8 等构建工具的硬要求；
  低于它的 Node（如 16.x）上 CSS 压缩的 worker 会因缺少全局 `crypto` 失败。
- **产物运行时的 Node 是另一回事**：客户端运行在 Electron 主进程 / 渲染进程里，API 上限由 Electron 内置的 Node 决定
  （例如 Electron 22 内置 Node 16.17），**不由上面的 `engines` 表达**。业务与 toolkit 的运行时代码不得使用高于
  该版本的 API；toolkit 用 `eslint-plugin-n` 按 `peerDependencies.electron` 自动约束，见其 README「环境要求」。
- 必需 peer：`webpack@^5`、`webpack-dev-server@^5`
- 可选 peer：`electron`、`electron-builder`、`bytenode`

更多设计说明见 `docs/design/`。
