# Frame 总设计（Overview）

> 状态：**现行（current）**。本文档取代早期的 `unified-architecture-design`、`framework-design`、`toolkit-design`、`service-design`、`notice-design`（均已归档至 `archived/`）。当两者描述冲突时，以本文档为准。

## 一、背景与定位

`@base-client/frame` 是面向 Electron 客户端项目的**本地开发与打包工具链**。多个业务项目（10+）共用同一套构建/打包流程，但各自的业务逻辑、UI、运行时能力各不相同。

frame 的定位是 **构建工具**（类比 Vite 之于前端项目），它解决"如何把 Electron 三进程的源码编译、调试、打包成可分发的安装包"，**不关心业务怎么写**。

### 与 toolkit 的关系

- frame 与 `@base-client/toolkit` 是**两个平行、互不依赖的包**。
- frame **永远不引用、不感知** toolkit 的存在。
- 用户可以**只装 frame**：自己编写 `src/main`、`src/preload`、`src/renderer` 入口，跑通一个最小 Electron 应用。
- 用户如需运行时增强能力（IPC 框架、窗口模板、序列化等），**自行按需引入 toolkit**，与 frame 无关。

## 二、设计目标

1. **独立可用**：仅依赖 frame 即可完成 dev / build / preview / pack 全流程。
2. **约定优于配置**：提供三进程开箱即用的 webpack 预设，用户只在 `bc.config.js` 中覆盖差异项。
3. **CLI 驱动**：用户通过 `base-client <command>` 使用全部能力。
4. **零运行时侵入**：frame 不向用户的运行时代码注入任何框架对象。

## 三、边界

### 做什么

- CLI 命令（dev / build / preview / pack）
- 三进程 webpack 预设（main / preload / renderer）
- 用户配置协议 `bc.config.js`（加载、校验、与预设合并）
- 环境变量加载约定（多环境 `.env.*`）
- electron-builder 打包入口（跨平台、签名、安装钩子）

### 不做什么

- 运行时 IPC 框架（Service / Notice）
- 窗口基类（BaseWindow）
- preload bridge（用户自己写 preload，按需引入 toolkit）
- 自动更新逻辑
- 任何具体业务能力

### 明确移除

- `Factory / MainFactory / PreloadFactory / RendererFactory` 抽象。当前 `src/config/index.js` 已是"预设函数 + `webpack-merge`"的实现，但 `src/index.js` 仍残留对 Factory 的死导出（实际为 `undefined`），需清理；`framework-design.md` 第五章"Config Factory"已随该文档归档。

## 四、模块划分

frame 拆分为 7 个模块，分三层。每个模块有独立的详细设计文档，可分别实现与验证。

| # | 模块 | 职责 | 主要文件 | 用户接触面 |
|---|------|------|----------|------------|
| **M1** | CLI 入口与命令派发 | bin 入口、用 `cac` 注册命令、参数解析、派发到各命令实现 | `bin/` + `src/cli/index.js` | 命令名 / 参数 |
| **M2** | 用户配置协议（bc.config.js） | 定位 / 加载 / 校验用户 `bc.config.js`；定义字段结构；与预设合并 | `src/config/index.js` | 配置字段 |
| **M3** | 环境变量（Env） | 按 `BC_ENV` 选择 `.env.*`；保留前缀约定；注入 `process.env`；define 到 renderer | `src/env/` | 变量约定 |
| **M4** | 三进程 webpack 预设 | `getMainPreset / getPreloadPreset / getRendererPreset`：target、externals、output、loader、devtool | `src/config/presets/` | 间接（经 merge） |
| **M5** | dev 命令 | 并行编译 main+preload、启动 webpack-dev-server（renderer）、启动 Electron、改动自动重启 | `src/cli/commands/dev.js` | 命令行为 |
| **M6** | build & preview 命令 | build：三进程并行生产构建；preview：直接启动产物 Electron | `src/cli/commands/build.js`、`preview.js` | 命令行为 |
| **M7** | pack 命令 + electron-builder | 跨平台打包（Win NSIS / Mac DMG / Linux DEB / 龙芯 loong64）、签名、安装/卸载钩子、用户自定义 builder 配置约定 | `electron-builder-config.js` + `src/cli/commands/pack.js`（新增） | 打包配置 |

### 分层

- **基础设施层**：M1（CLI 框架）
- **配置 / 约定层**：M2（用户配置）、M3（环境变量）、M4（webpack 预设）
- **命令执行层**：M5（dev）、M6（build / preview）、M7（pack）

## 五、模块依赖关系

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

## 六、实施顺序

1. **第一批（清理 + 完善，代码已大体存在）**：M1 CLI、M2 用户配置、M3 环境变量、M4 webpack 预设。重点是清理 Factory 死代码、补齐配置/环境变量约定、稳定预设。
2. **第二批（开发/构建流程稳定化）**：M5 dev、M6 build / preview。
3. **第三批（打包发布正式化）**：M7 pack。当前 `electron-builder-config.js` 存在但尚未接入 CLI。

## 七、文档结构

```
base-client-frame/docs/superpowers/specs/
├── 2026-05-28-frame-overview-design.md          # 本总设计（现行）
├── 2026-05-XX-frame-m1-cli-design.md            # M1 详细设计
├── 2026-05-XX-frame-m2-user-config-design.md    # M2 详细设计
├── 2026-05-XX-frame-m3-env-design.md            # M3 详细设计
├── 2026-05-XX-frame-m4-presets-design.md        # M4 详细设计
├── 2026-05-XX-frame-m5-dev-design.md            # M5 详细设计
├── 2026-05-XX-frame-m6-build-preview-design.md  # M6 详细设计
├── 2026-05-XX-frame-m7-pack-design.md           # M7 详细设计
└── archived/                                    # 已过时、与本方向不一致的早期设计
    ├── 2026-05-15-unified-architecture-design.md
    ├── 2026-05-15-toolkit-design.md
    ├── 2026-05-15-service-design.md
    ├── 2026-05-17-notice-design.md
    └── 2026-05-18-framework-design.md
```

> 说明：早期设计将 Service / Notice / BaseWindow / preload 等运行时能力划归 frame（单包形态）。本轮重新确认边界后，运行时能力归 toolkit，frame 收敛为纯构建工具。早期文档仅作历史参考。

## 八、不纳入本轮的范围

- **项目脚手架（`init` / `create` 命令）**：暂不做。属于独立价值的功能，后续单独评估。
- **自动更新**：不属于 frame。若需要，作为 toolkit 的可选能力或业务自实现。
