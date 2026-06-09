# Frame M4：三进程 webpack 预设详细设计

> 所属：[Frame 总设计](./2026-05-28-frame-overview-design.md) 的 M4 模块。

## 一、定位

M4 为 Electron 三进程（main / preload / renderer）各产出一份**与编译目标无关的 webpack 预设骨架**，作为 M2 合并用户配置前的底座。预设只承载：构建结构（`target` / `entry` / `output` / `externals` / `resolve` / `devtool`）、静态资源处理（webpack 原生 Asset Modules）、环境变量注入（`DefinePlugin`）。

转译（babel / ts 等）、框架（vue / jsx 等）、CSS（含预处理器）等与编译目标或技术栈耦合的 loader **不在预设内**：编译目标在三进程间不同（main / preload 跑在 Electron 的 Node、renderer 跑在 Chromium），且随项目所用 Electron 版本而变，无法统一约定。这类 loader 由用户在 `bc.config.js` 按进程追加，经 M2 的 `webpack-merge` 叠加到预设之上。

## 二、接口

M4 对 M2 暴露三个 getter：

```js
getMainPreset({ rootDir, env, mode })      // → main 进程预设
getPreloadPreset({ rootDir, env, mode })   // → preload 进程预设
getRendererPreset({ rootDir, env, mode })  // → renderer 进程预设
```

| 入参 | 含义 |
|------|------|
| `rootDir` | 项目根目录（`process.cwd()`），用于解析 entry / output 绝对路径 |
| `env` | M3 返回的完整环境变量对象，供 `DefinePlugin` 过滤 `BC_` 子集注入 |
| `mode` | `MODES.DEV` / `MODES.PROD`（命令隐含），决定 `webpack.mode` 与 `devtool` |

三个 getter **各自独立产出完整预设，不共享中间层**：`mode`、`devtool`、`resolve.extensions` 基线、Asset Modules、`DefinePlugin` 在每个 getter 内分别构造。其中：
- **`BC_` 注入逻辑**复用同一个纯函数 `defineEnvPlugin`（见第六节），以免注入契约在三处漂移。
- **dev/prod 派生**：每个 getter 内自包含 `const { isDev, isProd } = deriveMode(mode)`，用 `isDev` / `isProd` 替代 `mode === 'development'` 字面量判断（mode 抽象详见 M1 §九）。preset 自己派生而非依赖外部 ctx，保持 getter 签名最简、与 M2 调用方解耦。

## 三、三进程骨架

| 维度 | main | preload | renderer |
|------|------|---------|----------|
| `target` | `electron-main` | `electron-preload` | `web`（无 nodeIntegration 的安全默认） |
| `entry` | `<root>/src/main/index.js` | `<root>/src/preload/index.js` | `<root>/src/renderer/index.js` |
| `output.path` | `<root>/app/main` | `<root>/app/preload` | `<root>/app/renderer` |
| `output.filename` | `index.js` | `index.js` | `index.js` |
| `output.libraryTarget` | `commonjs2` | `commonjs2` | —（默认） |
| `output.publicPath` | — | — | `'./'`（production） / `'/'`（development） |
| `externals` | `{ electron: 'commonjs electron' }` | 同 main | 无 |
| `resolve.extensions` | `.js` / `.mjs` / `.cjs` / `.json` | 同 main | 同 main |

要点：

- **`output.filename` 固定且不带 hash**：main / preload 的产物路径稳定，便于 Electron 加载；renderer 入口页面（`index.html`）由用户在 `bc.config.js` 自行注册 `html-webpack-plugin` 产出（frame 不内置该插件，详见第五节）。
- **renderer `output.publicPath` 按 mode 分支**：production 用 `'./'`，让打包后经 `file://` 加载时静态资源以相对路径正确解析；development 用 `'/'`，让 webpack-dev-server 把内存中的 emit assets（含 `index.html`）挂在根路径下，浏览器访问 `http://localhost:<port>/` 才能命中。两种 mode 用同一个值会顾此失彼：用 `'./'` 会导致 dev 时 dev-server 找不到根资源（`Cannot GET /`），用 `'/'` 会让生产产物在 `file://` 协议下定位到磁盘根目录而失败。
- **`resolve.extensions` 仅给基线**：`.vue` / `.ts` / `.jsx` 等扩展名由用户在追加对应 loader 时一并追加。

entry / output 等是默认约定，用户在 `bc.config.js` 对应进程下覆盖即可（经 M2 的 `webpack-merge` 生效）。

> **分包 / 多入口场景**：预设按"单入口、固定 `index.js` 文件名"约定，若需 `optimization.splitChunks` 或多 entry，请在 `bc.config.js` 该进程下覆盖 `entry` / `output.filename`；并**同步检查 `package.json` 的 `main` 字段**——它必须指向 main 进程的实际入口产物（参考 overview §四 用户项目约定）。

### 入口页面（renderer）

renderer 预设**不包含 `html-webpack-plugin`**——`renderer.plugins` 只包含 `defineEnvPlugin`。入口页面由用户在 `bc.config.js` 的 `renderer.plugins` 自行注册 `html-webpack-plugin` 产出。

设计取舍：

- `html-webpack-plugin` 的模板路径、`filename`、`inject`、`title`、`favicon`、`hash` 等参数因项目而异，预设若写死任何一项都会与用户期望冲突；`webpack-merge` 对 `plugins` 数组是 concat，预设内置 + 用户自注册会同时输出 `index.html`，触发 `Prevent writing to file that only differs in casing or query string` 之类的冲突。
- frame 的责任面收窄到"约定 entry / output / target / Asset Modules / DefinePlugin"。其它单例插件（如 `VueLoaderPlugin`、`MiniCssExtractPlugin`）同理——预设不包含，由用户在 `bc.config.js` 注册。

用户侧使用约定（不强制，是常见写法）：

- 模板放 `src/renderer/index.html` 或 `.ejs`，由用户在 `template` 字段指定
- `inject` 推荐 `true` 或 `'body'`，让 webpack 自动注入 `index.js`
- 生产构建产物入口约定为 `<root>/app/renderer/index.html`（由用户 `filename` 决定，默认即是），main 进程经 `loadFile` 加载（见 M5）

`html-webpack-plugin` 由用户在自己的 `devDependencies` 中声明。

## 四、devtool

按 mode 统一决定，三进程一致：

| mode | devtool | 说明 |
|------|---------|------|
| `MODES.DEV` | `source-map` | Electron DevTools 可定位源码 |
| `MODES.PROD` | `false` | 客户端 bundle 不输出 source map（呼应 M3 对客户端可反编译的安全考量）；如需保留堆栈，用户在 `bc.config.js` 自行打开 |

实现上，每个 preset 内 `devtool: isDev ? 'source-map' : false`（`isDev` 来自 preset 内的 `deriveMode(mode)`）。

## 五、静态资源（Asset Modules）

预设内置的唯一 `module.rules`，使用 webpack 5 原生 Asset Modules（零额外依赖，不涉及编译目标），三进程各自包含相同规则：

```js
module: {
  rules: [
    { test: /\.(png|jpe?g|gif|svg|webp|avif)$/i,    type: 'asset/resource' },
    { test: /\.(woff2?|eot|ttf|otf)$/i,             type: 'asset/resource' },
    { test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i,  type: 'asset/resource' },
  ],
},
output: {
  assetModuleFilename: 'assets/[name].[hash:8][ext][query]',
}
```

- 统一用 `asset/resource`：一律产出独立文件、不做 base64 内联，输出可预测。
- 资源被 bundle 引用的路径由 webpack 自动改写，故资源文件名带 hash 不影响用户侧 `html-webpack-plugin` 生成的 `index.html`（hash 仅作用于资源，不作用于 `index.js` 入口）。
- SVG-as-component、CSS 预处理器等仍由用户在 `bc.config.js` 追加规则，`webpack-merge` 将其 rules 追加到此基线之后。

## 六、环境变量注入（DefinePlugin）

实现 M3 的注入契约：从完整 env 对象中过滤 `BC_` 前缀子集，**逐键**定义为 `process.env.<key>`，三进程统一注入。

```js
const webpack = require('webpack');

function defineEnvPlugin(env) {
  const defs = {};
  for (const k of Object.keys(env || {})) {
    if (k.startsWith('BC_')) defs[`process.env.${k}`] = JSON.stringify(env[k]);
  }
  return new webpack.DefinePlugin(defs);
}
```

- **逐键定义 `process.env.BC_XXX`，不整体替换 `process.env`**：整体替换会清空运行时其余 `process.env.*` 读取（main / preload 跑在 Node，运行时仍可能读真实环境变量）；逐键定义只替换 `BC_` 引用，其余保持不变。
- 三进程注入同一份 `BC_` 子集（M3 规则：三者都可能被反编译，不分进程）。
- `defineEnvPlugin` 是供三者复用的纯函数，单独抽出到 `src/config/presets/define-env.js`；各进程 preset 在自己的 `plugins` 中调用它放入该插件。

## 七、webpack 输出静默约定

renderer 预设静默 webpack 与 webpack-dev-server 的原生输出，把编译反馈完全让位给 frame 自有 logger（详见 M1 §十、M5 §六）：

```js
// getRendererPreset
return {
  // ...
  stats: 'none',                                    // 静默 stats 行输出
  infrastructureLogging: { level: 'warn' },         // 静默 dev-server 启动 / HMR 等基础设施日志（仅留 warn+）
  // ...
};
```

配套的 dev-server 选项约定（M5 实现）：`devMiddleware.stats: false`，使热更新阶段的 stats 也不打印。

设计意图：
- frame 用 logger 接管编译反馈（一行摘要 `compileSuccess(name, ms, size)` 或 `compileFailure(name)` + 完整 `stats.toString({colors:true})`），与 webpack 原生输出**择一**而非并存，避免 dev 时控制台同时滚两份。
- 仅 renderer 加这一对配置：main / preload 一律走 frame 自有 `webpack(config, cb)` 回调路径，回调里手动调 logger，不依赖 stats 自动打印。
- 用户在 `bc.config.js` 仍可覆盖 `stats` / `infrastructureLogging`（webpack-merge 对象深合并），如需排查可临时打开。

## 八、模块边界

| 方向 | 接口 | 说明 |
|------|------|------|
| M2 → M4 | `getMainPreset / getPreloadPreset / getRendererPreset({ rootDir, env, mode })` | 取各进程预设骨架 |
| M3 → M4 | 完整 env 对象 + 注入契约（`BC_` 子集 → `process.env.<key>`） | M4 据此过滤并用 `DefinePlugin` 注入 |
| M1 mode 抽象 → M4 | `deriveMode(mode)` | 每个 preset 内自包含调用，派生 `isDev` / `isProd` |

M4 **不负责**：读取 `.env`（M3）、合并用户配置（M2）、`devServer`（M5）、产物清理与命令执行（M5 / M6 / M7）。

## 九、文件结构

```
src/config/presets/
├── main.js       # getMainPreset：electron-main / commonjs2 / externals / 入口出口 + mode / devtool / resolve / Asset Modules / DefinePlugin
├── preload.js    # getPreloadPreset：同 main，target = electron-preload
├── renderer.js   # getRendererPreset：web / publicPath './' / 入口出口 + mode / devtool / resolve / Asset Modules / DefinePlugin + stats:'none' + infrastructureLogging（html-webpack-plugin 由用户自注册）
├── define-env.js # 共享纯函数 defineEnvPlugin（实现 §六 注入契约）
└── index.js      # 汇出三个 getter 给 M2；并 re-export defineEnvPlugin
```
