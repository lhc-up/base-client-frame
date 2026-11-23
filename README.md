# @base-client/frame

Electron 客户端工程化构建框架。业务项目主要提供 `bc.config.js` 和
`electron-builder.config.js`，由 frame 统一处理 Web、Electron、打包、安装器和子进程包（产物加密暂不支持）。

## 命令

| 命令 | target / mode | 说明 |
|---|---|---|
| `dev:web` | web / development | 启动 webpack-dev-server |
| `build` | web / production | 产出 Web 发布包 |
| `dev:app` | app / development | 编译 main/preload/renderer 并启动 Electron；`--inspect [port]` 开启主进程调试（默认端口 9229，VS Code 附加到进程或 `chrome://inspect` 连接） |
| `pack` | app / production | 编译、更新包、bytenode，并调用 electron-builder；`--pkg-only` 只产出更新包 |
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
- `typeof process.env.BC_xxx` 同样会替换：已声明的求值为 `"string"`，未声明的变为 `typeof undefined`（并警告）。
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
| `encrypted`、`encryptKey` | 加密状态；产物加密暂不支持，`encrypted` 恒为 `false`、`encryptKey` 为 `undefined` |
| `isPkgDev` | 本产物是否本地调试构建：dev 命令下为 `true`，其他命令下为 `false`（宿主据此设置宿主运行时 `isHostDev`，见 toolkit `docs/design/pkg-source.md`） |
| `devUrl` | 本地调试时的页面地址（由 host、port 拼出，如 `http://localhost:8023/`），其他命令下为 `undefined` |

构建时间戳单独注入为 **`__BC_BUILD_TIME__`**（毫秒时间戳），**不属于 `__BC_BUILD__`**：它每次构建都不同，
放进整体对象会让「整体引用 `__BC_BUILD__`」的产物每次都不一样（`contenthash` 失效、构建不可复现）。
需要构建时间时逐字段读 `__BC_BUILD_TIME__`。

## 资源目录

项目根目录的 `resources/` 是安装包 `resources/` 的镜像，凡是随安装包分发、运行时读取的资源都放这里。
打包时 frame 先把安装包 `resources/` 的内容整理到 `dist/resources/`，再整体复制进安装包：

| 源码 | 安装包 |
|---|---|
| `resources/packages/*.asax`（内置的其他包） | `resources/packages/*.asar` |
| —（自身的包，frame 构建） | `resources/packages/<name>-<env>-v<版本>.asar` |
| `build/icon.png` | `resources/app-icon.png`（应用图标，toolkit `BaseWindow` 在 Linux 上用作窗口图标） |
| `resources/` 下其他内容（如 `addons/`） | 原样复制 |
| `.gitkeep`、`.gitignore`、`.DS_Store`、`Thumbs.db`、`desktop.ini` | 不复制 |

- 落盘名冲突（内置包与自身包同名、同一个包同时有 `.asax` 与 `.asar`）时构建报错。
- 应用图标只来自 `build/icon.png`，项目不要在 `resources/` 里放图标；`resources/app-icon.png` 已存在时构建报错。
- 安装包里的 `resources/` 是什么样，打包后直接看 `dist/resources/`。
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
    bytenode: false,
    circularDependency: 'warn', // 可选：'warn'（默认）| 'error' | false，见下方「循环依赖检测」
});
```

客户端由宿主与包组成，项目必须提供 `src/main/pkg.js`（包主进程入口）。`main` 片段同时作用于
宿主（`src/main/index.js`）与包（`src/main/pkg.js`）两个入口（一次编译）。产物契约见 `docs/pkg-contract.md`。

**产物加密暂不支持**：运行时解密尚未实现，开启后页面与 preload 无法加载。不写 `encrypt`（或写
`encrypt: false`）即不加密；写了 `encrypt` 的其他值时 `pack` 直接报错。加密代码保留在 `src/pack/encrypt.js`，
见 `docs/crypto-artifact-contract.md`。

配置片段由 frame 使用 `webpack-merge` 合并；`renderer` 支持多入口配置。

### frame 提供的通用配置

与技术栈无关的部分由 frame 统一，项目的 `bc.config.js` 只写 Vue / Less / babel、别名、页面模板、本地调试代理等。

**循环依赖检测**（main / preload / renderer / web）：构建时检查项目自己的代码（不含 `node_modules`）有没有循环引用，
`import`、`require` 及两者混用都算，`import()` 动态导入不算。默认作为警告输出循环路径，不影响构建，例如：

```text
⚠ 循环依赖：src/renderer/libs/js/a.js → src/renderer/libs/js/b.js → src/renderer/libs/js/a.js
```

`bc.config.js` 的 `circularDependency: 'error'` 改为构建失败，`false` 关闭。写在函数里的 `require('./x')`
也会报出（构建期分不出写在顶层还是函数里）；`require(变量)` 构建期不知道引用的文件，查不出来。

**main**：项目装了 `@base-client/toolkit` 时自动接入 `toolkitExternals`，宿主与包里的 toolkit 引用一律从宿主运行时取，项目不用再写。

**renderer / web**：frame 在合并项目配置**之后**补默认，只补项目没写的部分，项目写了就以项目为准：

| 默认 | 项目怎样覆盖 |
|---|---|
| js 文件名：生产环境 `[name].[contenthash:8].js`，开发环境 `[name].js` | 写 `output.filename` / `output.chunkFilename` |
| 图片规则：`images/`，小于 2KB 内联 | 写一条能匹配 `.png` 的规则 |
| 字体规则：`fonts/` | 写一条能匹配 `.woff2` 的规则 |
| 生产环境把 CSS 抽离到 `css/`（需项目安装 `mini-css-extract-plugin`） | 在 `plugins` 里自己 new `MiniCssExtractPlugin` |
| 生产环境压缩 CSS，保留 webpack 默认的 JS 压缩（需项目安装 `css-minimizer-webpack-plugin`） | 写 `optimization.minimizer` |
| 仅 renderer：生产环境拆分公共代码 `splitChunks: { chunks: 'all' }`（主页面与启动页共用的库只打一份，拆出的文件与页面同在包内） | 写 `optimization.splitChunks`（`false` 关闭） |

样式规则的第一个 loader 用 `styleLoader(ctx)`：开发环境为 `style-loader`，生产环境为 CSS 抽离 loader，
并带好 `publicPath: '../'`（css 在 `css/` 下，引用的图片、字体在上一级）：

```js
const { styleLoader } = require('@base-client/frame');

module.exports = (ctx) => ({
    renderer: {
        module: {
            rules: [
                { test: /\.css$/, use: [styleLoader(ctx), 'css-loader'] },
            ],
        },
    },
});
```

## 库入口

```js
const {
    MODES, TARGETS,
    createCli, runCommand,
    replace, customMerge,
    logger,
    styleLoader,  // 样式规则的第一个 loader，见「frame 提供的通用配置」
} = require('@base-client/frame');

// 产物布局（构建期 createLayout，运行期 resolveLayout）
const { DESCRIPTOR_FILE, createLayout, resolveLayout, toOutputRelative } = require('@base-client/frame/paths');
```

## 产物布局

布局由 frame 固定，业务**不得在 `bc.config.js` 中覆盖 `output`**（构建期会校验并报错）：

| 产物 | 源码 | 编译产物 | 说明 |
|---|---|---|---|
| main | `src/main/index.js`、`src/main/pkg.js` | `app/main/index.js`、`app/main/pkg.js` | 一次编译、两个入口；`index` 随宿主，`pkg` 随包 |
| preload | `src/preload/index.js` | `app/preload/index.js` | 随宿主发布 |
| renderer | `src/renderer/index.js`（入口 chunk 为 `index`） | `app/renderer/**`，主页面 `app/renderer/index.html` | 整体随包发布 |
| 启动页 | `src/renderer/update/index.js` + `index.ejs`（可选） | `app/renderer/update.html` | 由 frame 构建，随包发布 |

代码里取路径统一用 `@base-client/frame/paths`：构建期 `createLayout(rootDir)` 返回 `src` / `out` 两组绝对路径，
运行期 `resolveLayout(__dirname)`（主进程产物目录）返回 `out` 那一组（如 `preload`），
`toOutputRelative` 转成 electron-builder / 描述文件用的相对写法。
改布局只改 `src/paths.js`。

### 启动页

项目有 `src/renderer/update/index.js` 时，frame 在渲染进程配置中自动加入启动页：沿用业务配置的 loader、别名等，
入口 chunk 为 `update`，模板为 `src/renderer/update/index.ejs`（`htmlWebpackPlugin.options.title` 为产品名），
产物为 `app/renderer/update.html`；业务的其他 HtmlWebpackPlugin 自动排除 `update` chunk。
业务配置中**不要**再写启动页的入口与 HtmlWebpackPlugin（构建期会报错）。`renderer` 为数组时，启动页加入提供 devServer 的那一份配置。

### 包描述文件

包根目录下的 `package.json`（`DESCRIPTOR_FILE`）记录包信息与三个入口，入口为包内相对路径：

```json
{ "name": "...", "env": "...", "version": "...", "main": "main/pkg.js", "renderer": "renderer/index.html", "update": "renderer/update.html" }
```

没有启动页时不写 `update`。`dev:app`（含 `--pkg-only`）在 dev server 根地址下提供同格式的描述文件
（`http://localhost:<端口>/package.json`），入口为可直接使用的值：`main` 为磁盘绝对路径，`renderer` / `update` 为 dev server 地址。
宿主据此把 dev server 当作一个包加载（toolkit `libs/pkg`，来源 `devServer` 只需配置 `url`）。

### 与 toolkit 的约定

frame 打包时按下面的名字放置文件，toolkit 运行时按同样的名字读取。两个包互不依赖、无法共享代码，
名字定义在 `src/paths.js`（toolkit 侧为 `src/main/frameContract.js`），两边的单测都断言这些值；**改动时两边必须同时改**。

| 常量 | 值 | 含义 |
|---|---|---|
| `DESCRIPTOR_FILE` | `package.json` | 包描述文件（包根目录下、dev server 根地址下） |
| `RESOURCES_DIR` | `resources` | 项目资源目录，打包时整体复制为安装包的 `resources/` |
| `BUILTIN_PKG_DIR` | `packages` | 资源目录下放内置包的子目录 |

## Linux 启动与沙箱

Linux 下 Electron 以 root 运行时必须带 `--no-sandbox`，否则启动即退出
（`Running as root without --no-sandbox is not supported`）。这个参数要在命令行上传：root 检查发生在 Chromium
初始化沙箱进程时，早于主进程 JS 执行，`app.commandLine.appendSwitch('no-sandbox')` 来不及生效。

electron-builder 的 `linux.executableArgs` 只写进 `.desktop` 文件的 `Exec=` 行（deb 没有默认值；AppImage 不配时默认带
`--no-sandbox`），因此各启动方式是否带参数如下：

| 启动方式 | 参数从哪来 | root 运行 |
|---|---|---|
| 桌面图标 / 应用菜单 | 项目 `electron-builder.config.js` 的 `linux.executableArgs: ['--no-sandbox']` | 支持 |
| 终端执行 `/usr/bin/<name>` | 无（安装脚本建的软链接直接指向程序） | 不支持，需手动加：`sudo <name> --no-sandbox` |
| 应用内重启（`app.relaunch()`） | 沿用本次启动的参数 | 与本次启动相同 |

非 root 运行时沙箱正常开启：安装脚本给 `chrome-sandbox` 设置了 SUID（`chmod 4755`）。
需要以 root 运行的项目必须在 `linux.executableArgs` 中写 `--no-sandbox`。

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
  命令启动时先按 `engines` 检查当前 Node，不满足即提示并退出（`src/core/node-version.js`）。项目根目录也放 `.nvmrc`。
- **产物运行时的 Node 是另一回事**：客户端运行在 Electron 主进程 / 渲染进程里，API 上限由 Electron 内置的 Node 决定
  （例如 Electron 22 内置 Node 16.17），**不由上面的 `engines` 表达**。业务与 toolkit 的运行时代码不得使用高于
  该版本的 API；toolkit 用 `eslint-plugin-n` 按 `peerDependencies.electron` 自动约束，见其 README「环境要求」。
  frame 中会打进主进程的 `src/paths.js` 同样按 Node 16.17 检查（`npm run lint`）；项目应对 `src/main`、`src/preload`、`src/shared` 做同样的检查。
- 必需 peer：`webpack@^5`、`webpack-dev-server@^5`
- 可选 peer：`electron`、`electron-builder`、`bytenode`

更多设计说明见 `docs/design/`。
