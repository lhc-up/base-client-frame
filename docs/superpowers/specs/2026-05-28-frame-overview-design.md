# Frame 总设计（Overview）

## 一、定位

`@base-client/frame` 是面向 Electron 客户端项目的**本地开发与打包工具链**，为 Electron 三进程（main / preload / renderer）提供开发调试、生产构建、安装包打包能力。

类比前端领域的 Vite：frame 负责"把源码编译、调试、打成可分发的安装包"，本身**不包含任何运行时或业务代码**。用户自行编写 `src/main`、`src/preload`、`src/renderer` 三进程入口，frame 只负责将它们构建、运行、打包。

## 二、设计目标

1. **独立可用**：仅依赖 frame 即可完成 dev / build / preview / pack 全流程。
2. **约定优于配置**：提供三进程开箱即用的 webpack 预设，用户只在 `bc.config.js` 中覆盖差异项。
3. **CLI 驱动**：用户通过 `base-client <command>` 使用全部能力。
4. **零运行时侵入**：frame 不向用户的运行时代码注入任何对象，三进程入口完全由用户掌控。

## 三、核心能力

- **CLI 命令**：dev / build / preview / pack
- **三进程 webpack 预设**：main / preload / renderer 的默认构建配置
- **用户配置协议 `bc.config.js`**：加载、校验，并与预设合并
- **环境变量加载**：多环境 `.env.*` 约定；读取后由 webpack 在构建时注入到 main / preload / renderer 三个进程，各进程代码中使用的是注入后的变量
- **完整 pack 能力**：跨平台安装包构建（Win / macOS / Linux，含龙芯 loong64）、代码签名、安装/卸载钩子等打包相关能力

## 四、用户项目约定

frame 与用户项目之间的目录与文件约定。命令默认按这些路径运行；如需偏离，**在 `bc.config.js` / `electron-builder.config.js` 显式覆盖对应字段**。

| 项 | 约定 | 涉及命令 | 偏离方式 |
|----|------|----------|----------|
| 三进程源码入口 | `src/main/index.js`、`src/preload/index.js`、`src/renderer/index.js` | dev / build / pack | 在 `bc.config.js` 各进程下覆盖 `entry`（M4） |
| renderer HTML 模板 | `src/renderer/index.html`（html-webpack-plugin 模板，用户不写 `<script>`） | dev / build / pack | 在 `bc.config.js` renderer 下覆盖 html-webpack-plugin（M4） |
| 构建产物目录 | `app/`（纯生成物，不要手写；`build` 整体清空） | build / dev / preview / pack | 否（强约定） |
| `package.json.main` | 必须指向 main 进程的构建产物（按预设默认 = `"app/main/index.js"`） | dev / preview 启动 Electron / pack 间接 | 偏离时需同步改 M4 main 预设的 `output.path` |
| 环境变量文件 | `.env`（可选，共享）+ `.env.<name>`（由 `--env` 指定，必需） | 全部 | 位置固定在项目根（M3） |
| `bc.config.{js,mjs,cjs}` | cwd 探测；调用 `resolveBuildConfig` 的命令必需 | dev / build / pack | `--config <path>` 改路径（M1） |
| `electron-builder.config.{js,mjs,cjs}` | cwd 探测；仅 pack 必需 | pack | `--pack-config <path>` 改路径（M7） |
| 项目依赖 | `electron`（dev / preview / pack 解析）、`electron-builder`（仅 pack 解析） | 各自命令 | frame 都不声明，由用户项目自带 |

要点：

- **`package.json.main` 是 dev / preview / pack 的共享真相源**：dev / preview 经它派发 Electron 入口（M5/M6 `resolveMainEntry`）；pack 通过 electron-builder 的 `extraMetadata.main` 在安装包内将其覆盖为 `main/index.js`（M7 §三）。
- **`app/` 由 build 命令独占清理**（M6）：dev 只覆盖 `app/main`、`app/preload`，不清空；preview 直接读现成产物。
- **`preview` 不读 `bc.config.js`**：它只 spawn Electron + 加载产物，与构建配置无关。

## 五、模块划分

frame 拆分为 7 个模块，分三层。每个模块有独立的详细设计文档，可分别实现与验证。

| # | 模块 | 职责 | 主要文件 | 用户接触面 |
|---|------|------|----------|------------|
| **M1** | CLI 入口与命令派发 | bin 入口、用 `cac` 注册命令、参数解析、派发到各命令实现 | `bin/` + `src/cli/index.js` | 命令名 / 参数 |
| **M2** | 用户配置协议（bc.config.js） | 定位 / 加载 / 校验用户 `bc.config.js`；定义字段结构；与预设合并 | `src/config/index.js` | 配置字段 |
| **M3** | 环境变量（Env） | 按 `--env` 指定的名称加载 `.env.<name>`（名称由项目自行约定）；读取解析后由 webpack 在构建时注入到三个进程，运行时代码使用注入后的变量 | `src/env/` | 变量约定 |
| **M4** | 三进程 webpack 预设 | `getMainPreset / getPreloadPreset / getRendererPreset`：target / externals / output / resolve / devtool、静态资源（Asset Modules）、env 注入（DefinePlugin） | `src/config/presets/` | 间接（经 merge） |
| **M5** | dev 命令 | 构建 main+preload、启动 webpack-dev-server（renderer，HMR）、启动 Electron；main/preload 可选自动重启（`--watch-main`） | `src/cli/commands/dev.js` | 命令行为 |
| **M6** | build & preview 命令 | build：三进程并行生产构建；preview：直接启动产物 Electron | `src/cli/commands/build.js`、`preview.js` | 命令行为 |
| **M7** | pack（安装包构建与签名） | 跨平台安装包构建、代码签名、用户自定义打包配置 | `src/cli/commands/pack.js`、`src/cli/utils/electron-builder.js`、`src/config/pack.js`、`src/config/presets/pack.js` | CLI 选项 + 打包配置 |

> 命令之间共享的工具（`resolveElectron` / `resolveMainEntry` / `killElectron` 见 M5、`runProductionBuild` 见 M6）未在上表"主要文件"列展开，详见各模块详设。

### 分层

- **基础设施层**：M1（CLI 框架）
- **配置 / 约定层**：M2（用户配置）、M3（环境变量）、M4（webpack 预设）
- **命令执行层**：M5（dev）、M6（build / preview）、M7（pack）

## 六、模块依赖关系

```
M3 Env ────────┐
M2 UserConfig ─┤
M4 Presets ────┤
               ├─→ M5 dev
               ├─→ M6 build / preview
               └─→ M7 pack
M1 CLI ──→ 派发到 M5 / M6 / M7
```

- M1 是命令入口，依赖各命令实现（M5 / M6 / M7）。
- M5 / M6 / M7 在执行时依赖配置约定层（M2 / M3 / M4）。
- M2 负责把 M4 的预设与用户配置合并，是预设与命令之间的桥梁。

## 七、实施顺序

1. **配置约定层**：M2 用户配置、M3 环境变量、M4 webpack 预设。
2. **命令执行层**：M1 CLI、M5 dev、M6 build / preview。
3. **打包发布**：M7 pack。

## 八、文档结构

```
base-client-frame/docs/superpowers/specs/
├── 2026-05-28-frame-overview-design.md          # 本总设计
├── 2026-05-28-frame-m1-cli-design.md            # M1 详细设计
├── 2026-05-28-frame-m2-user-config-design.md    # M2 详细设计
├── 2026-05-28-frame-m3-env-design.md            # M3 详细设计
├── 2026-05-28-frame-m4-presets-design.md        # M4 详细设计
├── 2026-05-29-frame-m5-dev-design.md            # M5 详细设计
├── 2026-05-29-frame-m6-build-preview-design.md  # M6 详细设计
└── 2026-06-03-frame-m7-pack-design.md           # M7 详细设计
```

> 本总设计是活文档。后续各模块详细设计若需调整模块边界或职责，应反过来更正本文档，保持一致。

## 九、后续方向

- **项目脚手架（`init` / `create` 命令）**：让用户能一键生成新项目骨架。本轮不实现，作为后续模块评估。
