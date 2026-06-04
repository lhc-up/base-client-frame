# Frame M2：用户配置协议（bc.config.js）详细设计

> 所属：[Frame 总设计](./2026-05-28-frame-overview-design.md) 的 M2 模块。

## 一、定位

M2 定义 frame 与用户项目之间的**构建配置契约**：用户通过 `bc.config.js` 提供三进程的构建配置覆盖，M2 负责**定位、加载**该文件，并将其与 frame 预设（M4）**合并**，产出最终的三进程 webpack 配置交给命令实现使用。

## 二、配置形态

`bc.config.js` 统一导出一个**函数** `(ctx) => config`：

```js
module.exports = ({ command, mode, env, cliOptions }) => {
  const devMode = mode === 'development';
  return {
    main:     { /* webpack 配置覆盖 */ },
    preload:  { /* webpack 配置覆盖 */ },
    renderer: { /* webpack 配置覆盖 */ },
  };
};
```

`ctx` 字段：

| 字段 | 取值 | 含义 |
|------|------|------|
| `command` | `dev` / `build` / `preview` / `pack` | 当前执行的命令 |
| `mode` | `development` / `production` | 构建模式（命令隐含） |
| `env` | 对象 | 解析后的环境变量（来自 `.env.<name>`，M3 提供） |
| `cliOptions` | 对象 | 本次命令的 CLI 参数（与 M7 ctx 对齐） |

用户用 `command` / `mode` / `cliOptions` 在函数体内分支，得到该次构建所需的配置，无需依赖全局 `process.env`。

## 三、协议结构

顶层三个 key，对应 Electron 三进程：

```js
{
  main:     { /* 该进程的 webpack 配置覆盖：output / module / plugins / resolve … */ },
  preload:  { /* 同上 */ },
  renderer: {
    /* 同 main / preload 的 webpack 配置覆盖 */
    devServer: { /* 可选；仅 dev 命令消费，build / preview / pack 忽略（M5 §六）*/ },
  },
}
```

- 每个 key 下**直接是该进程的 webpack 配置覆盖**，无额外嵌套层。
- 只承载**构建配置**。frame 是构建工具，进程配置即构建配置；主进程的运行时行为属于业务自身的 `src/main` 代码，不在此协议内。

### renderer.devServer（扩展字段）

renderer 下除 webpack 字段外，可放一个 `devServer` 字段，承载 webpack-dev-server 的任意选项（`proxy` / `headers` / `setupMiddlewares` / `host` / `port` …）。该字段由 M5 dev 命令在构建前从 renderer 配置中摘出、**不进入 webpack compiler**；build / preview / pack 完全忽略它。host / port 三级优先级与 frame 强制项（`hot: true`）见 M5 §六。

## 四、配置定位

1. 默认在 `process.cwd()` 探测 `bc.config.{js,mjs,cjs}`。
2. 若命令带 `--config <path>`（M1 全局选项），改用指定路径。
3. **按需必需**：仅在被调用 `resolveBuildConfig` 的命令路径上必需——即 `dev` / `build` / `pack`（pack 经 `runProductionBuild` 间接依赖）。这些命令既无 `--config`、cwd 也无 `bc.config.*` 时，抛错 `未找到 bc.config.js`，由 `runCommand` 统一报告。**`preview` 命令不读 bc.config.js**（M6）：即使缺失也不报错，预防"用户从干净产物目录跑 preview"被无关错误拦住。
4. **不支持 TypeScript 配置**：frame 不引入 ts 加载机制（jiti / tsx 等），保持加载链路最简。需要类型提示的用户可用 JSDoc + `.js`：`/** @type {import('@base-client/frame').UserConfig} */`。`electron-builder.config` 同此原则（M7 §二）。

## 五、加载与合并

`resolveBuildConfig` 是 M2 对命令层暴露的主接口：

```js
function resolveBuildConfig({ env, mode, command, cliOptions }) {
  const rootDir = process.cwd();
  const raw = loadUserConfig(cliOptions.config);                   // 接入 --config；找不到则抛错
  const userConfig = raw({ command, mode, env, cliOptions });      // 统一函数形态，传入 ctx

  return {
    main:     merge(getMainPreset({ rootDir, env, mode }),     userConfig?.main || {}),
    preload:  merge(getPreloadPreset({ rootDir, env, mode }),  userConfig?.preload || {}),
    renderer: merge(getRendererPreset({ rootDir, env, mode }), userConfig?.renderer || {}),
  };
}
```

- `getXxxPreset`（M4 提供）接收 `{ rootDir, env, mode }`，返回该进程的预设 webpack 配置（含 env 注入的 `DefinePlugin` 等）。
- 用 `webpack-merge` 合并预设与用户覆盖：**数组（`plugins` / `module.rules`）追加、对象深合并**。因此用户在 `bc.config.js` 里加的 loader / plugin 是**追加**到预设之上，而非替换。

## 六、配置优先级

承接 M1 的优先级链：

```
CLI flag (cliOptions)  >  命令/env 默认  >  bc.config.js  >  预设默认
```

`bc.config.js` 通过 `webpack-merge` 覆盖预设默认；CLI flag 与命令/env 默认由命令实现在更外层决定（如 dev 的 `--port`）。

## 七、模块边界

| 方向 | 接口 | 说明 |
|------|------|------|
| M1 → M2 | `resolveBuildConfig({ env, mode, command, cliOptions })` | 命令 action 内调用，拿到三进程构建配置 |
| M2 → M4 | `getMainPreset / getPreloadPreset / getRendererPreset({ rootDir, env, mode })` | 取各进程预设 |

M2 **不负责**：预设内容（M4）、环境变量读取（M3）、命令执行（M5/M6/M7）。

## 八、配置校验

开发阶段**暂不校验**配置结构。待协议稳定后再补充字段类型与结构校验。
