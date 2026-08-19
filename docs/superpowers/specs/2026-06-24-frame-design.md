# Frame 设计

`@base-client/frame` 是 **Electron 客户端 + Web 同构 SPA** 的本地构建与打包工具链。同一份源码经 frame 编译产出两类交付：Electron 安装包（app target）与浏览器静态资源（web target）。frame 不含运行时代码或对象——三进程与 web 入口由用户自管，frame 只负责"编译、调试、产分发物"。

## § 1 定位 & 工程约定

### 1.1 两个 target

- **`app`**：Electron 三进程（main / preload / renderer），产分发安装包 / 增量包 / 子应用包
- **`web`**：浏览器 SPA，产可部署静态资源

### 1.2 同构机制

`src/renderer/index.js` 是 app/web 共用入口。frame 编译期注入 `__BC_BUILD__.target` 字面量；webpack 死代码消除自动剔除非当前 target 的代码分支。用户写：

```js
if (__BC_BUILD__.target === 'app') {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('ready');
} else {
    fetch('/api/ready', { method: 'POST' });
}
```

app target 编译后 `if ("app" === "app") { ... } else { ... }` → else 分支整体消除，产物不含 `fetch`；web target 编译后 if 分支整体消除，产物不含 `require('electron')`——避免 web bundle 试图 resolve 不存在的 electron 模块。

**`__BC_BUILD__.target` 与 webpack `target` 的区分**：`__BC_BUILD__.target` 是应用代码层面的运行环境标志（`'app' | 'web'`）；webpack 配置中的 `target` 字段（`'electron-renderer'` / `'web'` 等）是 webpack 自身的概念。两者由 frame 内部映射，用户不需要关心 webpack `target`。

### 1.3 用户工程约定

| 项 | 约定 | 适用 | 偏离 |
|---|---|---|---|
| Electron 三进程源码 | `src/{main,preload,renderer}/index.js` | app | `bc.config` 各 key 覆盖 entry |
| Web 源码 | `src/renderer/index.js`（默认与 app renderer 共享） | web | `bc.config.web.entry` 覆盖 |
| HTML 模板 | 用户在 `renderer.plugins` / `web.plugins` 自注册 `html-webpack-plugin` | 两端 | — |
| 中间产物 | `app/{main,preload,renderer,...}/`（纯生成物，不要手写；webpack 编译唯一落点） | app | — |
| 最终产物 | `dist/` 全部归此（含 web 静态资源 / 安装包 / .asax / .asar / 状态文件）；**frame 强制**——用户在 `electron-builder.config` 里配 `directories.output` 非 `dist` 会被 frame 覆盖并 warn | 两端 | — |
| 环境变量 | `.env` + `.env.<name>`（项目根） | 全部 | — |
| `bc.config.{js,mjs,cjs}` | cwd 探测 | 跑 webpack 的命令必需 | `--config` |
| `electron-builder.config.{js,mjs,cjs}` | cwd 探测 | `pack` / `installer` 必需 | `--pack-config` |
| `build/encrypt.key` | encrypt 启用时必需 | app | `bc.config.encrypt: false` |
| `build/icon.png` | icon 自适配源图（1024×1024） | app pack/installer | 用户在 builder.config 显式写全 win/mac/linux.icon |
| `package.json.main` | 必须指向 main 进程的构建产物（默认 `app/main/index.js`） | app（`dev:app` / `pack` 共享真相源；pack 内 bytenode 路径 A 经 `extraMetadata.main` 在安装包内重写为 `main/loader.js`） | 偏离时同步改 main 预设 `output.path` |

**`app/` 由三进程编译命令负责清理**（pack 在阶段 B 入口清空、child 在 webpack 编译之前清空；dev:app 不清，原地覆盖 `app/main` 与 `app/preload`，renderer 在内存不落盘）。build（web target）不接触 `app/`。将来公共资源（public / resource 等）的**源**放在 `app/` 之外，由 build 流程拷贝到产物目录——这样"构建前清空 `app/`"清掉的全是上次生成物，源始终在别处、不会被误删。

**不支持 TypeScript 配置文件**：frame 不引入 ts 加载机制（jiti / tsx 等），保持加载链路最简。需要类型提示的用户用 JSDoc + `.js`：`/** @type {import('@base-client/frame').UserConfig} */`。

---

## § 2 命令矩阵 × 能力分布

### 2.1 命令清单

| 命令 | target | mode | 产物 |
|---|---|---|---|
| `dev` ≡ `dev:web` | web | dev | webpack-dev-server（浏览器） |
| `dev:web` | web | dev | 同上（显式名） |
| `dev:app` | app | dev | Electron + webpack-dev-server（renderer HMR） |
| `build` | web | prod | `dist/` 静态资源（含 `index.html` / `index.js` / `assets/*`） |
| `pack` | app | prod | `dist/<productName>_*.<ext>` 安装包 + `dist/${env}-v${version}.asax`；`--dir` 改为产 `dist/<platform>[-arch]-unpacked/` |
| `installer` | app | prod | `dist/<productName>_*.<ext>`（复用上次 `pack --dir` 产出 + 外部签名场景） |
| `child` | app | prod | `dist/child-<name>-<env>-v<version>.asar` |

`dev` 缺省即 `dev:web`：用户在 Electron 项目里仍可显式跑 `dev:app`，纯 web 项目跑 `dev` 即可。

### 2.2 能力分布表

| 能力 | dev:app | dev:web | build | pack | installer | child |
|---|---|---|---|---|---|---|
| 读 `.env` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 读 `bc.config` | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| 读 `electron-builder.config` | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| 派生 `__BC_BUILD__` | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| webpack 跑什么 | main+preload+renderer | web | web | main+preload+renderer | — | main+preload+renderer |
| webpack-dev-server | ✓（renderer） | ✓（web） | ✗ | ✗ | ✗ | ✗ |
| 起 Electron | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 进场清 `dist/` | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ |
| 清 `app/` | ✗（原地覆盖） | — | — | ✓ | ✗ | ✓ |
| icon 自适配 | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| 平台脚本生成 | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| AES 加密渲染层 | ✗ | ✗ | ✗ | ✓（可关） | ✗ | ✓（可关） |
| bytenode 主进程 | ✗ | ✗ | ✗ | ✓（可关） | ✗ | ✗ |
| 增量 `.asax` 包 | ✗ | ✗ | ✗ | ✓（可关 & 非 `--dir`） | ✗ | ✗ |
| child `.asar` 包 | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| 调 electron-builder | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| 默认端口 | 8023 | 9000 | — | — | — | — |

`installer` 是唯一不清 `dist/` 的命令（要保留 `dist/<...>-unpacked/`、可能已被外部签名过的产物）。

---

## § 3 ctx 契约 + 常量抽象

### 3.1 ctx 形态

`ctx` 是 dispatcher 一次性派生的上下文容器，**所有下游函数收 ctx 整体**——不解构成 `{env, mode, cliOptions}` 再传，避免"解构-重组"样板，ctx 扩展不破坏接口。

```js
ctx = {
    // CLI 解析
    command,      // 'dev:app' | 'dev:web' | 'build' | 'pack' | 'installer' | 'child'
    cliOptions,   // 含已声明 flag + 未声明 flag（自动 camelCase）
    env,          // .env + .env.<name> 合并对象

    // 由 command 派生
    target,       // 'app' | 'web'
    isApp, isWeb,
    mode,         // 'development' | 'production'
    isDev, isProd,
}
```

### 3.2 命令文件模板

target 与 mode 由命令文件声明，**不开放 `--target` / `--mode` flag**：

```js
// src/cli/commands/dev-app.js
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');

module.exports = {
    name: 'dev:app',
    description: '启动 Electron 开发环境',
    target: TARGETS.APP,
    mode: MODES.DEV,
    needsBcConfig: true,
    needsBuilderConfig: false,
    options: [
        ['--port <n>', 'dev server 端口'],
        ['--host <host>', 'dev server host'],
    ],
    action: async (ctx) => { /* ... */ },
};
```

`needsBcConfig` / `needsBuilderConfig`：dispatcher 据此决定是否预加载配置文件，缺失立刻报错（fail-fast）。

### 3.3 常量唯一来源

```js
// src/core/mode.js
const MODES = Object.freeze({ DEV: 'development', PROD: 'production' });
const VALID_MODES = new Set(Object.values(MODES));

function deriveMode(mode) {
    if (!VALID_MODES.has(mode)) {
        throw new Error(`[base-client] mode 必须是 ${MODES.DEV} 或 ${MODES.PROD}，收到: ${mode}`);
    }
    return { isDev: mode === MODES.DEV, isProd: mode === MODES.PROD };
}

// src/core/target.js
const TARGETS = Object.freeze({ APP: 'app', WEB: 'web' });
const VALID_TARGETS = new Set(Object.values(TARGETS));

function deriveTarget(target) {
    if (!VALID_TARGETS.has(target)) {
        throw new Error(`[base-client] target 必须是 ${TARGETS.APP} 或 ${TARGETS.WEB}，收到: ${target}`);
    }
    return { isApp: target === TARGETS.APP, isWeb: target === TARGETS.WEB };
}
```

frame 源码中 `'development'` / `'production'` 字面量只允许出现在 `mode.js`；`'app'` / `'web'` 字面量只允许出现在 `target.js`。源码 grep 可验证。生态边界注入（`process.env.NODE_ENV` 等 webpack/Electron 生态约定）保留字面量。

### 3.4 ctx 派生流程

```js
async function runCommand(cmd, cliOptions) {
    try {
        const env = loadEnv(cliOptions.env);              // .env + .env.<name>
        applyBcEnvFallback(env, cliOptions);              // BC_ENV 缺失则用 cliOptions.env 兜底
        injectBcSubsetToProcessEnv(env);                  // BC_* 子集写 frame 进程 process.env
        const ctx = buildCtx(cmd, cliOptions, env);       // 派生 target/isApp/isWeb/mode/isDev/isProd

        process.title = `bc-${cmd.name}|env=${env.BC_ENV ?? '?'}`;
        logger.banner({ command: cmd.name, target: ctx.target, mode: ctx.mode, env });

        if (cmd.needsBcConfig)      preloadBcConfig(ctx);
        if (cmd.needsBuilderConfig) preloadBuilderConfig(ctx);

        await cmd.action(ctx);
    } catch (err) {
        logger.error(`${cmd.name} 失败：`, err.message);
        if (cliOptions?.debug) console.error(err.stack);
        process.exit(1);
    }
}
```

### 3.5 未声明 flag 透传

用户在命令行追加任意 `--xxx`（如 `--beta`、`--ci`）：

- 自动出现在 `ctx.cliOptions.xxx`（cac 行为，camelCase 转换：`--my-flag` → `cliOptions.myFlag`）
- bc.config / electron-builder.config 函数可读
- **不进 `__BC_BUILD__`**
- **不进 `process.env`**

含义：未声明 flag 仅作为构建期开关，不渗入应用运行代码。

---

## § 4 变量系统（三层）

frame 严格区分三层变量，命名空间不交叉、消费方明确。

### 4.1 第一层：`__BC_BUILD__`（frame 派生的构建元信息）

webpack DefinePlugin 注入的**单个聚合对象**，字面量替换。frame 内部产物，用户改不动——从 package.json / `.env` / CLI flag / 约定文件计算。

**14 个字段**：

| 字段 | 类型 | 来源 |
|---|---|---|
| `target` | `'app'\|'web'` | command 隐含 |
| `name` | string | `pkg.name` |
| `productName` | string | `pkg.productName ?? pkg.name` |
| `version` | string | `pkg.version` |
| `env` | string | `process.env.BC_ENV`（用户在 .env 声明；缺失用 `--env` 兜底） |
| `envName` | string | `process.env.BC_ENV_NAME`（缺失为 undefined） |
| `buildTime` | number | `Date.now()` |
| `platform` | `'win'\|'mac'\|'linux'` | 包**构建时的目标平台**（pack 命令来自 `--platform`；child / dev:app 无目标平台，取 undefined）——识别**包来源**，非运行时判据 |
| `arch` | string | 包**构建时的目标架构**（pack 命令来自 `--arch`；其余 undefined）——语义同上 |
| `dir` | boolean | pack 命令是否传 `--dir`；其余 false。**构建期语义**，作为原始构建信息保留 |
| `sign` | boolean | pack 命令是否传 `--sign`；其余 false。识别**这个包是否是签名版**，构建期语义 |
| `child` | boolean | child 命令为 true；其余 false。识别**包来源类型**（child 子应用包 vs 主安装包） |
| `encrypted` | boolean | `bc.config.encrypt !== false && build/encrypt.key 存在` |
| `encryptKey` | string | `build/encrypt.key` 内容；**仅注入 app target main 进程**，最小暴露面 |

**target 缺省值规则**：app-only 字段（`platform / arch / dir / sign / child / encrypted / encryptKey`）在 web 命令下取缺省值——字符串类型 undefined、布尔类型 false——应用代码可统一写 `if (__BC_BUILD__.sign) {...}` 不必判别 target。

**各命令缺省值表**：

| 字段 | `dev:app` | `pack` | `child` | `dev:web` / `build` | `installer` |
|---|---|---|---|---|---|
| `target` | `'app'` | `'app'` | `'app'` | `'web'` | — |
| `platform` | undefined | `--platform` | undefined | undefined | — |
| `arch` | undefined | `--arch` | undefined | undefined | — |
| `dir` | false | `--dir` | false | false | — |
| `sign` | false | `--sign` | false | false | — |
| `child` | false | false | true | false | — |
| `encrypted` | false | 按 encrypt 开关 | 按 encrypt 开关 | false | — |
| `encryptKey` | undefined | 按 encrypt 开关（仅 main） | 按 encrypt 开关（仅 main） | undefined | — |

**`dev:app` 加密字段恒为缺省**：dev 态渲染层走 dev-server 内存、不落盘加密，若 `encrypted: true` 但产物未加密，应用代码读到 `encrypted` 字段会尝试解密未加密内容并失败。dev:app 只在 pack / child 真正落盘加密时才派生 encrypted。

**字段矩阵：不同命令下的取值**：

| 字段 | dev:web | build | dev:app | pack | child | installer |
|---|---|---|---|---|---|---|
| `target` | web | web | app | app | app | — |
| `name / productName / version` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `env / envName` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `buildTime` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `platform / arch` | undefined | undefined | undefined | cli 值 | undefined | — |
| `dir / sign` | false | false | false | cli 值 | false | — |
| `encrypted` | false | false | false | cryptoState | cryptoState | — |
| `encryptKey` | undefined | undefined | undefined | 有条件 | 有条件 | — |
| `child` | false | false | false | false | true | — |

`installer` 命令不派生 `__BC_BUILD__`（`needsBcConfig=false`），故整列为 —；用户在 renderer 里的 `__BC_BUILD__` 字段访问在 `installer` 命令下不存在消费方。字段派生逻辑源码：`src/core/build-info.js`。

**`installer` 命令不派生 `__BC_BUILD__`**——不跑 webpack、不产 bundle，没消费方。

**跨平台复用产物内的字段语义**：asax（增量升级包）与 child（子应用包）都是**跨平台复用**产物——同一份 asar 可能被不同平台/架构的宿主装载。其中 `__BC_BUILD__.platform / arch / dir / sign / child` 与 asar 内 `package.json` 里的对应字段，记录的都是**构建时目标信息**（包来源、构建期标志），**不能**作为运行时"当前平台/架构"的判据。运行时判断当前平台走 `process.platform`、当前架构走 `process.arch`；宿主装载 asax/child 时也不得据此判断装载环境。

### 4.2 第二层：`process.env.BC_*`（用户运行时变量）

用户在 `.env.<name>` 自定义、`BC_` 前缀。frame 经 DefinePlugin 逐键替换 `process.env.BC_XXX` 字面量到所有 webpack 编译产物。同时整体注入 frame 进程 `process.env`，供 frame 内 require 的子工具（electron-builder `${env.BC_ENV}` 模板等）读取。

**两套命名空间不交叉**：用户写 `BC_TARGET=foo` 不影响 `__BC_BUILD__.target` —— `__BC_BUILD__` 是 frame 派生 / `process.env.BC_*` 是用户自定义，字段不重叠。

**逐键定义，不整体替换**：frame 不写 `process.env = JSON.stringify(env)`——那会清空运行时其余 `process.env.*` 读取（main / preload 跑在 Node，运行时仍可能读真实环境变量）；逐键定义只替换 `BC_` 引用。

### 4.3 第三层：`ctx.env`（构建期全集）

`.env` + `.env.<name>` 合并后的**完整对象**，含非 `BC_` 前缀键（证书密码 `WIN_CODE_SIGN_PWD` 等）。仅在构建期通过 ctx 提供给用户 config 函数；**绝不进 bundle**、**绝不进 frame `process.env`**——这层是安全底线（bundle 可反编译、`process.env` 会传给子进程）。

### 4.4 三层对比

| 层 | 写法 | 进 bundle | 进 frame `process.env` | 应用代码 | 用户 config 函数 |
|---|---|---|---|---|---|
| `__BC_BUILD__` | `__BC_BUILD__.target` | ✓ | ✗ | ✓ | ✗ |
| `process.env.BC_*` | `process.env.BC_API_BASE` | ✓ | ✓ | ✓ | ✓（经 `ctx.env`） |
| `ctx.env` 全集 | — | ✗ | ✗ | ✗ | ✓（函数入参） |

### 4.5 `BC_ENV` fallback

`BC_ENV` 是用户的**业务环境标识**——属于 BC_ 前缀业务变量。常见消费方：

- 应用代码（经 DefinePlugin 焊进 bundle 后读 `process.env.BC_ENV`）
- 用户 `bc.config.js` / `electron-builder.config.js`（函数参数 `env.BC_ENV`）
- frame `getPackPreset` 内置 `artifactName` 默认引用 `${env.BC_ENV}`

**规范路径**：用户在 `.env.<name>` 显式声明 `BC_ENV=...`。

**fallback**：若 `.env.<name>` 中未声明（或值为空串），dispatcher 在注入 `process.env` 前用 `cliOptions.env`（即 `--env` 的值，默认 `prod`）兜底——避免预设模板展开为空段（如 `产品_win_x64__v1.0.0.exe`）。

### 4.6 安全约定

| 类别 | 例子 | 去处 | 进 bundle? |
|---|---|---|---|
| 运行时业务变量 | `BC_API_BASE`、`BC_ENV` | `.env.<name>`，frame 自动注入 | 进 |
| 构建期常量（运行时要显示） | 版本号、构建时间 | `__BC_BUILD__`（frame 派生） | 进（故意） |
| 构建/打包期敏感密钥 | 签名证书密码、发布 token | `.env.<name>` 非 `BC_` 前缀键 → 仅 `ctx.env`，构建期用户 config 函数可读 | 永不进 |

**警示**：敏感密钥不要写 `BC_` 前缀——那会被注入到可反编译的客户端 bundle。

---

## § 5 配置层

### 5.1 `bc.config.js`

函数式导出 `(ctx) => ({...})`。

```js
module.exports = (ctx) => ({
    // app target 三进程
    main:     { /* webpack 配置覆盖 */ },
    preload:  { /* 同 */ },
    renderer: {
        entry: { renderer: 'src/renderer/index.js', update: 'src/update/index.js' },
        plugins: [ /* 用户自注册 html-webpack-plugin */ ],
        devServer: { /* 仅 dev:app 消费 */ },
        /* 其它 webpack 字段 */
    },

    // web target
    web: {
        entry: 'src/renderer/index.js',     // 默认即此（同构）
        plugins: [ /* 自注册 html-webpack-plugin */ ],
        devServer: { /* 仅 dev:web 消费 */ },
        /* 其它 webpack 字段 */
    },

    // pack 能力开关（顶层布尔；缺省即默认全开）
    encrypt:     true,
    bytenode:    true,
    incremental: true,
});
```

**字段语义**：

| 字段 | 默认 | 说明 |
|---|---|---|
| `main / preload / renderer` | — | app target 三进程 webpack 覆盖 |
| `renderer.entry` | `{ renderer: 'src/renderer/index.js' }` | 字符串或对象（多入口） |
| `renderer.devServer` | — | 仅 `dev:app` 消费；其余命令忽略 |
| `web` | — | web target 整体配置 |
| `web.entry` | `'src/renderer/index.js'` | 同构默认 |
| `web.devServer` | — | 仅 `dev:web` 消费 |
| `encrypt` | `true` | false 跳过加密 + 不注入 encryptKey；true 时 `build/encrypt.key` 缺失抛错 |
| `bytenode` | `true` | false 跳过主进程字节码 |
| `incremental` | `true` | false 跳过 .asax 产出；`child` 命令下此字段被忽略 |

**加载行为**：`installer` 不读 bc.config（不跑 webpack）。其余命令必需 bc.config，缺失 → dispatcher 抛错。

### 5.2 `electron-builder.config.js`

函数式 `(ctx) => Configuration`。仅 `pack` / `installer` 加载。

```js
module.exports = ({ env, cliOptions, replace, isApp, isProd }) => ({
    appId: 'com.example.app',   // 用户必填，frame 不提供默认（缺失由 electron-builder 报错）

    win: {
        requestedExecutionLevel: 'highestAvailable',
        ...(cliOptions.sign ? {
            signingHashAlgorithms: ['sha256'],
            certificateFile: 'build/cert/code-sign.pfx',
            certificatePassword: env.WIN_CODE_SIGN_PWD,    // 经 ctx.env 读非-BC 键
            rfc3161TimeStampServer: 'http://timestamp.digicert.com',
        } : {}),
    },

    // 龙芯由用户自管：frame preset 不再注入 electronDownload
    ...(cliOptions.arch === 'loong64' ? {
        electronDownload: {
            version: '22.3.27',
            mirror: 'http://ftp.loongnix.cn/electron/LoongArch/',
            customDir: 'v22.3.27',
            platform: 'linux',
            arch: 'loong64',
        },
        electronVersion: '22.3.27',
    } : {}),

    // 不写时 frame 注入 dist/shell/win-installer.nsh
    nsis: { include: 'build/custom-installer.nsh' },

    // replace() 整组替换 frame 默认 fpm 数组
    deb: { fpm: replace([
        '--before-install=build/my-pre.sh',
        '--after-install=build/my-post.sh',
    ]) },
});
```

**`directories.output` 归位**：`resolveBuilderConfig` 出口强制 `directories.output = 'dist'`（frame 内部 icon / shell / .asax / emptyDirSync 都写 `dist/`，若允许用户改会与其它写点割裂）。用户在 `electron-builder.config.js` 里配非 `dist` 值时，frame logger.warn 后覆盖回 `dist`。若未来需要放开产物目录名，会同时改造 frame 所有 dist 写点走同一真相源，届时更新本节。

**ctx 字段**（与 § 3 一致，外加 `replace`）：

| 字段 | 类型 | 含义 |
|---|---|---|
| `command` | string | 当前命令名（`'pack'` 或 `'installer'`） |
| `target` | string | `'app'` |
| `mode` | string | `'production'` |
| `isDev / isProd / isApp / isWeb` | boolean | 派生标志 |
| `env` | object | `.env` + `.env.<name>` 合并后的完整对象（含**非 BC_** 键） |
| `cliOptions` | object | 解析后的 CLI 参数（含未声明 flag） |
| `replace` | function | 数组整组替换工具（见 5.3） |

### 5.3 合并语义

| 哪里 | 工具 | 数组行为 | `replace` |
|---|---|---|---|
| bc.config 三进程 / web | webpack-merge | 追加 | — |
| electron-builder.config | customMerge | 追加 | `replace([...])` 整组替换 |

**默认行为**（electron-builder customMerge）：

| 值类型 | 行为 |
|---|---|
| 标量（string / number / boolean） | 用户值覆盖 preset |
| 普通对象 | 递归深合并 |
| 数组 | preset ⊕ 用户（追加） |
| 函数 | 用户值覆盖；引用原样保留（不序列化） |

**`replace` 实现**：

```js
const REPLACE = Symbol('replace');

function replace(arr) {
    const tagged = arr.slice();
    tagged[REPLACE] = true;
    return tagged;
}

function customMerge(preset, user) {
    return mergeWithCustomize({
        customizeArray: (presetArr, userArr) => {
            if (userArr && userArr[REPLACE]) return Array.from(userArr);   // 整组替换
            return [...(presetArr || []), ...(userArr || [])];             // 默认追加
        },
    })(preset, user);
}
```

用户视角：写 `files: replace([...])` 即可，无需关心 Symbol；信号仅 frame 合并阶段消化，不泄漏到 electron-builder。

### 5.4 加载与定位

| 命令 | bc.config 必需 | electron-builder.config 必需 |
|---|---|---|
| `dev:app` / `dev:web` / `build` / `pack` / `child` | ✓ | — |
| `pack` / `installer` | — | ✓ |
| `installer` | ✗ | ✓ |

**定位**：

1. 默认在 `process.cwd()` 探测 `bc.config.{js,mjs,cjs}` / `electron-builder.config.{js,mjs,cjs}`
2. `--config <path>` 指定 bc.config；`--pack-config <path>` 指定 electron-builder.config
3. 缺必需配置 → 抛错由 dispatcher 统一报告
4. 两个 flag 语义互不抢占：`--config` 始终指 bc.config，`--pack-config` 始终指 electron-builder.config

---

## § 6 四个预设

frame 暴露 4 个独立 getter，命令层根据 target 取对应几个：

```js
getMainPreset(ctx)        // app target
getPreloadPreset(ctx)     // app target
getRendererPreset(ctx)    // app target
getWebPreset(ctx)         // web target
```

每个 getter **自包含产出完整 webpack 配置**，不共享中间层：`mode` / `devtool` / `resolve.extensions` 基线 / DefinePlugin 在每个 getter 内分别构造。其中：

- 共享逻辑（`__BC_BUILD__` 注入、`process.env.BC_*` 注入）复用同一份工具函数，避免漂移
- 每个 getter 内自包含 `const { isDev, isProd } = deriveMode(ctx.mode)`、`const { isApp, isWeb } = deriveTarget(ctx.target)`

**预设不提供接管机制**：preset 表达 frame 职责内的基础配置（target/mode/entry/output/devtool/resolve/DefinePlugin/stats）。bc.config 三进程 / web 的合并遵循 webpack-merge 官方默认语义——标量覆盖、对象深合并、数组追加。用户不需要、frame 也不提供任何"整组替换"标记；如果某项是用户技术栈专属的（转译 loader / 资源处理 rules / HTML 模板 / 单例插件），frame 一律不放进 preset，由用户在 bc.config 自加。

### 6.1 三进程预设

| 维度 | main | preload | renderer |
|---|---|---|---|
| webpack target | `'electron-main'` | `'electron-preload'` | `'web'`（无 nodeIntegration） |
| 默认 entry | `src/main/index.js` | `{ index: 'src/preload/index.js' }` | `{ index: 'src/renderer/index.js' }` |
| `output.path` | `app/main` | `app/preload` | `app/renderer` |
| `output.filename` | `index.js` | `[name].js` | `[name].js` |
| `output.libraryTarget` | `commonjs2` | `commonjs2` | —（默认） |
| externals | `{ electron: 'commonjs electron' }` | 同 main | 无 |
| publicPath | — | — | `'./'`(prod) / `'/'`(dev) |
| `resolve.extensions` | `.js` / `.mjs` / `.cjs` / `.json` | 同 | 同 |
| `devtool` | `'source-map'`(dev) / `false`(prod) | 同 | 同 |
| `__BC_BUILD__` 注入 | 全字段（含 `encryptKey`） | 全字段（无 `encryptKey`） | 同 preload |
| `process.env.BC_*` 注入 | BC_ 子集 | 同 | 同 |
| stats 输出 | webpack 回调内调 logger | 同 | `'none'`（dev-server 接管） |

**preload / renderer 多入口友好默认**：预设 `entry` 为对象 `{ index: 'src/preload/index.js' }` / `{ index: 'src/renderer/index.js' }`，`output.filename` 为 `[name].js`。默认单入口时产物落 `app/preload/index.js` / `app/renderer/index.js`，与旧行为等价。业务需要多入口时（如 `UpdateWindow` 独立 preload），在 `bc.config.js` 追加 key 即可，无需 override `output.filename`：

```js
// bc.config.js
module.exports = {
    preload: {
        entry: { update: 'src/preload/update.js' }, // 与 preset { index } 合并成 { index, update }
    },
    renderer: {
        entry: { update: 'src/renderer/update.js' },
        plugins: [
            new HtmlWebpackPlugin({ filename: 'index.html', chunks: ['index'], template: 'src/renderer/index.html' }),
            new HtmlWebpackPlugin({ filename: 'update.html', chunks: ['update'], template: 'src/renderer/update.html' }),
        ],
    },
};
```

产物平铺：`app/preload/{index,update}.js`、`app/renderer/{index,update}.js`（HTML 由业务 `HtmlWebpackPlugin` 追加）。frame 加密链路遍历 `app/*` 除 main 外所有子目录，与平铺布局天然兼容。

**renderer publicPath 按 mode 分支**：production 用 `'./'`，让打包后 `file://` 加载时静态资源以相对路径正确解析；development 用 `'/'`，让 webpack-dev-server 把内存中的 emit assets 挂在根路径下，浏览器访问 `http://localhost:<port>/` 才能命中。两种 mode 用同一个值会顾此失彼。

**`html-webpack-plugin` 不在预设**——renderer entry 页面由用户在 `bc.config.renderer.plugins` 自注册。frame 不内置任何单例插件（`VueLoaderPlugin` / `MiniCssExtractPlugin` 同理），由用户在 bc.config 注册。

### 6.2 Web 预设

| 维度 | 值 |
|---|---|
| webpack target | `'web'` |
| 默认 entry | `'src/renderer/index.js'`（同构默认） |
| `output.path` | `dist/`（直接铺到 dist 根，不再嵌一层 `dist/web/`） |
| `output.filename` | `index.js` |
| publicPath | `'/'`(dev) / `'./'`(prod) |
| externals | 无 |
| `devtool` | `'source-map'`(dev) / `false`(prod) |
| `__BC_BUILD__` 注入 | 全字段（app-only 字段取缺省值） |
| `process.env.BC_*` 注入 | BC_ 子集 |
| stats 输出 | `'none'`（dev-server / build 回调接管） |

**HTML 模板**：与 renderer 一致——frame 不内置，用户在 `web.plugins` 自注册 `html-webpack-plugin`。

### 6.3 共享工具

四个预设均使用：

**`__BC_BUILD__` 注入插件**（`src/config/presets/build-info-plugin.js`）：

```js
function buildInfoPlugin(buildInfo, { includeEncryptKey = false } = {}) {
    const defs = {};
    for (const [k, v] of Object.entries(buildInfo)) {
        if (k === 'encryptKey' && !includeEncryptKey) continue;
        defs[`__BC_BUILD__.${k}`] = JSON.stringify(v);
    }
    return new webpack.DefinePlugin(defs);
}
```

仅 main preset 调用时传 `{ includeEncryptKey: true }`。注入颗粒度按属性路径：`__BC_BUILD__.platform` 等字段独立替换为字面量——支撑 webpack DCE。

**用户运行时变量注入**（`src/config/presets/user-env-plugin.js`）：

```js
function userEnvPlugin(env) {
    const defs = {};
    for (const k of Object.keys(env || {})) {
        if (k.startsWith('BC_')) defs[`process.env.${k}`] = JSON.stringify(env[k]);
    }
    return new webpack.DefinePlugin(defs);
}
```

**转译 loader / 资源处理 rules 一律不在预设**——target 异、技术栈异（main/preload 跑在 Electron Node、renderer 跑在 Chromium、web 跑在浏览器；版本随项目走），且图片/字体/媒体处理策略常绑定业务约定（是否走 CDN、内联阈值、Hash 长度、目录布局）。用户在 bc.config 自加 babel/ts/vue/css loader 与 asset modules 规则（含 `output.assetModuleFilename`），webpack-merge 追加到预设之上。

### 6.4 webpack 输出静默

renderer / web 预设：

```js
stats: 'none',
infrastructureLogging: { level: 'warn' },
```

配套 dev-server：`devMiddleware.stats: false`。

main / preload 走 `webpack(cfg, cb)` 回调路径，由命令层显式调 logger。

设计意图：frame 用 logger 接管编译反馈（一行摘要 + 失败时完整 `stats.toString({colors:true})`），与 webpack 原生输出**择一**而非并存。用户在 bc.config 可覆盖 `stats` / `infrastructureLogging`（webpack-merge 对象深合并），排查时临时打开。

---

## § 7 dev:app & dev:web

### 7.1 dev:app

```
ctx = { command:'dev:app', target:'app', mode:'dev', ... }
①  resolveBuildConfig(ctx) → { main, preload, renderer }
②  并行：
    ⓐ webpack([main, preload]).run(cb) 一次性编译 → app/{main,preload}/index.js
       编译反馈走 logger.compileSuccess / Failure / Warning
    ⓑ webpack-dev-server(renderer)，host/port 兜底 localhost:8023，内存提供 HMR
       done hook → logger.compileSuccess + logger.footer
③  ⓐⓑ 都就绪 → resolveElectron(rootDir) + resolveMainEntry(rootDir) → spawn Electron
    注入 env：NODE_ENV=development、RENDERER_DEV_URL=http://<host>:<port>/（含尾斜杠）
④  Electron close → 关 dev-server → 按 Electron 退出码退出
    SIGINT → 终止 Electron + 关 dev-server + 退出
```

**main / preload 默认不 watch**——保持极简。改 main/preload 需重跑 `dev:app`。renderer 始终经 dev-server HMR。（不提供 `--watch-main`：进程树跨平台杀重启的复杂度不划算；需要时用户用两个终端、或后续按需引入。）

**dev-server options 构造**：

```js
const { devServer: userDev = {}, ...rendererWebpack } = renderer;
const host = cliOptions.host ?? userDev.host ?? 'localhost';
const port = cliOptions.port ?? userDev.port ?? 8023;

const opts = {
    historyApiFallback: true,
    ...userDev,                          // 用户：proxy / headers / setupMiddlewares / client 等任意 devServer 选项
    host, port,
    hot: true,                           // frame 强制
    devMiddleware: {
        stats: false,                    // 与 renderer 预设 stats:'none' 配套
        ...(userDev.devMiddleware || {}),
    },
};
```

**`host` / `port` 三级优先级**：CLI `--host` / `--port` > `renderer.devServer` 中对应值 > 默认（`localhost` / `8023`）。CLI 层**不预置默认值**：cac 默认会让 `cliOptions.port` 恒有值，导致 `bc.config` 永远无法覆盖。

#### 7.1.1 dev-app 运行时 env 契约

dev:app 起 Electron 子进程时，`cp.spawn` 的 `env` 字段追加下列变量，作为 frame → 用户主进程的**运行时契约**。字段名与语义稳定，**变更前先在本节公告**：

| 变量 | 值 | 语义 |
|---|---|---|
| `NODE_ENV` | `'development'` | dev-app 恒为 development；用户据此走 dev 分支加载 |
| `RENDERER_DEV_URL` | 完整 URL（含协议、host、port、**尾斜杠**，如 `http://localhost:8023/`） | renderer webpack-dev-server 的访问地址；主进程 `loadURL` 用；业务多入口拼子路径可直接 `RENDERER_DEV_URL + 'update.html'` |

**为什么不导出 runtime helper**：这两个变量足够简单，包一层 `require('@base-client/frame/runtime').getRendererDevUrl()` 反而增加 frame 的对外面。若未来需要跨命令共享 runtime 常量再重启这个讨论。

**未来新增变量流程**：先补入本节表格 + 明确稳定性承诺，再落地 CLI 侧的注入代码。

**渲染入口加载约定**（用户主进程代码自行选择，frame 不提供运行时对象）：

```js
if (process.env.NODE_ENV === 'development') {
    win.loadURL(process.env.RENDERER_DEV_URL);
} else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
}
```

**生命周期**：

| 事件 | 动作 |
|---|---|
| Electron close（用户退出 app） | 关 dev-server、按 Electron 退出码退出 dev:app 进程 |
| SIGINT（Ctrl+C） | 终止 Electron、关 dev-server、退出 |
| 致命错误（初始构建失败、dev-server 启动失败、electron / 入口解析失败） | `throw`，由 dispatcher 统一处理 |
| webpack 编译错误 | `stats.toString()` 完整打印，独立于堆栈、始终可见（不受 `--debug` 影响） |

### 7.2 dev:web

```
ctx = { command:'dev:web', target:'web', mode:'dev', ... }
①  resolveBuildConfig(ctx) → { web }
②  webpack-dev-server(web)，host/port 兜底 localhost:9000（与 dev:app 错开）
③  done hook → logger.compileSuccess + logger.footer({ env, url, target:'web' })
④  SIGINT → 关 dev-server、退出
```

不起 Electron。`__BC_BUILD__` 派生时 app-only 字段取缺省值（platform/arch/sign/dir/child 都 undefined/false，encrypted=false）。

dev-server options 构造与 7.1 同款，只是默认 port 9000、消费 `web.devServer` 而非 `renderer.devServer`。

### 7.3 端口默认错开

dev:app 默认 8023（renderer dev-server）；dev:web 默认 9000——两者偶尔并存时不冲突。用户 CLI `--port` 或 bc.config 中显式配置可改。

---

## § 8 build

```
ctx = { command:'build', target:'web', mode:'prod', ... }
①  fse.emptyDirSync('dist')                  // 进场清空
②  resolveBuildConfig(ctx) → { web }
③  webpack(web).run(cb) → dist/{index.html, index.js, assets/*}
    编译反馈走 logger
④  成功：logger.success；失败：throw（dispatcher 报告）
```

build 是 web target 唯一生产命令。不读 electron-builder.config、不参与 pack 能力链。

**清理范围**：`dist/` 整体清空。`app/` 不参与（web target 不产 app/ 中间产物）。

---

## § 9 pack / installer / child

围绕 **三阶段心智模型** 组合：

- **阶段 A · 资源准备**：env / CLI / `__BC_BUILD__` 派生 / icon 自适配 / 平台脚本生成 / electron-builder.config 加载与合并
- **阶段 B · 代码构建**：三进程 webpack / AES 加密 / bytenode / `.asax` 或 child `.asar` 打包
- **阶段 C · 安装包打包**：调 `electronBuilder.build`

| 命令 | A | B | C |
|---|---|---|---|
| `pack` | ✓ 完整 | ✓ 完整 | ✓（`--dir` 时仅 dir target，输出 unpacked + 写状态文件） |
| `child` | A 子集（仅 env / CLI / `__BC_BUILD__`） | B 子集（webpack + AES + asar；无 bytenode、无 .asax） | — |
| `installer` | A 子集（不派生 `__BC_BUILD__`、不读 bc.config；读 builder.config + icon + shell） | — | ✓（按 CLI 的 platform/arch 推导 unpacked 路径，作 `prepackaged` 透传） |

### 9.1 pack 命令流程

```
[阶段 A]
①  fse.emptyDirSync('dist')                       // 进场清空（一次）
②  派生 ctx 与 __BC_BUILD__（encrypted/encryptKey 由 bc.config + build/encrypt.key 决定）
③  加载 bc.config + electron-builder.config（函数式，注入 ctx + replace）
④  preset = getPackPreset(ctx, pkgJson)
⑤  mergedBuilderConfig = customMerge(preset, userBuilderConfig)
⑥  icon 自适配（build/icon.png 存在 且 win/mac/linux.icon 未全显式覆盖）：
      → dist/icons/{icon.ico, icon.icns, 16~1024.png}
      按需注入 mergedBuilderConfig.{win,mac,linux}.icon
⑦  平台脚本生成：
      模板 + APP_NAME/APP_DIR_NAME/APP_ID 替换 + .sh/.nsh 统一 LF
      → dist/shell/{win-installer.nsh, deb-preinstall.sh, deb-postinstall.sh, deb-postrm.sh}
      按需注入 mergedBuilderConfig.nsis.include / deb.fpm

[阶段 B]
⑧  fse.emptyDirSync('app')                        // 中间产物归零
⑨  三进程并行 webpack 编译 → app/{main,preload,renderer,...}
      main 注入 __BC_BUILD__ 全字段（含 encryptKey）
      preload / renderer 注入 __BC_BUILD__ 不含 encryptKey
⑩  encrypt === true：AES 加密 app/<除 main 外>/**/*.js
⑪  incremental === true && 非 --dir：
      复制 app/{除 main 外} → 临时目录
      写 package.json（基于 __BC_BUILD__ 派生子集，不含 encryptKey）
      @electron/asar 打包 → dist/${env}-v${version}.asax
      清临时目录
⑫  bytenode === true：app/main/index.js → app/main/index.jsc + 加载入口

[阶段 C]
⑬  targets = buildTargets(cliOptions)             // --dir 时改 dir
⑭  artifacts = await electronBuilder.build({ ...targets, config: mergedBuilderConfig })
      输出：dist/<productName>_*.<ext> 或 dist/<platform>[-arch]-unpacked/
⑮  --dir 完成：按 { platform, arch } 推导 unpacked 路径（10.7），fs.existsSync 校验后 logger 输出
```

**dist/ 清空只发生在 ① 一次**——之后阶段 A 写入 `dist/icons` / `dist/shell`，阶段 B/C 累加 `.asax` 与安装包；其余目录不再触碰，icons/shell 自然保留。

**关键时序约束**：

- 阶段 A 全在 webpack 之前完成；`dist/icons/` 与 `dist/shell/` 是 builder.config 中字符串路径（如 `nsis.include = 'dist/shell/win-installer.nsh'`）落到磁盘前就已就绪
- ⑪ 增量包不含 main 编译产物，且放在 ⑫ 字节码**之前**——避免字节码绑定 Electron Node 版本影响增量包可移植性
- ⑥ ⑦ ⑫ 对 mergedBuilderConfig 的修改在 ⑭ 调用 builder 之前完成
- ⑥ ⑦ "按需注入"语义：仅当 mergedBuilderConfig 中对应字段未被设置时 frame 才注入；用户已显式写值的不被覆盖

### 9.2 child 命令流程

```
ctx = { command:'child', target:'app', mode:'prod', ... }
①  fse.emptyDirSync('dist')                       // 整体清空
②  fse.emptyDirSync('app')
③  派生 __BC_BUILD__（child=true、platform/arch=undefined、dir/sign=false）
④  加载 bc.config（不加载 electron-builder.config、不做 icon/shell）
⑤  三进程并行 webpack 编译 → app/
      三进程都注入 __BC_BUILD__（含 encryptKey 仅 main）
⑥  encrypt === true：加密渲染层产物
⑦  复制 app/ → 临时目录，写 package.json（派生子集），@electron/asar 打包
    → dist/child-${name}-${env}-v${version}.asar
    清临时目录
```

`child` 命令：

- 完全跳过 bytenode（主进程不入分发链路）
- 完全跳过 `.asax` 增量包（child 本身就是子包）
- 跳过 icon / shell（不调 electron-builder）
- 不调 electron-builder、不产 installer

### 9.3 installer 命令流程

```
ctx = { command:'installer', target:'app', mode:'prod', ... }
                                            // __BC_BUILD__ 不派生
                                            // dist/ 不清（保留 <...>-unpacked/）

[阶段 A 子集]
①  加载 electron-builder.config（不读 bc.config）
②  preset = getPackPreset(ctx, pkgJson)
③  mergedBuilderConfig = customMerge(preset, userBuilderConfig)
④  icon 自适配（同 9.1 ⑥；覆盖式重生 dist/icons）
⑤  平台脚本生成（同 9.1 ⑦；覆盖式重生 dist/shell）

[阶段 C]
⑥  unpackedPath = dist/{computeUnpackedDir({ platform, arch })}   // 按命名约定现算
⑦  targets = buildTargets(cliOptions)             // installer 默认 installer target，不接受 --dir
⑧  electronBuilder.build({ ...targets, config: mergedBuilderConfig, prepackaged: unpackedPath })
```

**设计要点**：

- **不派生 `__BC_BUILD__`**：installer 路径不跑 webpack、不产 bundle，没有消费方
- **不加载 bc.config**：bc.config 是 webpack / 加密 / 字节码 / 增量包的开关源，全部跟 installer 无关
- **不重清 `dist/`**：`dist/<...>-unpacked/` 必须保留（可能已被外部签名过）；`dist/icons/`、`dist/shell/` 由阶段 A 子集覆盖式重生
- **不做前置校验**：unpacked 目录不存在、平台/架构与上次 pack 参数错配——frame 都不拦截，统一交给 `electron-builder.build` 抛错

**为什么不写状态文件**：pack 与 installer 都基于同一份命名约定（10.7）从 `{ platform, arch }` 推导 unpacked 路径；installer 命令本身就要求 `--platform` / `--arch`，因此无需持久化状态。这也让 installer 的行为更符合直觉——命令参数是什么、就找什么目录，避免"沉默使用旧状态里的错配值"。

### 9.4 pack 命令选项

| 选项 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `--env <name>` | 是（全局） | string | 指定 `.env.<name>` |
| `--config <path>` | 否（全局） | string | 指定 `bc.config` 路径 |
| `--pack-config <path>` | 否（pack/installer） | string | 指定 `electron-builder.config` 路径 |
| `--debug` | 否（全局） | boolean | 出错时附打印 `err.stack` |
| `--platform <p>` | 是 | `win`/`mac`/`linux` | 目标平台 |
| `--arch <a>` | 是 | `ia32`/`x64`/`armv7l`/`arm64`/`universal`/`loong64` | 目标架构 |
| `--dir` | 否 | boolean | 仅产 unpacked，跳过 installer 阶段；同时写状态文件 |
| `--sign` | 否 | boolean | 签名标志，透传至 `cliOptions.sign` 与 `__BC_BUILD__.sign` |

### 9.5 installer 命令选项

| 选项 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `--env <name>` | 是（全局） | string | 同上 |
| `--pack-config <path>` | 否 | string | 同上 |
| `--debug` | 否 | boolean | 同上 |
| `--platform <p>` | 是 | string | 目标平台 |
| `--arch <a>` | 是 | string | 目标架构 |
| `--sign` | 否 | boolean | 签名标志，透传至 `cliOptions.sign`（`__BC_BUILD__` 不派生） |

### 9.6 child 命令选项

仅全局选项。

### 9.7 typical CI 流程（外部签名场景）

```bash
# Agent 1：编译 + 出 unpacked
bc-frame pack --dir --platform win --arch x64 --env prod
# → dist/win-unpacked/，整个 dist/ 作 artifact 上传

# Agent 2：外部签名工具处理 unpacked 目录
signtool sign /f cert.pfx dist/win-unpacked/**/*.exe dist/win-unpacked/**/*.dll

# Agent 3：套 installer 壳
bc-frame installer --platform win --arch x64 --env prod
# 按 CLI 的 platform/arch 现算 dist/win-unpacked，调 electron-builder + prepackaged
```

---

## § 10 pack 能力详述

### 10.1 Icon 自适配（`src/pack/icon.js`）

**启用条件**：`build/icon.png` 存在 **且** `mergedBuilderConfig.{win,mac,linux}.icon` 未全部显式设置。

**流程**：

1. 预检查：若三平台 icon 字段全已显式设置 → 跳过整步（不生成 `dist/icons/`）
2. 读 `build/icon.png`（1024×1024 PNG）
3. 生成多尺寸 PNG（16/24/32/48/64/96/128/256/512/1024）+ `icon.ico` + `icon.icns` → `dist/icons/`
4. 按需注入（只填用户未写的）：
   - `mac.icon = 'dist/icons/icon.icns'`（仅当未设置）
   - `win.icon = 'dist/icons/icon.ico'`（仅当未设置）
   - `linux.icon = 'dist/icons'`（目录形态，仅当未设置）

**实现库**：plan 阶段决定（候选：`sharp` / `png2icons` / `png-to-ico`）。

**extraResources 边界**：frame 不会自动把 `dist/icons/` 加入 `extraResources`。如需运行时通过 `process.resourcesPath` 读图标（用于 BrowserWindow / Tray 等），用户在 `electron-builder.config.js` 中自行配置 `extraResources` 或指向项目内其他图标文件。

### 10.2 平台脚本生成（`src/pack/shell.js`）

**内置模板位置**：`src/templates/shell/` → rollup 打包后落 `dist/templates/shell/`。

**模板清单**：

- `win-installer.nsh`：Windows 版本检测、自定义安装页面、注册表清理
- `deb-preinstall.sh`：杀进程、清旧快捷方式（含龙芯系统分支）
- `deb-postinstall.sh`：命令行链接、SUID chrome-sandbox、桌面快捷方式（含龙芯系统分支）
- `deb-postrm.sh`：清命令行链接、删桌面快捷方式

**流程**：

1. 读模板内容
2. 替换：
   - `{{APP_NAME}}` ← `pkg.name`
   - `{{APP_DIR_NAME}}` ← `mergedBuilderConfig.productName`
   - `{{APP_ID}}` ← `mergedBuilderConfig.appId`
   - Windows 模板直接使用 electron-builder 的 NSIS 编译期变量 `${APP_GUID}`；frame 不自行计算 GUID，从而同时兼容显式 `nsis.guid` 与基于 `appId` 的默认派生值
3. 文件编码统一为 **UTF-8 without BOM**；`.sh` 与 `.nsh` 都做 CRLF → LF 行尾规范化（NSIS 编译器对行尾大多容忍，但部分指令在历史版本中对 `\r` 行为不一致，统一 LF 是稳妥选择）
4. 写入 `dist/shell/<name>`
5. 按需注入：
   - `nsis.include = 'dist/shell/win-installer.nsh'`（仅当 `mergedBuilderConfig.nsis.include` 未设置）
   - `deb.fpm` 追加 `['--before-install=dist/shell/deb-preinstall.sh', '--after-install=dist/shell/deb-postinstall.sh', '--after-remove=dist/shell/deb-postrm.sh']`（仅当 `mergedBuilderConfig.deb.fpm` 未设置或为空数组）

**用户覆盖方式**：

- 覆盖 `nsis.include`（字符串）→ frame 不注入，使用自定义脚本
- 写 `deb.fpm` 数组 → frame 不追加；用户负责该数组的完整内容
- 用 `replace([...])` 整组替换 `deb.fpm`：完全接管，frame 不贡献

### 10.3 AES 加密渲染层（`src/pack/encrypt.js`）

**启用条件**：`bc.config.encrypt !== false`。

**算法约定**（frame 与解密方契约）：

- 算法：`aes-256-cbc`
- 密钥：`build/encrypt.key` 文件内容（去除尾部换行），按 UTF-8 字符串处理；推荐 32 字符
- IV：密钥字符串的前 16 字符
- 数据：以二进制流式加密，输出二进制覆盖原文件

**流程**（pack 阶段 B ⑩；child 阶段 B ⑥）：

1. 读 `build/encrypt.key`（若文件不存在 → 抛错：`启用了 encrypt 但未找到 build/encrypt.key，请提供密钥文件或在 bc.config.js 设 encrypt: false`）
2. 按上述算法加密 `app/<除 main 外>/**/*.js`（含 renderer / update 等所有渲染入口子目录）
3. webpack DefinePlugin 注入 `__BC_BUILD__.encrypted = true` 与 `__BC_BUILD__.encryptKey = "<key>"`（仅 main 编译配置）

**frame 不负责解密**——用户主进程代码读 `__BC_BUILD__.encrypted` 与 `__BC_BUILD__.encryptKey` 后按算法对偶实现解密。解密辅助由 toolkit 包或用户自行实现。

`encrypt: false` 时：跳过加密；`__BC_BUILD__.encrypted = false`；`__BC_BUILD__.encryptKey` 字段不注入（应用代码读到 `undefined`）。

### 10.4 bytenode 主进程字节码（`src/pack/bytenode.js`）

**启用条件**：`bc.config.bytenode !== false` **且** pack 命令。child 跳过（主进程不入分发链路）。

**两种实现路径**（plan 阶段选定）：

| 路径 | 产物 | 入口调整 |
|---|---|---|
| A · 外挂 loader | `app/main/index.jsc` + 新生成 `app/main/loader.js`（含 `require('bytenode'); require('./index.jsc');`） | `mergedBuilderConfig.extraMetadata.main = 'main/loader.js'` |
| B · 桩代码原入口 | `app/main/index.jsc` + 重写 `app/main/index.js` 为加载字节码的桩代码（内置字节码 loader 模块） | `extraMetadata.main` 不动 |

**任一路径都满足**：

- `__BC_BUILD__.encryptKey` 字面量同步进入字节码产物，相比纯 JS 多一层保护
- 主进程入口最终指向能正确加载 `.jsc` 的 JS 文件

`bytenode: false` 时：跳过字节码编译；`extraMetadata.main` 保持 `'main/index.js'`。

### 10.5 增量 `.asax` 包（`src/pack/incremental.js`）

**启用条件**：`bc.config.incremental !== false` **且** `pack` 命令 **且** 非 `--dir`。

**流程**（pack 阶段 B ⑪，在 ⑫ bytenode **之前**）：

1. 等待 ⑨ ⑩ 完成（webpack 编译 + 渲染层加密）
2. 复制 `app/<除 main 外>` 子目录（默认含 `preload/` / `renderer/` / 其他渲染入口如 `update/`）到临时目录
3. 在临时目录根写入 `package.json`（**包描述**——见 10.5.1）
4. `@electron/asar` 打包临时目录到 `dist/${env}-v${version}.asax`
5. 清理临时目录

**关键设计**：

- `.asax` **不含主进程编译产物**——避免字节码与特定 Electron Node 版本绑定，使增量包跨次版本可移植
- `--dir` 不产 `.asax`：免安装目录本身已经是绿色版，分发增量包没有意义

`.asax` 用于客户端运行时的增量更新——客户端启动时下载新 `.asax` 替换安装目录里渲染层产物。分发与替换机制由 toolkit 或用户代码承接，frame 仅负责产物。

#### 10.5.1 包描述约定（`.asax` / child `.asar` 根 `package.json`）

setup 概念的产物清单，跟 webpack DefinePlugin 注入的 `__BC_BUILD__` 同源但不等同：

```js
function derivePackageDescriptor(buildInfo) {
    // 从 __BC_BUILD__ 取以下字段（其余字段不出现）
    const { name, productName, version, env, envName, buildTime,
            platform, arch, dir, sign, child, encrypted } = buildInfo;
    // 绝不包含 encryptKey ─ 与 10.3 最小暴露面约束一致
    return { name, productName, version, env, envName, buildTime,
             platform, arch, dir, sign, child, encrypted };
}
```

- **绝不包含 `encryptKey`**：10.3 节最小暴露面约束在 setup 描述层延续——主进程字面量 + bytenode 是 encryptKey 唯一允许的载体；asar 包根的 package.json 是分发包内部的可读文件，写明文密钥违背设计
- **序列化形态**：标准 `package.json` JSON 对象，字段名沿用 `__BC_BUILD__` 的 camelCase 命名（不强行套 npm 字段语义）
- **消费方**：宿主应用 / toolkit / 用户代码读取此文件判断版本、环境、构建标识

### 10.6 子应用 `.asar` 包（`src/pack/child-asar.js`）

`child` 命令不调 electron-builder、不读 `electron-builder.config.js`。

流程见 9.2 节。产物：`dist/child-${name}-${env}-v${version}.asar`，跨平台。

**后缀选择**：frame 统一使用 `.asar` 标准后缀，不沿用某些参考实现中"打包为 `.asar` 后改名 `.asax`"的做法。子应用是宿主动态加载的资源包，`.asar` 是 Electron 官方规格，业界工具链友好。

`.asar` 根目录的 `package.json` 与 10.5.1 节「包描述约定」一致：基于 `__BC_BUILD__` 派生的子集（不含 `encryptKey`）。child 命令下 `platform` / `arch` 在序列化时按标准 JSON 行为省略（`undefined` 字段不出现），布尔字段（`dir` / `sign` / `child` / `encrypted`）按缺省值序列化。宿主区分"child 包"与"主应用 .asax"以 `child: true` 字段为准。

### 10.7 unpacked 路径推导（`src/electron/build-targets.js#computeUnpackedDir`）

`installer` 命令复用上一次 `pack --dir` 产出的 unpacked 目录作为 electron-builder 的 `prepackaged` 输入。pack 与 installer 都基于同一份命名约定从 `{ platform, arch }` 推导路径，**不依赖任何持久化状态**。

**电子-builder `dir` target 命名约定**（`build()` 对该 target 返回空 artifacts，只能靠约定推导）：

| 平台 | arch=x64 | 其他 arch |
|---|---|---|
| `win` | `dist/win-unpacked` | `dist/win-{arch}-unpacked` |
| `linux` | `dist/linux-unpacked` | `dist/linux-{arch}-unpacked` |
| `mac` | `dist/mac` | `dist/mac-{arch}`（无 `-unpacked` 后缀） |

**pack 侧**（`pack --dir` 末尾，9.1 ⑮）：`await build(...)` → `computeUnpackedDir` 推导预期路径 → `fs.existsSync` 校验 → 存在则日志确认、不存在则 `logger.warn` 提示后续 installer 无法复用。

**installer 侧**（9.3 ⑥）：`unpackedPath = path.resolve(rootDir, 'dist', computeUnpackedDir(cliOptions))` 直接现算 → 透传给 `electron-builder.build({ ..., prepackaged: unpackedPath })`。

**frame 不做的校验**：

- 不检查 `unpackedPath` 指向的目录是否存在（不存在由 electron-builder 抛 `prepackaged path does not exist`）
- 不检查上次 pack 是否与本次 installer 的 CLI 参数一致——若确实错配（如 pack 用 x64、installer 用 ia32），命名约定会指向不同目录，electron-builder 自然抛错

**为什么不写状态文件**：installer 命令本身就要求 `--platform` / `--arch`，两侧从同一份 CLI 参数推导路径即可，无需持久化。这也让 installer 的行为更符合直觉——命令参数是什么就找什么目录，避免"沉默使用旧状态里的错配值"。

### 10.8 `--sign` 透传

`--sign` 不触发任何 frame 内置签名配置组装。在 pack 命令下：

- `ctx.cliOptions.sign = true`
- `__BC_BUILD__.sign = true`

在 installer 命令下：

- `ctx.cliOptions.sign = true`（`__BC_BUILD__` 不派生，应用代码也读不到——但 installer 路径下应用代码已是编译产物，本就不需要 `__BC_BUILD__.sign`）

用户在 `electron-builder.config.js` 中根据 `ctx.cliOptions.sign` 分支决定证书、时间戳、算法等具体字段。

### 10.9 多渲染入口扩展

frame 预设是单入口：`entry: 'src/renderer/index.js'`、`output.path: app/renderer`、`output.filename: 'index.js'`，产物落 `app/renderer/index.js`。

多入口场景归用户在 `bc.config.renderer` 自配：

```js
renderer: {
    entry: {
        renderer: 'src/renderer/index.js',
        update:   'src/update/index.js',
        about:    'src/about/index.js',
    },
    output: {
        filename: '[name]/index.js',   // 同步覆盖，让各入口产到子目录
    },
}
```

**合并行为**（webpack-merge 官方默认）：

- 用户传对象 entry → 字符串预设被对象覆盖（webpack-merge 对不同类型直接以用户值取代）
- 用户传字符串 entry → 用户字符串覆盖预设，仍是单入口，产物路径由 `output.filename` 决定

**AES 加密生效时**，遍历 `app/*` 除 `main` 外所有子目录，递归加密 `.js`。默认单入口只加密 `app/renderer/*.js`；用户多入口 + `[name]/index.js` 后，`app/renderer/<entryName>/*.js` 也在加密范围内。

### 10.10 附加资源打包（native / 脚本 / 其他资源）

frame preset `files` 默认 `[{ from: 'app', to: '.' }, 'package.json', '!**/node_modules/**']`——只把 `app/` 与 `package.json` 打进 asar，其余全部由用户在 `electron-builder.config.js` 显式声明。electron-builder 提供 4 个字段各司其职：

| 字段 | 落位 | 应用代码访问方式 | 典型场景 |
|---|---|---|---|
| `files` | asar 内 | 与源码同路径 require / fs | 源码、静态 JSON / 图片等**可走虚拟文件系统**的资源 |
| `asarUnpack` | asar 外副本（`app.asar.unpacked/`） | 同上（Electron 自动查找 unpacked） | `.node` 二进制、需 spawn 执行的可执行文件、需 fs 写的文件 |
| `extraResources` | asar 外 `resources/`（与 `app.asar` 同级） | `path.join(process.resourcesPath, ...)` | 脚本、模板、外部工具、大型静态资源 |
| `extraFiles` | 应用**根**目录 | `path.dirname(process.execPath)` | 与安装包 / OS 交互的文件（安装脚本、系统集成清单） |

**决策路径**：

1. 代码要 `require` / `fs` 读源码同层路径？→ `files`（asar 内）
2. 是 `.node` 或必须磁盘可执行 / 可写？→ `asarUnpack`（asar 内 + 磁盘副本，代码路径无感）
3. 是脚本、模板、外部工具？希望路径明确、隔离于源码？→ `extraResources`（`process.resourcesPath`）
4. 与应用**根**目录 / 安装脚本交互？→ `extraFiles`

**示例 · 项目内 `native/` 目录含 `.node`**：

```js
module.exports = (ctx) => ({
    files: [
        { from: 'app', to: '.' },
        'package.json',
        '!**/node_modules/**',
        'native/**',                    // 加入 asar（源码同路径 require 可读）
    ],
    asarUnpack: [
        '**/*.node',                    // .node 从 asar 抽出到 unpacked 副本
    ],
});
```

**示例 · 项目内 `scripts/` 目录含运行时执行的脚本**：

```js
module.exports = (ctx) => ({
    extraResources: [
        { from: 'scripts/', to: 'scripts/' },
    ],
});
// 运行时：path.join(process.resourcesPath, 'scripts', 'foo.sh')
```

**示例 · 第三方 `node_modules` 里带 `.node` 的模块**（如 `better-sqlite3`）：

```js
module.exports = (ctx) => ({
    files: [
        { from: 'app', to: '.' },
        'package.json',
        '!**/node_modules/**',
        'node_modules/better-sqlite3/**',   // 白名单反选，把需要的模块加回来
    ],
    asarUnpack: [
        '**/*.node',
    ],
});
```

**与 preset `files` 的合并**：electron-builder.config 走 customMerge（§5.3），用户数组默认与 preset 追加；如需完全接管 `files` 白名单，用 `files: replace([...])`。

---

## § 11 frame ↔ user 边界 + 默认行为大矩阵

### 11.1 frame 必做（构建期闭环）

| # | 能力 | 触发条件 | 输入 | 输出 |
|---|---|---|---|---|
| F1 | env 加载 | 所有命令 | `.env` + `.env.<name>` | `ctx.env` 全集 + `process.env.BC_*` 子集（frame 进程） |
| F2 | CLI 解析 + 未声明 flag 透传 | 所有命令 | argv | `ctx.cliOptions` |
| F3 | `__BC_BUILD__` 派生 | 除 `installer` 外 | pkg.json + ctx + `build/encrypt.key` | `__BC_BUILD__` 14 字段对象 |
| F4 | DefinePlugin 注入 `__BC_BUILD__` | 跑 webpack 的命令 | `__BC_BUILD__` | 字面量进编译产物 |
| F5 | DefinePlugin 注入 `process.env.BC_*` | 同上 | env BC_ 子集 | 字面量进编译产物 |
| F6 | bc.config 加载与合并 | dev:app / dev:web / build / pack / child | bc.config + 4 预设 | 各 target 完整 webpack 配置 |
| F7 | electron-builder.config 加载与合并 | pack / installer | builder.config + getPackPreset | mergedBuilderConfig |
| F8 | webpack 编排 | dev:app / dev:web / build / pack / child | 完整 webpack 配置 | 产物落 `app/` 或 `dist/` |
| F9 | webpack-dev-server | dev:app(renderer) / dev:web(web) | renderer / web 配置 | dev server 起 |
| F10 | Electron 启动 | dev:app | 编译完成 + `RENDERER_DEV_URL` | Electron 子进程 |
| F11 | `dist/` 清理 | build / pack / child（进场） | — | `dist/` empty |
| F12 | `app/` 清理 | pack（阶段 B 入口）/ child（webpack 编译前） | — | `app/` empty |
| F13 | icon 自适配 | pack / installer | `build/icon.png` | `dist/icons/*` + builder.config 注入 |
| F14 | 平台脚本生成 | pack / installer | 模板 + 替换变量 | `dist/shell/*` + builder.config 注入 |
| F15 | AES 加密渲染层 | pack / child（encrypt 开） | `build/encrypt.key` + 渲染产物 | 加密产物 + `__BC_BUILD__.encrypted/encryptKey` |
| F16 | bytenode 主进程字节码 | pack（bytenode 开） | `app/main/index.js` | `.jsc` + 加载入口 |
| F17 | 增量 `.asax` 包 | pack（incremental 开 & 非 `--dir`） | `app/<除 main 外>` + 包描述 | `dist/${env}-v${version}.asax` |
| F18 | 子应用 `.asar` 包 | child | 编译后 `app/` + 包描述 | `dist/child-${name}-${env}-v${version}.asar` |
| F19 | electron-builder 调用 | pack / installer | targets + config + 可选 prepackaged | `dist/*.exe/.dmg/.deb` 或 `dist/<unpacked>/` |
| F20 | unpacked 路径校验 | pack 完成 + `--dir` | 按 platform/arch 推导路径 | 存在性校验 + logger 反馈 |
| F21 | unpacked 路径推导 | installer 阶段 C | CLI 的 platform/arch | `prepackaged` 参数（透传 electron-builder） |

### 11.2 用户必做

| # | 项 | 位置 | 说明 |
|---|---|---|---|
| U1 | `appId` | electron-builder.config | frame 不提供默认；缺失由 electron-builder 报错 |
| U2 | 平台特定字段（`win` / `mac` / `linux` / `nsis` / `dmg` / `deb` 等） | electron-builder.config | frame 仅提供 preset 基础与 10.1 / 10.2 注入；平台个性由用户写 |
| U3 | 代码签名信息组装 | electron-builder.config（用 `cliOptions.sign` 分支） | 证书路径、密码、时间戳服务器由用户管理 |
| U4 | macOS notarize / afterPack / afterSign 钩子 | electron-builder.config | frame 不介入，靠 electron-builder 原生 |
| U5 | 龙芯 `electronDownload` 配置 | electron-builder.config（用 `cliOptions.arch === 'loong64'` 分支） | 版本由用户决定 |
| U6 | 解密逻辑实现 | 用户主进程代码或 toolkit | 读 `__BC_BUILD__.encrypted` 与 `__BC_BUILD__.encryptKey` 决定解密分支 |
| U7 | HTML 模板 | `bc.config.renderer.plugins` / `bc.config.web.plugins` 自注册 `html-webpack-plugin` | frame 不内置 |
| U8 | 资产（证书、addons、自定义图标等）准备 | `build/cert/` / extraResources 等 | 用户在 electron-builder.config 配；native / 脚本 / 其他附加资源打包决策见 §10.10 |
| U9 | 运行时入口选择（`loadURL` vs `loadFile`） | 用户主进程代码 | frame 仅注入 `NODE_ENV` + `RENDERER_DEV_URL`，不提供运行时对象 |
| U10 | `bc.config` 行为开关 | bc.config | `encrypt` / `bytenode` / `incremental` 等 |
| U11 | `package.json.main` 指向 main 产物 | package.json | 用户写 `app/main/index.js` 即可（dev 直接读；pack 内 bytenode 路径 A 通过 `extraMetadata.main` 在安装包内重写为 `main/loader.js`，用户无需调整 package.json） |

### 11.3 用户可选

| # | 项 | 自定义方式 |
|---|---|---|
| O1 | 自定义 NSIS / DEB 脚本 | electron-builder.config 覆盖 `nsis.include` / 用 `replace()` 覆盖 `deb.fpm` |
| O2 | 多渲染入口（如 update / about 窗口） | `bc.config.renderer.entry` 扩展为对象 |
| O3 | 额外构建期 flag | 命令行追加 `--xxx`，仅 `cliOptions.xxx` 可读 |
| O4 | 关闭运行时增强 | `bc.config.encrypt / bytenode / incremental: false` |
| O5 | 子应用打包 | 跑 `child` 命令 |
| O6 | 复用 unpacked 出 installer（外部签名场景） | 先 `pack --dir`，再 `installer` |
| O7 | dev:app 与 dev:web 并存 | 错开端口（默认已错开），同时跑 |
| O8 | 同构 renderer | 不动默认 entry（`src/renderer/index.js` 即 app+web 共享） |
| O9 | 关闭 webpack 静默 | bc.config 覆盖 `stats` / `infrastructureLogging` |

### 11.4 默认行为 × 失败模式

| 能力 | 默认 | 关闭 / 覆盖方式 | 缺前置时行为 |
|---|---|---|---|
| `__BC_BUILD__` 注入 | 除 installer 外始终开 | 无关闭开关 | — |
| `process.env.BC_*` 注入 | 始终开 | 无关闭开关 | `.env.<name>` 缺失 → 抛错 |
| icon 自适配 | `build/icon.png` 存在 且 三平台 icon 未全写时开 | 删 `build/icon.png` / 三平台 icon 全写 → 跳过 | 部分覆盖：frame 仍生成全套，已写不被覆盖 |
| 平台脚本生成 | pack / installer 始终开 | `nsis.include` / `deb.fpm` 显式写 → frame 不注入 | — |
| AES 加密 | pack / child 开 | `bc.config.encrypt: false` | encrypt 开 但 `build/encrypt.key` 缺失 → 抛错 |
| bytenode | pack 开 | `bc.config.bytenode: false` | — |
| 增量 `.asax` | pack 开（非 `--dir`） | `bc.config.incremental: false` 或 `--dir` | — |
| unpacked 路径衔接 | pack 与 installer 都按 `{ platform, arch }` 现算（`computeUnpackedDir`） | 无关闭开关 | installer 参数与 pack 错配 / 目录不存在 → electron-builder 抛错；frame 不预校验 |
| 龙芯镜像 | 关 | — | 用户未配置且打 loong64 → electron-builder 用默认源（一般失败）；用户在 builder.config 自管 |
| 同构 renderer 默认 entry | `src/renderer/index.js` 共享 | 用户在 `bc.config.web.entry` 改 | — |
| HTML 模板 | 用户自注册 `html-webpack-plugin` | — | 用户不注册 → 不产 HTML，web/renderer 不可加载 |
| webpack 静默 | renderer / web 预设 `stats: 'none'` | bc.config 覆盖 | — |

### 11.5 配置加载行为矩阵

| 命令 | bc.config | electron-builder.config | `.env.<name>` |
|---|---|---|---|
| `dev:app` | 必需 | — | 必需 |
| `dev:web` | 必需 | — | 必需 |
| `build` | 必需 | — | 必需 |
| `pack` | 必需 | 必需 | 必需 |
| `installer` | — | 必需 | 必需 |
| `child` | 必需 | — | 必需 |

任一必需项缺失 → dispatcher fail-fast 抛错。

---

## § 12 logger + 编译反馈契约

`src/core/logger.js` 是 frame 输出的**唯一通道**。所有 frame 主动输出走 logger，不直接 `console.*`；webpack stats 完整打印仅作失败时的例外（在调用方紧随 logger.compileFailure 之后输出）。

### 12.1 API

| API | 用途 | 调用方 |
|---|---|---|
| `info(msg)` | 常规信息，`[base-client]` cyan 前缀 | dispatcher / 各命令 |
| `success(msg)` | 绿色 ✓ 前缀 | 命令完成 |
| `warn(msg)` | 黄色 ⚠ 前缀 | 各处 |
| `error(scope, msg)` | 红色前缀 + bold scope | dispatcher catch |
| `banner({ command, target, mode, env })` | 启动横幅：`[base-client] v<ver>  <command> \| target=<t> \| env=<BC_ENV> \| mode=<mode>` | dispatcher 进入 |
| `footer({ env, url, target })` | dev 完成 footer：`[base-client] env=... \| <url> \| target=<t>` | dev:app / dev:web hooks.done |
| `compileSuccess(name, ms, sizeBytes)` | `[base-client] ✓ <name> 编译完成 (<ms> \| <size>)` | 编译完成 |
| `compileFailure(name)` | `[base-client] ✗ <name> 编译失败`（不打印 stats 主体，由调用方紧随其后 `stats.toString({colors:true})` 输出详情） | 编译失败 |
| `compileWarning(name, count)` | `[base-client] ⚠ <name> N warnings` | 编译完成 |
| `formatBytes(n)` / `formatMs(n)` | 容量 / 耗时格式化 helper | 各处 |

**设计意图**：

- **统一前缀**：所有 frame 输出带 `[base-client]` cyan 前缀，与 webpack / dev-server / Electron 的原生输出可视区分
- **接管 webpack stats**：编译反馈走 `compileSuccess` / `compileFailure` 摘要行（一行内含 name + ms + size），不再让用户面对默认 `stats.toString()` 的整屏输出；**仅在失败时**才输出 `stats.toString({ colors: true })` 全量信息以便排查
- **基于 picocolors**：极简 ANSI 上色，零依赖压力（picocolors 已是 dependency）。不引入 chalk / kleur
- **可测试**：所有 API 走 `console.log` / `console.error`，测试时 mock 即可断言

### 12.2 webpack stats 接管

预设端配合：

- renderer / web 预设：`stats: 'none'` + `infrastructureLogging.level: 'warn'`
- main / preload 预设：靠 `webpack(cfg, cb)` 回调路径，由命令层显式调 logger
- dev-server：`devMiddleware.stats: false`

仅失败时输出 `stats.toString({ colors: true })` 全量。

### 12.3 编译 spinner（`src/webpack-runner/compile-spinner.js`）

```js
const spinner = createCompileSpinner('编译中...');
spinner.start();
// 各 compiler 首次完成后调 tickInitial()，累计达 N 次后 spinner.stop()
```

- 基于 `ora`，文案显示 `编译中... <累计耗时>`，1s 间隔刷新
- `setInterval` 加 `.unref()` 避免阻塞 Node 退出
- **持有 spinner 引用的模块**（`run-dev-server.js` / `run-build.js` 等）在 logger 输出前调本地 `spinner.clear()`，避免 spinner 行被 stdout 卡断；logger 模块本身不耦合 spinner

### 12.4 stats 摘要（`src/webpack-runner/format-stats.js`）

```js
function extractStatsSummary(stats, fallbackName) {
    // stats.toJson({ assets, errors, warnings, modules:false, chunks:false, children:false })
    return { name, ms, totalSize, errorCount, warningCount };
}
```

纯函数提取摘要字段，输入是 webpack `Stats` 对象，输出供 `logger.compileSuccess` / `compileFailure` / `compileWarning` 消费。多处共用一份摘要逻辑，避免反馈格式漂移。

### 12.5 错误处理与退出码

dispatcher 统一 `try/catch`：

- 命令内一律 `throw new Error(...)` 表达前置检查失败
- catch 内调 `logger.error(scope, msg)`
- `--debug` 时附加 `console.error(err.stack)`（不走 logger 上色，贴近 vite / eslint / jest 习惯）
- 退出码：成功 `0`，失败 `1`（不细分错误码）

**webpack 编译错误独立于堆栈**：失败时 `stats.toString({colors:true})` 完整打印，**始终可见**（不受 `--debug` 影响）。

---

## § 13 src/ 文件结构

```
src/
├── core/                            # 横切契约
│   ├── mode.js                     # MODES + deriveMode
│   ├── target.js                   # TARGETS + deriveTarget
│   ├── ctx.js                      # buildCtx(cmd, cliOptions, env)
│   ├── build-info.js               # deriveBuildInfo(ctx, pkgJson) → __BC_BUILD__
│   ├── env.js                      # loadEnv(envName) → { full, bcSubset }
│   └── logger.js                   # 输出唯一通道
│
├── cli/
│   ├── index.js                    # cac 注册 + 派发器（runCommand）
│   └── commands/
│       ├── dev-app.js              # dev:app 命令模板
│       ├── dev-web.js              # dev:web 命令模板
│       ├── build.js                # build 命令模板
│       ├── pack.js                 # pack 命令模板
│       ├── installer.js            # installer 命令模板
│       └── child.js                # child 命令模板
│
├── config/
│   ├── bc-config.js                # resolveBuildConfig(ctx) → { main, preload, renderer } 或 { web }
│   ├── builder-config.js           # resolveBuilderConfig(ctx) → mergedBuilderConfig
│   ├── merge.js                    # customMerge + replace + REPLACE Symbol
│   └── presets/
│       ├── main.js                 # getMainPreset
│       ├── preload.js              # getPreloadPreset
│       ├── renderer.js             # getRendererPreset
│       ├── web.js                  # getWebPreset
│       ├── pack.js                 # getPackPreset
│       ├── build-info-plugin.js    # buildInfoPlugin(buildInfo, { includeEncryptKey })
│       └── user-env-plugin.js      # userEnvPlugin(env)
│
├── pack/                            # pack 能力小模块
│   ├── icon.js                     # adaptIcon(ctx, mergedBuilderConfig)
│   ├── shell.js                    # generateShellScripts(ctx, mergedBuilderConfig, buildInfo)
│   ├── encrypt.js                  # encryptRenderer(ctx)
│   ├── bytenode.js                 # bytenodeMain(ctx, mergedBuilderConfig)
│   ├── incremental.js              # buildIncrementalAsax(ctx, buildInfo)
│   ├── child-asar.js               # buildChildAsar(ctx, buildInfo)
│   └── package-descriptor.js       # derivePackageDescriptor(buildInfo)
│
├── webpack-runner/                  # webpack 编排
│   ├── run-build.js                # runWebpackBuild(configs, ctx) 并行 + logger 反馈（dev:app / build / pack / child 共用）
│   ├── compile-spinner.js          # createCompileSpinner
│   └── format-stats.js             # extractStatsSummary
│
├── electron/                        # Electron 共享工具
│   ├── resolve-electron.js         # resolveElectron(rootDir)
│   ├── resolve-main-entry.js       # resolveMainEntry(rootDir)
│   ├── kill-electron.js            # killElectron(child) 跨平台
│   ├── resolve-electron-builder.js # resolveElectronBuilder(rootDir)
│   └── build-targets.js            # buildTargets / computeUnpackedDir（10.7）
│
├── templates/
│   └── shell/
│       ├── win-installer.nsh
│       ├── deb-preinstall.sh
│       ├── deb-postinstall.sh
│       └── deb-postrm.sh
│
└── index.js                         # 包入口（rollup 后 dist/index.js）

bin/
└── base-client.js                   # CLI 二进制入口
```

### 13.1 模块依赖关系

```
core/        ← 横切（无外向依赖）
config/      ← core
pack/        ← core, config（仅 builder-config 的合并结果与 buildInfo）
webpack-runner/ ← core
electron/    ← core
cli/commands/← core, config, pack, webpack-runner, electron
cli/index.js ← cli/commands/*
```

### 13.2 包依赖

**dependencies**（运行时需要）：

- `cac`：CLI 解析
- `dotenv`：`.env` 文件解析
- `fs-extra`：`emptyDirSync` 等文件操作
- `ora`：编译 spinner
- `picocolors`：极简 ANSI 上色
- `@electron/asar`：增量 `.asax` / child `.asar` 打包
- `webpack-merge`：bc.config 合并 + customMerge 基础
- `jimp` / `png2icons`：icon 自适配

**peerDependencies**（用户项目提供）：

| 包 | 用途 | 何时必需 |
|---|---|---|
| `webpack` | 编译核心 | 所有跑 webpack 的命令 |
| `webpack-dev-server` | dev 命令 dev-server | `dev:app` / `dev:web` |
| `electron` | Electron 主进程 / electron-builder 打包时依赖 | `dev:app` / `pack` / `installer` |
| `electron-builder` | 安装包封装 | `pack` / `installer` |
| `bytenode` | 主进程字节码 | `pack` 且 `bc.config.bytenode !== false` |

`electron` / `electron-builder` / `bytenode` 不在 frame 的 dependencies，也在 `peerDependenciesMeta` 里标为 `optional`——按需从用户项目 `node_modules` 解析、版本随项目走，未启用相应命令的用户 install 时不受红字警告。`webpack` / `webpack-dev-server` 是几乎所有命令的核心依赖，**不打 optional**，缺失时给用户正常 peer 警告。

### 13.3 编译期内置常量

`__BC_BUILD__.encryptKey` 注入仅 main preset，由 `buildInfoPlugin(buildInfo, { includeEncryptKey: true })` 控制。其余 preset 调用时 `includeEncryptKey` 默认 false——preload / renderer / web 的 bundle 中 `__BC_BUILD__.encryptKey` 字段被字面量替换为 `undefined`。

### 13.4 rollup 打包

- 入口 `src/index.js` 汇出 frame 包公共 API
- `bin/base-client.js` 通过 `dist/cli` 引用 cli 入口
- `src/templates/shell/*` 在 rollup 配置中通过 copy 插件复制到 `dist/templates/shell/`，运行时通过 `path.resolve(__dirname, '../templates/shell/<name>')` 读取
