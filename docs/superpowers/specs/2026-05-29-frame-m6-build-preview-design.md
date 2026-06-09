# Frame M6：build & preview 命令（详细设计）

> 所属：[Frame 总设计](./2026-05-28-frame-overview-design.md) 的 M6 模块。

## 一、定位

M6 是命令执行层的生产侧，mode 固定 `production`（M1 隐含）：

- `build`：三进程生产构建，产物落 `app/`。
- `preview`：用已构建产物直接启动 Electron。

两者均不起 dev-server、不 watch；构建机制与 env / 预设 / 合并分别由 M3 / M4 / M2 决定，M6 只负责编排与进程启动。

## 二、build 命令

### 流程

build 命令的 action 调用共享步骤 `runProductionBuild(ctx)`（亦供 M7 pack 复用）。

### 共享步骤 runProductionBuild

```
runProductionBuild(ctx)   // ctx 来自 M1，含 { cliOptions, env, mode:MODES.PROD, command, isDev:false, isProd:true }
  ① 清空输出根目录 app/（fse.emptyDirSync）
  ② { main, preload, renderer } = resolveBuildConfig(ctx)   // M2，收 ctx 整体
  ③ 启动编译 spinner（createCompileSpinner，详见 M5 §十）
  ④ 并行三进程生产构建（Promise.all(runOne(main), runOne(preload), runOne(renderer))）
     每个 runOne 内：webpack(config, cb) → spinner.clear() → logger.compileSuccess/Failure + compileWarning
     产物：app/main/index.js、app/preload/index.js、app/renderer/（index.html + index.js + assets）
  ⑤ finally 中 spinner.stop()
```

- **签名收 ctx 整体**：`runProductionBuild(ctx)` 与 M1 §五"上下文容器"约定一致；M7 pack 也按 `runProductionBuild(ctx)` 调用，`command` 已在 ctx 中（pack 传 `'pack'`、build 传 `'build'`）。
- `command` 由 ctx 透传至用户 `bc.config.js`，使用户能据此分支配置。
- **清理方式**：`fse.emptyDirSync(appDir)`（fs-extra），目录不存在时也安全；优于 `fs.rmSync`，避免 Node 版本与递归 rm 行为差异。
- renderer 的 `index.html` 由用户在 `bc.config.js` 的 `renderer.plugins` 自注册的 `html-webpack-plugin` 产出（frame 不内置；见 M4 §三入口页面）；production 下 `devtool=false`（见 M4）。
- 三进程**并行**构建，互不依赖。
- 抽为独立函数后，build 与 pack 共用同一份"清空 + 三进程生产构建 + 编译反馈"实现，避免漂移。

### 编译反馈

复用 M5 §十 的输出契约（同一份 logger / spinner / extractStatsSummary）：

- spinner 在三个 runOne 启动前 start，每次 logger 输出前 `spinner.clear()`，全部完成后 finally 中 stop。
- 单进程成功：`logger.compileSuccess(name, ms, sizeBytes)` + `logger.compileWarning(name, count)`。
- 单进程失败：`logger.compileFailure(name)` + `stats.toString({colors:true})` 全量，reject Promise。任一失败由 M1 `runCommand` 统一报告、退出码 `1`。

### 输出清理

`build` 在构建前**整体清空 `app/`**（`fse.emptyDirSync(appDir)`），是输出目录生命周期的**唯一 owner**：

- 一次清空覆盖 `app/main`、`app/preload`、`app/renderer`，以及将来可能新增的公共目录（如 `app/public`、`app/resource`），**新增目录零成本覆盖、无需逐处补清理逻辑**。
- 不采用 webpack 各进程 `output.clean`（那只清各自 `output.path`、漏掉公共目录）；M4 预设不含 clean。
- **dev 不参与清理**：dev 仅覆盖 `app/main`、`app/preload`（固定文件名、原地覆盖），renderer 在内存不落盘，本地调试行为稳定；dev 期间产生的少量无引用残留由下次 `build` 清空时自愈。

### 失败处理

任一进程编译失败 → `runOne` 内 `logger.compileFailure(name)` + `console.error(stats.toString({colors:true}))` 后 reject；由 `Promise.all` 向外抛出，最终由 M1 `runCommand` 统一报告、退出码 `1`。

### 命令选项

无。

## 三、preview 命令

### 流程

```js
const { MODES } = require('../../mode');
// 命令模板：module.exports = { name: 'preview', mode: MODES.PROD, skipEnv: true, action }

spawn(resolveElectron(rootDir), [resolveMainEntry(rootDir)], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },   // 不注入 RENDERER_DEV_URL
});
electron.on('close', (code) => process.exit(code));
```

- 不注入 `RENDERER_DEV_URL` → `NODE_ENV` 为 `production`，用户 main 走 `loadFile(app/renderer/index.html)`（生产产物）。
- `resolveElectron` / `resolveMainEntry` 复用 M5 的共享工具（见第五节）。
- 命令模板 mode 字段写 `MODES.PROD`（mode 抽象详见 M1 §九），与 build 共用同一份字面量来源。

### 契约

**preview 在 `build` 之后运行。** 未构建时 `resolveMainEntry` 校验失败抛错（即"请先 build"）。

**preview 不读 `bc.config.js`**：preview 只 spawn Electron + 加载产物，与构建配置无关，不调 `resolveBuildConfig`。即便项目里没有 `bc.config.js`（如发布场景仅交付 `app/` 与 `package.json`），preview 也能跑（呼应 M2 §四"按需必需"）。

**preview 命令模板声明 `skipEnv: true`**：preview 既不调 `resolveBuildConfig`、也不需要 env 注入，M1 派发器据此跳过 `initEnv`，`.env.<name>` 缺失不会拦住 preview（呼应 M1 §四 "skipEnv" 字段）。

文档须点明一个使用顺序的坑（不做产物模式 / 新鲜度检测，YAGNI）：`dev` 跑完后 `app/main` 是 development 产物（`NODE_ENV` 焊成 `development`），此时直接 `preview` 会因判别成立去读未注入的 `RENDERER_DEV_URL` 而白屏。正确路径是 `build → preview`——`build` 以 production 覆盖产物。

### SIGINT 与退出

- Electron `close` → 以其退出码退出 preview 进程。
- `stdio: 'inherit'` 下 Ctrl+C（SIGINT）随进程组传给 Electron，Electron 退出后触发 `close` 收尾，故 preview **不引入 `killElectron`**，保持最薄。

### 命令选项

无。

## 四、产物目录约定

`app/` 是**纯构建产物目录**（生成物、不手写）。将来公共资源（public / resource 等）的**源**放在 `app/` 之外（如项目根的 `public/` 或 `src/` 下），由 `build` 拷贝 / 产出到 `app/`。这样"构建前清空 `app/`"清掉的全是上次生成物，源始终在别处、不会被误删。

## 五、共享工具

复用 M5 在 `src/cli/utils/electron.js` 建立的工具：

| 工具 | build | preview |
|------|-------|---------|
| `resolveElectron(rootDir)` | ✗ | ✓ |
| `resolveMainEntry(rootDir)` | ✗ | ✓ |
| `killElectron(child)` | ✗ | ✗（M5 watch 重启 / SIGINT 专用） |

## 六、模块边界

| 方向 | 接口 | 说明 |
|------|------|------|
| M1 → M6 | `action(ctx)`，`ctx = { cliOptions, env, mode, command, isDev, isProd }` | 命令派发入口 |
| M6 → M2 | `resolveBuildConfig(ctx)` | 取三进程构建配置（仅 build；收 ctx 整体） |
| M6 → logger | `compileSuccess` / `compileFailure` / `compileWarning` | 编译反馈（复用 M5 §十契约） |

M6 **不负责**：构建配置合并（M2）、预设内容（M4）、env 读取（M3）、安装包构建（M7）。

## 七、文件结构

```
src/cli/commands/build.js          # build：调用 runProductionBuild
src/cli/commands/preview.js        # preview：resolveElectron + resolveMainEntry + spawn（production）
src/cli/utils/production-build.js  # runProductionBuild：清空 app/ + 三进程并行生产构建（build / pack 共用）
```
