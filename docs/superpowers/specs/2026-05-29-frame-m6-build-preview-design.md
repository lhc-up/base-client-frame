# Frame M6：build & preview 命令（详细设计）

> 所属：[Frame 总设计](./2026-05-28-frame-overview-design.md) 的 M6 模块。

## 一、定位

M6 是命令执行层的生产侧，mode 固定 `production`（M1 隐含）：

- `build`：三进程生产构建，产物落 `app/`。
- `preview`：用已构建产物直接启动 Electron。

两者均不起 dev-server、不 watch；构建机制与 env / 预设 / 合并分别由 M3 / M4 / M2 决定，M6 只负责编排与进程启动。

## 二、build 命令

### 流程

```
① 清空输出根目录 app/
② { main, preload, renderer } = resolveBuildConfig({ env, mode:'production', command:'build', cliOptions })   // M2
③ 并行三进程生产构建（Promise.all(webpack(main), webpack(preload), webpack(renderer))）
   产物：app/main/index.js、app/preload/index.js、app/renderer/（index.html + index.js + assets）
```

- renderer 经 `html-webpack-plugin` 以 `src/renderer/index.html` 为模板产出 `index.html` 并注入 `index.js`（见 M4）；production 下 `devtool=false`（见 M4）。
- 三进程**并行**构建，互不依赖。

### 输出清理

`build` 在构建前**整体清空 `app/`**，是输出目录生命周期的**唯一 owner**：

- 一次清空覆盖 `app/main`、`app/preload`、`app/renderer`，以及将来可能新增的公共目录（如 `app/public`、`app/resource`），**新增目录零成本覆盖、无需逐处补清理逻辑**。
- 不采用 webpack 各进程 `output.clean`（那只清各自 `output.path`、漏掉公共目录）；M4 预设不含 clean。
- **dev 不参与清理**：dev 仅覆盖 `app/main`、`app/preload`（固定文件名、原地覆盖），renderer 在内存不落盘，本地调试行为稳定；dev 期间产生的少量无引用残留由下次 `build` 清空时自愈。

### 失败处理

任一进程编译失败 → `throw`，并完整打印 `stats.toString()`，由 M1 `runCommand` 统一报告、退出码 `1`。

### 命令选项

无。

## 三、preview 命令

### 流程

```js
spawn(resolveElectron(rootDir), [resolveMainEntry(rootDir)], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },   // 不注入 RENDERER_DEV_URL
});
electron.on('close', (code) => process.exit(code));
```

- 不注入 `RENDERER_DEV_URL` → `NODE_ENV` 为 `production`，用户 main 走 `loadFile(app/renderer/index.html)`（生产产物）。
- `resolveElectron` / `resolveMainEntry` 复用 M5 的共享工具（见第五节）。

### 契约

**preview 在 `build` 之后运行。** 未构建时 `resolveMainEntry` 校验失败抛错（即"请先 build"）。

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
| M1 → M6 | `action(ctx)`，`ctx = { cliOptions, env, mode, command }` | 命令派发入口 |
| M6 → M2 | `resolveBuildConfig({ env, mode, command, cliOptions })` | 取三进程构建配置（仅 build） |

M6 **不负责**：构建配置合并（M2）、预设内容（M4）、env 读取（M3）、安装包构建（M7）。

## 七、文件结构

```
src/cli/commands/build.js     # build：清空 app/ → 并行三进程生产构建
src/cli/commands/preview.js   # preview：resolveElectron + resolveMainEntry + spawn（production）
```
