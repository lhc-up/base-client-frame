# Frame M5：dev 命令（详细设计）

> 所属：[Frame 总设计](./2026-05-28-frame-overview-design.md) 的 M5 模块。

## 一、定位

M5 实现 `base-client dev`：把配置约定层产出的三进程构建配置（M2 合并 M3 的 env 与 M4 的预设）编排成一套本地开发环境——renderer 经 webpack-dev-server 提供页面与热更新（HMR），main / preload 编译后启动 Electron 加载页面。mode 固定 `development`（M1 隐含）。

M5 只负责**编排与进程管理**：构建配置如何合并由 M2 决定、预设内容由 M4 决定、env 读取由 M3 决定。

## 二、命令行为与选项

| 选项 | 默认 | 作用 |
|------|------|------|
| `--port <n>` | `8023`（兜底） | renderer dev-server 端口；优先级 `--port` > `bc.config` 的 `renderer.devServer.port` > 8023 |
| `--host <host>` | `localhost`（兜底） | renderer dev-server host；优先级同 `--port` |
| `--watch-main` | 关 | 开启后 watch main + preload，改动自动重启 Electron；默认关，main / preload 只构建一次 |

renderer 始终由 dev-server 监听、热更新，不受 `--watch-main` 影响；该开关只决定 **main / preload 是否进入 watch + 自动重启**。

## 三、启动流程（默认模式，`--watch-main` 关）

```
ctx = { cliOptions, env, mode:'development', command:'dev' }   // 来自 M1
{ main, preload, renderer } = resolveBuildConfig(ctx)          // M2

并行：
  ① 一次性构建 main + preload（webpack(config, cb)），产物落 app/main、app/preload
  ② 启动 renderer dev-server（内存生成入口页面 + HMR）
待 ① ② 均就绪：
  ③ 解析 electron 可执行文件 + 解析主进程入口（见第七节）
  ④ spawn Electron，注入 env：NODE_ENV=development、RENDERER_DEV_URL=http://<host>:<port>
```

- main + preload **并行**一次性构建；任一编译失败 → `throw`，由 M1 `runCommand` 统一报告并以退出码 `1` 退出。
- dev-server 与 main / preload 构建并行启动，**两者都就绪后**才 spawn Electron——Electron 既需 main 产物在磁盘、又需 dev URL 可达。
- 默认模式下 main / preload 不监听；改动它们需重跑 `base-client dev`。renderer 的改动始终由 dev-server 持续处理。

## 四、可选自动重启（`--watch-main` 开）

main + preload 改用 webpack **watch 模式**（`compiler.watch(...)`）持续编译，由每次编译结果驱动 Electron：

| 编译结果 | 动作 |
|---|---|
| 成功 | `killElectron(当前进程)` → 重新 spawn（加载新代码） |
| 失败 | 打印 `stats.toString()` 错误到控制台；**不动 Electron**——保留正在运行的上一版本、不重启。破坏的构建即便重启也起不来，控制台报错即第一时间的反馈 |

watch 模式下，**首次 Electron 启动由首次成功编译触发**，与后续重启走同一条路径（dev-server 仍独立先行启动）。若首次编译即失败，则只打印错误、暂不启动 Electron，待编译成功后再启动。

进程管理要点（保证重启干净、不残留）：

- **同一时刻只持有一个 Electron 子进程句柄**；重启时**先等旧进程 `exit`，再 spawn 新进程**，避免双实例 / 单例锁冲突——这是"下次起不来"的根因。
- main、preload 短时间内接连重编译 → **debounce** 合并为一次重启，避免连环重启。
- `killElectron` **跨平台**终止整棵进程树（否则 Electron 的 GPU / helper 子进程会成孤儿累积、污染环境）：
  - win32：`taskkill /pid <pid> /T /F`（`execSync` 传 `{ stdio: 'ignore' }`：进程可能在 SIGINT 透传后已自行退出，`taskkill` 会向 stderr 打印 `ERROR: The process "<pid>" not found.`，外层 try/catch 只能吞抛错、吞不了已经写出的 stderr，故 stdio 静默）
  - 其余平台：`child.kill('SIGTERM')`（spawn 时建独立进程组，必要时终止进程组）
- `intentionalKill` 标志：frame 主动 kill（重启）时置位，使 `electron.on('close')` 跳过整体收尾；仅用户自行退出 app 才触发收尾退出（见第八节）。

renderer 不受此开关影响：始终走 dev-server HMR，改 renderer 不重启 Electron、页面状态可保留。

## 五、渲染进程加载与 dev / prod 判别

frame 在渲染入口上只产出**自己独有的构建信息**，运行时如何加载由用户自行编写的 main 决定：

- **dev**：spawn Electron 时注入 `RENDERER_DEV_URL=http://<host>:<port>`（dev-server 地址只有 frame 知道，host / port 见第六节解析）。
- **生产构建**：入口页面产物的**约定位置**仍是 `app/renderer/index.html`——由用户在 `bc.config.js` 自注册的 `html-webpack-plugin` 决定（默认 `filename` 即 `index.html`，常规写法落到该位置；frame 不强制）。

判别开关用 `process.env.NODE_ENV`（由构建 mode 焊入：dev 为 `development`，build / preview 为 `production`，三态可分），值由 `RENDERER_DEV_URL` 提供。用户 main 的约定写法（frame 不注入任何运行时对象，用户自行读取）：

```js
if (process.env.NODE_ENV === 'development') {
  win.loadURL(process.env.RENDERER_DEV_URL);
} else {
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}
```

运行时在 dev / 生产产物 / 其他来源之间如何选择入口，属于用户运行时代码的职责，**不在 frame 范围内**：frame 不提供入口选择机制，只提供上述两项构建信息。

## 六、dev-server 配置与开放项

dev-server 选项由 M5 构造并持有（不进 M4 预设）。用户可经 `bc.config.js` 的 `renderer.devServer` 提供覆盖：

```js
const { devServer: userDevServer = {}, ...rendererWebpack } = renderer;  // 从 renderer 配置摘出 devServer

// host / port 三级优先级：CLI flag > 用户配置 > 默认值
const host = cliOptions.host ?? userDevServer.host ?? 'localhost';
const port = cliOptions.port ?? userDevServer.port ?? 8023;

const devServerOptions = {
  historyApiFallback: true,
  ...userDevServer,        // 用户：proxy / headers / setupMiddlewares / client 等任意 devServer 选项
  host,                    // 优先级：--host > renderer.devServer.host > localhost
  port,                    // 优先级：--port > renderer.devServer.port > 8023
  hot: true,               // frame 保留：HMR 为 dev 的核心约定
};
const server = new WebpackDevServer(devServerOptions, webpack(rendererWebpack));
```

- **用户可配**：proxy、headers、setupMiddlewares 等一切 devServer 选项，含 `host` / `port`。
- **`host` / `port` 三级优先级**：CLI `--host` / `--port` > `renderer.devServer` 中的对应值 > 默认（`localhost` / `8023`）。因此 CLI 未显式传入时，用户在 `bc.config.js` 配的 host / port 才能生效——故 `--host` / `--port` 在 CLI 层不预置默认值，由本命令兜底（见 M1）。
- **frame 仅强制 `hot: true`**：HMR 为 dev 的核心约定，置于 `...userDevServer` 之后不可被覆盖；`historyApiFallback` 仅为默认值（位于 spread 之前），用户可覆盖。
- `devServer` 仅由 webpack-dev-server 消费，故在传给 `webpack()` 前从 renderer 配置中摘出，不混入 compiler。
- 注入的 `RENDERER_DEV_URL` 使用解析后的 `host` / `port`：`http://${host}:${port}`。
- HMR 能否保留状态取决于用户为 renderer 追加的框架 loader；frame 的职责至"开启 `hot`"为止。

## 七、Electron 与主进程入口解析

### Electron 可执行文件

electron 安装在用户项目中，frame 从用户项目解析其可执行文件路径：

```js
function resolveElectron(rootDir) {
  const entry = require.resolve('electron', { paths: [rootDir] }); // 锚定用户项目
  return require(entry);                                            // electron 包入口导出可执行文件绝对路径
}
```

- 解析锚定 `process.cwd()`，用的是**用户项目声明的 electron 版本**（版本随项目走，frame 不锁定、不声明 electron 依赖）。
- 解析失败 → `throw`，提示在项目中安装 electron，由 M1 统一报告。
- `resolveElectron` 为 M5 / M6（preview）/ M7（pack）共用。

### 主进程入口

入口路径不写死，解析逻辑**提取为独立方法 `resolveMainEntry(rootDir)`**（与 `resolveElectron` 同处共享工具），使后续若调整策略（如改为优先取环境变量）只改这一处：

```js
function resolveMainEntry(rootDir) {
  // 当前策略：以 package.json 的 main 为准（Electron 应用入口的既有约定，打包与运行共用同一真相源）
  const pkg = require(path.resolve(rootDir, 'package.json'));
  const entry = path.resolve(rootDir, pkg.main);   // 约定指向构建产物，如 app/main/index.js
  if (!fs.existsSync(entry)) {
    throw new Error(`主进程入口不存在：${entry}（请先构建，或检查 package.json 的 main 字段）`);
  }
  return entry;
}
```

spawn：

```js
spawn(resolveElectron(rootDir), [resolveMainEntry(rootDir)], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development', RENDERER_DEV_URL: `http://${host}:${port}` },
});
```

## 八、生命周期、退出与错误

- **Electron 非预期 close**（用户退出 app）→ 关闭 dev-server、停止 watcher，以 Electron 退出码退出 dev 进程。
- **重启导致的 kill**（`intentionalKill` 置位）→ 不触发上述收尾，仅 kill + respawn。编译失败不 kill Electron（见第四节），仅控制台打印。
- **SIGINT（Ctrl+C）** → 终止 Electron、关闭 dev-server、退出。
- **致命错误**（初始构建失败、dev-server 启动失败、electron / 入口解析失败）一律 `throw`，交 M1 `runCommand` 统一处理。
- **webpack 编译错误**用 `stats.toString()` 完整打印，独立于堆栈、始终可见（呼应 M1）。

## 九、模块边界

| 方向 | 接口 | 说明 |
|------|------|------|
| M1 → M5 | `action(ctx)`，`ctx = { cliOptions, env, mode, command }` | 命令派发入口 |
| M5 → M2 | `resolveBuildConfig({ env, mode, command, cliOptions })` | 取三进程构建配置 |

M5 **不负责**：构建配置合并（M2）、预设内容（M4）、env 读取（M3）。

frame 在渲染入口上**只提供构建信息**：dev 的 `RENDERER_DEV_URL`；生产入口的约定位置 `app/renderer/index.html`（由用户自注册的 `html-webpack-plugin` 决定，frame 不内置该插件）。运行时入口选择由用户运行时代码负责。

## 十、文件结构

```
src/cli/commands/dev.js     # dev 命令：流程编排、watch 重启、dev-server、spawn Electron
src/cli/utils/electron.js   # resolveElectron(rootDir) + resolveMainEntry(rootDir) + killElectron(child)，M5/M6/M7 共用
```
