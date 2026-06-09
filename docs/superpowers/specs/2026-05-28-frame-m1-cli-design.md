# Frame M1：CLI 入口与命令派发（详细设计）

> 所属：[Frame 总设计](./2026-05-28-frame-overview-design.md) 的 M1 模块。

## 一、定位

M1 是 frame 的**命令入口层**：解析 `base-client <command>` 的命令与参数，完成环境初始化，把控制权派发给各命令实现。它定义 frame 对用户暴露的命令行契约，并为所有命令统一提供：参数收集、环境初始化、mode 派生、上下文组装、启动横幅、错误处理。

M1 不实现任何命令的具体逻辑（构建、打包等由 M5/M6/M7 实现），只负责"解析 → 初始化 → 派发"。

M1 同时负责 frame 全局共享基础设施的归属：`src/mode.js`（mode 抽象）与 `src/logger.js`（CLI 输出层）的契约由本模块定义，详见 §九 / §十。

## 二、命令清单

| 命令 | 作用 | 隐含 mode |
|------|------|-----------|
| `dev` | 编译 main+preload → 启动 dev server → 启动 Electron | development |
| `build` | 三进程生产构建 | production |
| `preview` | 启动已构建产物 | production |
| `pack` | 构建安装包（M7 实现） | production |

## 三、参数接触面

### 全局选项（所有命令通用）

| 选项 | 简写 | 取值 | 默认 | 作用 |
|------|------|------|------|------|
| `--env <name>` | `-e` | 任意名称 | `prod` | 指定环境名，加载 `.env.<name>`。名称由项目自行约定，文件存在性校验见 M3 §四 |
| `--config <path>` | `-c` | 路径 | cwd 自动探测 `bc.config.*` | 指定用户配置文件位置 |
| `--debug` | — | boolean | 关 | 出错时附打印 `err.stack`（默认仅打印错误消息） |

### 命令专属选项

| 命令 | 选项 | 默认 | 作用 |
|------|------|------|------|
| `dev` | `--port <n>` | M5 兜底 8023 | dev server 端口（优先级 `--port` > `bc.config` > 8023，见 M5） |
| `dev` | `--host <host>` | M5 兜底 localhost | dev server host（优先级同 `--port`） |
| `dev` | `--watch-main` | 关 | watch main + preload，改动自动重启 Electron（见 M5） |

> `--port` / `--host` 在 CLI 层**不预置默认值**：cac 默认值会使 `cliOptions.port` 恒有值、按 CLI flag 最高优先级生效，导致 `bc.config` 永远无法覆盖。其默认值由 dev 命令（M5）在 `bc.config` 之后兜底，从而实现 `CLI > bc.config > 默认` 的优先级。

### mode 维度

mode 由命令隐含（dev → development，其余 → production），**不开放 `--mode` 覆盖**。mode 由命令文件声明，经上下文流向构建配置以设置 `webpack.mode`。

### 配置优先级

所有 `--xxx` 选项统一收集为 `cliOptions` 对象，作为**内联配置覆盖层**。完整优先级：

```
CLI flag (cliOptions)  >  命令/env 默认  >  bc.config.js  >  预设默认
```

### 扩展约定

新增任何内联配置（如 `--out-dir`、`--sourcemap`、`--debug` 等），只需在对应命令或全局加一行 `.option()`，派发层与配置合并层（M2）无需改动。

## 四、命令注册方式

### 命令文件结构

每个命令文件导出统一结构：

```js
// src/cli/commands/dev.js
const { MODES } = require('../../mode');

module.exports = {
  name: 'dev',
  description: '启动开发服务器 + Electron',
  mode: MODES.DEV,                                       // 隐含 mode，缺省按 MODES.PROD（见 §九 mode 抽象）
  skipEnv: false,                                        // 缺省 false：派发前 initEnv；preview 声明 true 跳过
  options: [
    ['--port <n>', 'dev server 端口'],    // 不预置默认值，默认由命令兜底（便于 bc.config 覆盖）
    ['--host <host>', 'dev server host'],
  ],
  action: async (ctx) => { /* ctx = { cliOptions, env, mode, command, isDev, isProd } */ },
};
```

`skipEnv: true` 的命令（目前仅 preview）在派发前**不调 `initEnv`**，`ctx.env` 为 `undefined`。preview 既不调 `resolveBuildConfig`、也不需要 env 注入，跳过可避免被 `.env.<name>` 缺失误拦（呼应 M6 §三 "preview 不读 bc.config.js"）。

### 注册器

`src/cli/index.js` 维护命令清单，循环注册，全局选项统一注入：

```js
const { cac } = require('cac');
const { version } = require('../../package.json');

const cli = cac('base-client');

// 全局选项
cli.option('--env <name>', '指定环境名，加载 .env.<name>（名称由项目约定）', { default: 'prod' });
cli.option('--config <path>', '指定 bc.config 路径');

// 命令清单
const commands = [
  require('./commands/dev'),
  require('./commands/build'),
  require('./commands/preview'),
  require('./commands/pack'),
];

for (const cmd of commands) {
  const c = cli.command(cmd.name, cmd.description);
  (cmd.options || []).forEach(([flag, desc, cfg]) => c.option(flag, desc, cfg));
  c.action((cliOptions) => runCommand(cmd, cliOptions));
}

cli.help();
cli.version(version);

module.exports = { cli };
```

加一个命令 = 写一个 `{ name, description, mode, options, action }` 文件 + 在清单加一行。

## 五、环境初始化与参数传递

### 时机

环境初始化在 `runCommand` 内、命令 `action` 执行**之前**统一进行，以解析后的 `cliOptions.env` 为输入。所有命令走同一步，不重复、不遗漏。

### env 流转策略

`initEnv(envName)`（M3 提供）是纯函数：读取并合并 `.env` 与 `.env.<name>`，**返回 env 对象**。`.env.<name>` 存在性校验由 M3 §四 实施；抛错经 `runCommand` 统一捕获并按错误处理流程报告。

`runCommand` 拿到 env 对象后，做两件事再调 `cmd.action(ctx)`：

1. **`BC_ENV` fallback**：若 `env.BC_ENV` 为假值（缺失或空串），用 `cliOptions.env` 兜底（详见 M3 §六 BC_ENV 小节）。
2. **`BC_` 前缀键整体写入 frame 进程的 `process.env`**：使 frame 内 require/调用的子工具（如 `electron-builder`）能从 `process.env` 读到运行时业务变量；这是 frame 流程层面的能力，与 M4 经 `DefinePlugin` 焊进三进程 bundle 是两条独立通道，源自同一份 env。

业务环境变量在**构建时**经 webpack `DefinePlugin` 注入三进程 bundle，运行时代码使用注入后的值。三进程 bundle 不读 frame 进程的 `process.env`（DefinePlugin 已经替换为字面量）；frame 自身进程 / 子工具走 `process.env` 通道。

### 上下文容器

`runCommand` 组装上下文对象 `ctx` 并显式传给 action：

```js
const { MODES, deriveMode } = require('./mode');
const ctx = { cliOptions, env, mode, command, ...deriveMode(mode) };
// → { cliOptions, env, mode, command, isDev, isProd }
```

- `command` 为当前命令名（`cmd.name`），供下游（如 `bc.config.js` 的函数形态）按命令分支。
- `isDev` / `isProd` 由 `deriveMode(mode)` 在 runCommand 一次性派生注入，供命令实现、用户 `bc.config.js` 函数、用户 `electron-builder.config.js` 函数直接读取，免去各处 `mode === 'development'` 字面量判断。
- `ctx` 是可扩展容器，后续新增传递项扩展此对象即可，不破坏 action 签名。
- 命令执行层（M5/M6/M7）传给配置层的函数（`resolveBuildConfig` / `resolvePackConfig` / `runProductionBuild`）一律收 `ctx` 整体，不再解构成 `{env, mode, command, cliOptions}`，避免调用方"解构-重组"样板。

### 完整数据流

```
--env  →  initEnv()  →  env 对象 ──┬─ BC_ENV fallback（若缺失/空，用 cliOptions.env）
                                   ├─ BC_ 前缀键 → frame 进程 process.env（供 frame 内子工具读）
                                   └─ ctx.env →  action  →  resolveBuildConfig({ env, mode, cliOptions })
                                                              →  各 preset 的 DefinePlugin  →  焊进三进程 bundle
```

### 派发器伪代码

```js
const { MODES, deriveMode } = require('./mode');
const logger = require('./logger');

async function runCommand(cmd, cliOptions) {
  try {
    const env = cmd.skipEnv ? undefined : initEnv(cliOptions.env);  // ① skipEnv 命令跳过 initEnv
    if (env) {
      if (!env.BC_ENV) env.BC_ENV = cliOptions.env;                 // ② BC_ENV fallback（详见 M3 §六）
      for (const k of Object.keys(env)) {                           // ③ BC_ 前缀注入 frame 进程 process.env
        if (k.startsWith('BC_')) process.env[k] = env[k];
      }
    }
    const mode = cmd.mode || MODES.PROD;                            // ④ 命令隐含 mode（MODES 常量）
    const ctx = {
      cliOptions, env, mode, command: cmd.name,
      ...deriveMode(mode),                                          // ⑤ 派生 isDev/isProd 注入 ctx
    };

    process.title = `bc-${cmd.name}|env=${env?.BC_ENV ?? '?'}`;     // ⑥ 进程标题，便于 ps / 任务管理器识别
    logger.banner({ command: cmd.name, mode, env });                // ⑦ 启动横幅：版本 + 命令 + env + mode

    await cmd.action(ctx);                                          // ⑧ 显式传入
  } catch (err) {
    logger.error(`${cmd.name} 失败：`, err.message);                 // 红色前缀 + bold scope（见 §十 logger）
    if (cliOptions && cliOptions.debug) console.error(err.stack);   // 默认仅打印 message；--debug 附 stack
    process.exit(1);
  }
}
```

### 命令侧消费示例

```js
// src/cli/commands/dev.js
action: async (ctx) => {
  const { cliOptions, env, isDev } = ctx;                          // 直接读派生标志，免去 mode === '...' 字面量
  const { main, preload, renderer } = resolveBuildConfig(ctx);     // 收 ctx 整体，不再解构-重组
  // 起 webpack + dev server（端口取 cliOptions.port）+ spawn electron
}
```

## 六、错误处理与退出码

错误处理收敛到 `runCommand` 一处：

1. **统一 try/catch**：所有命令异常集中捕获，命令内部不再各自退出。
2. **命令内部一律 `throw`**：前置检查失败（找不到产物、依赖缺失等）以 `throw new Error(...)` 表达，由 `runCommand` 统一处理。
3. **统一输出格式**：经 `logger.error(scope, msg)` 输出 → 红色 `[base-client]` 前缀 + bold `<command> 失败：` + 错误消息（详见 §十 logger 契约）。
4. **退出码**：成功 `0`，失败 `1`（不细分错误码）。
5. **堆栈打印**：默认仅打印错误消息；带 `--debug` 时附加 `err.stack`（直接 `console.error`，不走 logger 上色）。贴近常见 CLI 习惯（vite / eslint / jest）。
6. **编译错误独立于堆栈**：webpack 编译错误由各命令实现在调用 `logger.compileFailure(name)` 后用 `stats.toString({ colors: true })` 完整输出，与 `err.stack` 无关，始终可见（不受 `--debug` 影响）。

## 七、模块边界

M1 与其他模块的接口：

| 方向 | 接口 | 说明 |
|------|------|------|
| M1 → M3 | `initEnv(envName)` | 传入环境名，拿到 env 对象 |
| M1 → M2 | `resolveBuildConfig({ env, mode, command, cliOptions })` | 命令 action 内调用，拿到三进程构建配置 |

M1 **不负责**：env 如何读取/注入（M3/M4）、构建配置如何合并（M2）、各命令的构建/打包实现（M5/M6/M7）。

## 八、bin 入口

```js
// bin/base-client.js
#!/usr/bin/env node
const { cli } = require('../dist/cli');   // 运行 rollup 构建产物
cli.parse();
```

bin 引入 frame 自身的构建产物（`dist/cli`），是发布形态的入口。

## 九、mode 抽象（src/mode.js）

`src/mode.js` 是 frame 内 `'development'` / `'production'` 字面量的**唯一来源**。所有需要 mode 字面量或 dev/prod 判断的位置，都从这里取。

```js
const MODES = Object.freeze({
    DEV: 'development',
    PROD: 'production',
});

function deriveMode(mode) {
    if (!VALID_MODES.has(mode)) {
        throw new Error(`[base-client] mode 必须是 ${MODES.DEV} 或 ${MODES.PROD}，收到: ...`);
    }
    return { isDev: mode === MODES.DEV, isProd: mode === MODES.PROD };
}
```

### 设计意图

- **唯一字面量来源**：源码中 `'development'` / `'production'` 字面量只允许出现在 `mode.js`（定义处）和**生态边界注入**两处（`process.env.NODE_ENV` 的字面量赋值——webpack/Electron 生态约定，与 frame 的 mode 抽象耦合无益处，故保留字面量）。其余位置一律走 `MODES.DEV` / `MODES.PROD`，源码 grep `'development'` / `'production'` 字面量可验证。
- **fail-fast**：`deriveMode` 收到非法 mode 直接抛错，避免静默走错分支。
- **两处使用**：① M1 `runCommand` 一次性派生注入 `ctx`；② M4 三个 preset 内部各自 `deriveMode(mode)` 自包含派生（preset 不依赖外部 ctx）。两条独立通道源自同一份契约。
- **不开放 `--mode` 覆盖**：mode 由命令文件声明（`MODES.DEV` 或 `MODES.PROD`），不接受 CLI flag 覆盖。

## 十、CLI 输出契约（src/logger.js）

`src/logger.js` 是 frame 自有输出的**唯一通道**。所有 frame 主动输出的信息一律走 logger，不直接 `console.*`（命令实现内的 webpack stats 完整打印是例外，见下方）。

### API 清单

| API | 用途 | 调用方 |
|------|------|--------|
| `info(msg)` | 常规信息，`[base-client]` 前缀 | M1 / M5 |
| `success(msg)` | 成功（绿色 ✓ 前缀） | 各命令完成时 |
| `warn(msg)` | 警告（黄色 ⚠ 前缀） | 待 |
| `error(scope, msg)` | 错误（红色前缀 + bold scope） | M1 `runCommand` catch |
| `banner({ command, mode, env })` | 启动横幅：`[base-client] v<ver>  <command> \| env=<BC_ENV> \| mode=<mode>` | M1 `runCommand` 进入时 |
| `footer({ env, url, watch })` | dev 完成 footer：`[base-client] env=... \| <url> \| watch:on` | M5 renderer `hooks.done` |
| `compileSuccess(name, ms, sizeBytes)` | `[base-client] ✓ <name> 编译完成 (<ms> \| <size>)` | M5 / M6 编译完成 |
| `compileFailure(name)` | `[base-client] ✗ <name> 编译失败`（不打印 stats 主体，由调用方紧随其后 `stats.toString({colors:true})` 输出详情） | M5 / M6 编译失败 |
| `compileWarning(name, count)` | `[base-client] ⚠ <name> N warnings` | M5 / M6 |
| `formatBytes` / `formatMs` | 容量 / 耗时格式化 helper（导出供需要拼接行的位置复用） | 各处 |

### 设计意图

- **统一前缀**：所有 frame 输出带 `[base-client]` cyan 前缀，与 webpack / dev-server / Electron 的原生输出可视区分（webpack 已被 M4 静默化，详见 M4）。
- **接管 webpack stats**：编译反馈走 `compileSuccess` / `compileFailure` 摘要行（一行内含 name + ms + size），不再让用户面对默认 `stats.toString()` 的整屏输出。**仅在失败时**才输出 `stats.toString({ colors: true })` 全量信息以便排查。
- **基于 picocolors**：极简 ANSI 上色，零依赖压力（picocolors 已是 dependency）。不引入 chalk / kleur 等大体量库。
- **可测试**：所有 API 走 `console.log` / `console.error`，测试时 mock 即可断言（见 M1 plan）。
