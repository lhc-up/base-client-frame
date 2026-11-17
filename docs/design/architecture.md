# Frame 架构设计

`@base-client/frame` 是 Electron 客户端项目的**构建期框架**：以 CLI 命令为入口，把环境加载、配置装配、webpack 编译、加密、字节码、更新包与 electron-builder 打包收敛为确定性流水线。frame 不参与应用运行时。

## 1. 职责边界

- **frame**：构建期。`dev:web` / `build` / `dev:app` / `pack` / `installer` 五个命令，webpack 预设装配，产物加密与打包编排。「宿主 + 包」模型的产物契约见 `docs/pkg-contract.md`。
- **不属于 frame**：业务 manifest、业务接口协议、运行时通信（Service/Notice 属 toolkit）、窗口与 UI。
- frame 不依赖 toolkit；产物格式通过 `docs/` 下三份契约文档对齐。消费方不得 `require` frame 内部源码，包边界由 `exports` 强制。

## 2. 分层

```text
bin/base-client.js            薄壳：createCli().parse()
  └─ src/cli                  cac 命令注册与 runCommand 编排
      ├─ src/core             env / ctx / mode / target / logger / build-info / resolve-module
      ├─ src/config           bc-config / builder-config / presets / merge / build-config-list
      ├─ src/webpack-runner   run-build / run-dev-server / format-stats / compile-spinner
      ├─ src/pack             encrypt / crypto / bytenode / pkg / icon / shell / package-descriptor
      └─ src/electron         resolve-electron / resolve-electron-builder / build-targets / kill-electron / resolve-main-entry
```

依赖方向自上而下：`pack/*` 与 `electron/*` 只被命令层调用，`core`/`config` 不反向依赖它们。

## 3. 命令流水线

`runCommand` 的统一编排顺序：

```text
loadEnv(.env + .env.<name>) → BC_ENV 兜底 → BC_* 子集注入 process.env
→ buildCtx → 命令级 resolveCliOptions 归一化 → logger.banner
→ preloadBcConfig（如需）→ preloadBuilderConfig（如需）→ cmd.action(ctx)
```

| 命令 | target | mode | bc.config | builder.config |
|---|---|---|---|---|
| `dev:web` | web | development | 是 | 否 |
| `build` | web | production | 是 | 否 |
| `dev:app` | app | development | 是 | 否 |
| `pack` | app | production | 是 | 是 |
| `installer` | app | production | 否 | 是 |

`pack` 的三个阶段：

- **阶段 A · 资源准备**：清空 `dist/`；计算加密状态与 `__BC_BUILD__`；合并 electron-builder 配置；适配 icon；生成安装/卸载 shell 脚本。
- **阶段 B · 代码构建**：清空 `app/`；main（一次编译、宿主 `index` 与包 `pkg` 两个入口）/preload/renderer 生产编译；AES 加密渲染层（可选）；更新包（`--dir` 也产出，作为内置包）；bytenode 宿主主进程字节码（可选）。
- **`pack --pkg-only`**：只编译包主进程与 renderer 并产出更新包，跳过阶段 A、preload、bytenode 与阶段 C。
- **阶段 C · 安装包打包**：按 platform/arch 构建 electron-builder targets 并执行；`--dir` 时校验 unpacked 目录。

`installer` 是阶段 A 子集 + 阶段 C：不清 `dist`、不派生 `__BC_BUILD__`、不读 bc.config，以上次 `pack --dir` 的 unpacked 目录作 prepackaged 输入。

## 4. ctx 契约

`buildCtx` 组合 `command / cliOptions / env / target / mode` 与 `deriveTarget`/`deriveMode` 派生布尔（`isApp/isWeb/isDev/isProd`）。配置预加载结果挂 `ctx.userConfig` / `ctx.userBuilderConfig`，用户配置函数只被求值一次。

## 5. 配置装配

- `bc.config.js` 导出对象或 `(ctx) => config`；web 场景消费 `{ web }`，app 场景消费 `{ main, preload, renderer, encrypt?, bytenode? }`；`main` 片段作用于主进程的宿主与包两个入口（一次编译）。
- webpack 配置合并：frame 预设为基底，用户片段经 `webpack-merge` 覆盖合并；`renderer` 支持多入口数组（`mergeConfigList` 按序对齐）。
- `electron-builder.config.js` 走 `customMerge`：数组默认拼接，`replace()` 标记的数组整体替换；`directories.output` 强制为 `dist`。
- 预设内置 `__BC_BUILD__` 逐字段注入（`build-info-plugin`）与 `BC_*` 环境变量注入（`user-env-plugin`）。

## 6. 核心不变量

- 发布产物目录固定 `dist/`；`app/` 是中间构建目录，`pack` 进场清空。
- `--platform/--arch` 解析与 unpacked 目录命名的唯一来源是 `src/electron/build-targets.js`，规则冻结于 `docs/build-target-resolution-contract.md`。
- 加密产物格式冻结于 `docs/crypto-artifact-contract.md`；bytenode 产物形态冻结于 `docs/bytenode-artifact-contract.md`。
- Electron / electron-builder / bytenode 一律从使用方项目根目录解析（`core/resolve-module.js`），frame 自身不携带这些运行时。

## 7. 发布形态

- `exports` 仅暴露 `.`（根聚合）与 `./package.json`；内部模块不可经包路径导入，由 `tests/unit/runtime-exports.test.js` 守护。
- 无 build 步骤：源码即合法 CommonJS，`files` 只发布 `bin` 与 `src`，测试天然排除在包外。
- 测试位于 `tests/`，镜像 `src/` 结构，jest 运行（`testMatch: tests/**/*.test.js`）。
- 依赖约束：`webpack` / `webpack-dev-server` 为必需 peer；`electron` / `electron-builder` / `bytenode` 为 optional peer，按命令按需解析。
- 注释规范：只描述当前实现（设计意图、用法、坑），禁止引用外部文档章节、中间状态或演进过程。