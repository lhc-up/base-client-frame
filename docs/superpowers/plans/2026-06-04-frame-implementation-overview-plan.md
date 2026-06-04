# Frame 实施总览（Master Plan）

> 本文档是 frame 项目的**实施主索引**。各模块的详细 plan 位于本目录的同级文件：`2026-06-04-frame-mX-<topic>-plan.md`。每份子 plan 自包含、可独立验证，按本文档给出的顺序逐个推进。

**Goal:** 把 `docs/superpowers/specs/` 下的 8 份 frame 设计文档转化为可执行、按模块独立交付的实施计划。

**Architecture:** 严格按 spec 的三层划分（基础设施 / 配置约定 / 命令执行）逐模块实现；每模块产出可独立验证的代码与测试；模块间通过 spec 中固定的接口契约对接。

**Tech Stack:**
- **语言**：Node.js 20+ / CommonJS（与 `package.json` `type: commonjs` 一致）
- **构建**：Rollup（既有 `rollup.config.mjs`，frame 源码出 `dist/cli.js`）
- **测试**：Jest 30（新增到 devDependencies）
- **关键运行时依赖**：cac（CLI 解析）、dotenv（env 解析）、webpack 5、webpack-dev-server 5、webpack-merge 6、html-webpack-plugin（M4 内置）、lodash（已声明）
- **按需依赖（用户项目自带）**：electron、electron-builder（frame 解析时从用户 `node_modules` 找）

---

## 一、实施顺序

依据 overview §七，由下而上、从依赖到使用方：

```
Phase 1 ─ 配置约定层（无外部依赖，最易独立验证）
  M3 env       →  initEnv 纯函数
  M4 presets   →  三进程 webpack 预设
  M2 config    →  loadUserConfig + resolveBuildConfig

Phase 2 ─ 基础设施层
  M1 cli       →  cac 注册 + runCommand 派发器

Phase 3 ─ 命令执行层
  M5 dev       →  dev-server + spawn Electron + watch
  M6 build/preview →  runProductionBuild + preview spawn
  M7 pack      →  customMerge + getPackPreset + electron-builder
```

理由：
- **M3 / M4 完全无外部依赖**，先做能尽早建立测试体系。
- **M2 依赖 M4**（取 preset）和 M3 的 env 对象形状；做完 M2 后"输入 env+mode+command → 输出三进程配置"的链路打通。
- **M1 独立可跑空载**（命令清单为空），先建好框架；M5/M6/M7 各自往里挂命令。
- **M5/M6/M7 各自独立**：三者并行无依赖，但 M6 的 `runProductionBuild` 被 M7 复用，先做 M6 再做 M7。

## 二、文件结构（最终态）

```
base-client-frame/
├── bin/
│   └── base-client.js                # 发布入口（require dist/cli.js）
├── src/
│   ├── cli/
│   │   ├── index.js                  # M1：cli 注册 + runCommand
│   │   ├── commands/
│   │   │   ├── dev.js                # M5
│   │   │   ├── build.js              # M6
│   │   │   ├── preview.js            # M6
│   │   │   └── pack.js               # M7
│   │   └── utils/
│   │       ├── electron.js           # M5/M6 共享：resolveElectron / resolveMainEntry / killElectron
│   │       ├── electron-builder.js   # M7：resolveElectronBuilder + buildTargets
│   │       └── production-build.js   # M6/M7 共享：runProductionBuild
│   ├── config/
│   │   ├── index.js                  # M2：resolveBuildConfig + loadUserConfig
│   │   ├── pack.js                   # M7：resolvePackConfig + customMerge + replace
│   │   └── presets/
│   │       ├── index.js              # M4：三 getter + defineEnvPlugin
│   │       ├── main.js               # M4
│   │       ├── preload.js            # M4
│   │       ├── renderer.js           # M4
│   │       └── pack.js               # M7：getPackPreset
│   └── env/
│       └── index.js                  # M3：initEnv + readEnvFile
├── tests/
│   ├── unit/
│   │   ├── env.test.js               # M3
│   │   ├── presets-main.test.js      # M4
│   │   ├── presets-preload.test.js
│   │   ├── presets-renderer.test.js
│   │   ├── presets-define-env.test.js
│   │   ├── config-resolve.test.js    # M2
│   │   ├── config-pack-merge.test.js # M7
│   │   ├── config-pack-resolve.test.js
│   │   ├── cli-runCommand.test.js    # M1
│   │   ├── utils-electron.test.js    # M5
│   │   ├── utils-buildTargets.test.js # M7
│   │   └── runProductionBuild.test.js # M6
│   ├── integration/
│   │   ├── dev-command.test.js       # M5
│   │   ├── build-preview.test.js     # M6
│   │   └── pack-command.test.js      # M7
│   └── fixtures/
│       └── sample-project/           # 各 plan 按需新增子目录
├── rollup.config.mjs                 # 既有；本 plan 不动
└── package.json                      # 按各 plan 增添依赖
```

## 三、技术约定（所有 plan 共用）

### 1. 测试栈

- **运行器**：Jest 30
- **配置**：`jest.config.js`，根目录；`testMatch: ['<rootDir>/tests/**/*.test.js']`
- **隔离**：单测用真实 `os.tmpdir()` 建临时目录（不上 mock-fs，避免与原生 fs 行为漂移）
- **覆盖率**：暂不强制阈值；后续可在 CI 加 `--coverage`

### 2. 提交策略

- **每个 step 完结即可考虑提交**：red 测试一次、green 实现一次、refactor 一次，提交 3 次
- 实际可按 TDD 周期合并为 1-2 个 commit（"红 + 绿"合并、refactor 单独）
- **每个 Task 至少 1 个 commit**
- 风格：`feat: ...` / `fix: ...` / `test: ...` / `chore: ...`，主语项目当前用中文 message，沿用

### 3. 包依赖管理

frame 源码用 `require`，依赖分两类：
- **dependencies**：frame 直接 require 的运行时包（cac、dotenv、webpack-merge、html-webpack-plugin、lodash）
- **peerDependencies**：用户项目自带的（webpack、webpack-dev-server、electron、electron-builder）

> 当前 `package.json` 里 `dotenv` 误为 peer——M3 plan 会把它迁到 dependencies。`html-webpack-plugin` 当前未声明——M4 plan 会加为 dependency。

### 4. 模块边界纪律

各 plan 严禁跨界引用：
- M3 不知道 webpack
- M4 不知道 .env 文件名（只知道 env 对象形状）
- M2 不知道 dev-server / electron
- M5/M6/M7 不直接读 .env（一律经 ctx.env）

每个 plan 的 Self-Review 必查"模块边界"。

### 5. ESM / CJS

frame 源码全部 CJS（`require` / `module.exports`）。配置文件（`bc.config.js`、`electron-builder.config.js`）也要求 CJS（spec 已限定 `{js,mjs,cjs}` 且不引入 ts 加载，frame 用 `require()` 直接加载——`.mjs` 暂只在文档约定中提及，加载机制留待 M2 plan 决策细节）。

## 四、各模块 Plan 索引

| Plan 文件 | 模块 | 关键产出 | 测试焦点 |
|-----------|------|----------|----------|
| `2026-06-04-frame-m3-env-plan.md` | M3 env | `src/env/index.js` 的 `initEnv` / `readEnvFile` | `.env` 合并；`.env.<name>` 缺失抛错；不写 `process.env` |
| `2026-06-04-frame-m4-presets-plan.md` | M4 presets | `src/config/presets/{main,preload,renderer,index}.js` + `defineEnvPlugin` | 三进程 target/output 正确；只注入 `BC_` 前缀；逐键定义 |
| `2026-06-04-frame-m2-user-config-plan.md` | M2 user-config | `src/config/index.js` 的 `loadUserConfig` / `resolveBuildConfig` | 定位探测；ctx 透传；webpack-merge 追加语义；按需必需 |
| `2026-06-04-frame-m1-cli-plan.md` | M1 cli | `src/cli/index.js`、`bin/base-client.js`、命令模板规范 | cac 解析；runCommand 派发；skipEnv 跳过；--debug 行为 |
| `2026-06-04-frame-m5-dev-plan.md` | M5 dev | `src/cli/commands/dev.js`、`src/cli/utils/electron.js` | spawn Electron；dev-server hot；watch 重启；killElectron 进程树 |
| `2026-06-04-frame-m6-build-preview-plan.md` | M6 build/preview | `src/cli/commands/{build,preview}.js`、`src/cli/utils/production-build.js` | runProductionBuild 清空 + 三进程并行；preview 不读 bc.config |
| `2026-06-04-frame-m7-pack-plan.md` | M7 pack | `src/cli/commands/pack.js`、`src/config/{pack.js,presets/pack.js}`、`src/cli/utils/electron-builder.js` | customMerge 深合并 + replace；buildTargets；preset 跨架构分支 |

## 五、跨模块验收里程碑

不强制；用于检视进度：

| 里程碑 | 满足条件 |
|--------|----------|
| **M0 工程基线** | Jest 跑通空测试、Rollup 能 build 出空 dist/cli.js |
| **M1 配置链路打通** | M3+M4+M2 单测全绿；手写一段脚本 `node -e "console.log(require('./src/config').resolveBuildConfig({...}))"` 可输出三进程配置 |
| **M2 CLI 空载** | M1 完成；`node bin/base-client.js --help` 列出所有命令；`--debug` 行为正确 |
| **M3 dev 可用** | M5 完成；示例项目 `base-client dev` 能起 Electron + HMR |
| **M4 生产 + 预览** | M6 完成；`base-client build && base-client preview` 跑通 |
| **M5 出包** | M7 完成；`base-client pack --platform win --arch x64` 在 `dist/` 出安装包 |

## 六、跨模块的工程基线（M0）

第一份 module plan（M3）启动前，需先建立测试与构建基线。这部分放在 M3 plan 的 **Task 0** 里完成（包含 Jest 配置、依赖安装、首条空测试跑通），M3 后续 task 才进入业务逻辑。其余模块 plan 假定 M0 已完成、直接进入业务。

---

## 七、Self-Review

按 writing-plans skill 要求做主索引层级的自检：

- **Spec 覆盖**：本 master plan 不实现具体功能，只做编排。各模块 plan 各自做 spec → task 的逐项映射，每份 plan 内部做自检。
- **Placeholder**：本文档无 TBD / TODO。各模块 plan 在写作时自查。
- **类型一致性**：各 plan 间约定的接口签名（如 `initEnv(envName) → env`、`getMainPreset({ rootDir, env, mode }) → webpackConfig`）以 spec 为准，本 master 已列在各 plan 的"关键产出"列。
