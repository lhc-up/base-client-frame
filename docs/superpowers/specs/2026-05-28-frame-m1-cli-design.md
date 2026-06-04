# Frame M1：CLI 入口与命令派发（详细设计）

> 所属：[Frame 总设计](./2026-05-28-frame-overview-design.md) 的 M1 模块。

## 一、定位

M1 是 frame 的**命令入口层**：解析 `base-client <command>` 的命令与参数，完成环境初始化，把控制权派发给各命令实现。它定义 frame 对用户暴露的命令行契约，并为所有命令统一提供：参数收集、环境初始化、上下文组装、错误处理。

M1 不实现任何命令的具体逻辑（构建、打包等由 M5/M6/M7 实现），只负责"解析 → 初始化 → 派发"。

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
module.exports = {
  name: 'dev',
  description: '启动开发服务器 + Electron',
  mode: 'development',                                   // 隐含 mode，缺省按 production
  skipEnv: false,                                        // 缺省 false：派发前 initEnv；preview 声明 true 跳过
  options: [
    ['--port <n>', 'dev server 端口'],    // 不预置默认值，默认由命令兜底（便于 bc.config 覆盖）
    ['--host <host>', 'dev server host'],
  ],
  action: async (ctx) => { /* ctx = { cliOptions, env, mode, command } */ },
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

`initEnv(envName)`（M3 提供）是纯函数：读取并合并 `.env` 与 `.env.<name>`，**返回 env 对象，不写 `process.env`**。`.env.<name>` 存在性校验由 M3 §四 实施；抛错经 `runCommand` 统一捕获并按错误处理流程报告。

业务环境变量在**构建时**经 webpack `DefinePlugin` 注入三进程 bundle，运行时代码使用注入后的值、不读运行时 `process.env`。因此 env 全程显式传递即可，无需设置全局状态。

### 上下文容器

`runCommand` 组装上下文对象 `ctx` 并显式传给 action：

```js
const ctx = { cliOptions, env, mode, command };
```

- `command` 为当前命令名（`cmd.name`），供下游（如 `bc.config.js` 的函数形态）按命令分支。
- `ctx` 是可扩展容器，后续新增传递项扩展此对象即可，不破坏 action 签名。

### 完整数据流

```
--env  →  initEnv()  →  env 对象  →  ctx.env  →  action  →  resolveBuildConfig({ env, mode, cliOptions })
                                                              →  各 preset 的 DefinePlugin  →  焊进三进程 bundle
```

### 派发器伪代码

```js
async function runCommand(cmd, cliOptions) {
  try {
    const env = cmd.skipEnv ? undefined : initEnv(cliOptions.env);  // ① skipEnv 命令跳过 initEnv
    const mode = cmd.mode || 'production';                          // ② 命令隐含 mode
    const ctx = { cliOptions, env, mode, command: cmd.name };       // ③ 组装上下文
    await cmd.action(ctx);                                          // ④ 显式传入
  } catch (err) {
    console.error(`[base-client] ${cmd.name} 失败：${err.message}`);
    if (cliOptions.debug) console.error(err.stack);                 // 默认仅打印 message；--debug 附 stack
    process.exit(1);
  }
}
```

### 命令侧消费示例

```js
// src/cli/commands/dev.js
action: async ({ cliOptions, env, mode, command }) => {
  const { main, preload, renderer } = resolveBuildConfig({ env, mode, command, cliOptions });  // 三进程构建配置
  // 起 webpack + dev server（端口取 cliOptions.port）+ spawn electron
}
```

## 六、错误处理与退出码

错误处理收敛到 `runCommand` 一处：

1. **统一 try/catch**：所有命令异常集中捕获，命令内部不再各自退出。
2. **命令内部一律 `throw`**：前置检查失败（找不到产物、依赖缺失等）以 `throw new Error(...)` 表达，由 `runCommand` 统一处理。
3. **统一输出格式**：`[base-client] <command> 失败：<message>`。
4. **退出码**：成功 `0`，失败 `1`（不细分错误码）。
5. **堆栈打印**：默认仅打印错误消息；带 `--debug` 时附加 `err.stack`。贴近常见 CLI 习惯（vite / eslint / jest）。
6. **编译错误独立于堆栈**：webpack 编译错误（`stats.toString()`）由各命令实现完整输出，与 `err.stack` 无关，始终可见（不受 `--debug` 影响）。

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
