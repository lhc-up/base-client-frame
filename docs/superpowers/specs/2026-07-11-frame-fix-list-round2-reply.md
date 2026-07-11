# Frame fix-list 第二轮 · 修复回复

**日期**：2026-07-11
**分支**：master
**对应清单**：`docs/superpowers/specs/frame-fix-list.md`（本文件按其序号 H1/H2/H3/M1/M2/M3/M4/L1/L2 一一对应）
**权威身份**：FB-XXX（pool 里的编号）

---

## H1 · FB-014

**处理方式**：`resolveDevServerOptions` 改为三层优先级——`cliOptions.X ?? userDev.X ?? frameDefault(X)`。`hot` / `open` 从硬覆盖改用 `??`，放在 `...userDev` 之后显式赋值，用户 `bc.config.js` 里配 `web: { devServer: { open: false } }` / `{ hot: false }` 生效。frameDefault 保持不变（`open = ctx.isWeb`、`hot = true`）——只改覆盖机制，不改默认取值。**未加** `--no-open` / `--no-hot` CLI 短路（YAGNI）。

**Commit**：`fb65f2c` + `a0acc79`（补 devMiddleware 多字段深合并断言）

---

## H2 · FB-013

**处理方式**：`.env.<envName>` 缺失时 `logger.info` 提示"未找到 .env.${envName}，视作空环境"并继续，不抛错。`.env`（base）缺失沉默 fallback 到 `{}`（本身可选，不 info）。运行时 `env = { ...base, ...(specific || {}) }`——hello / 极简项目开箱可跑，无需先建空 env 文件。

**Commit**：`c04344b`

---

## H3 · FB-011

**处理方式**：走**方案 A（砍承诺）**——`CONFIG_NAMES` 从 `['bc.config.js', 'bc.config.cjs', 'bc.config.mjs']` 改为 `['bc.config.js', 'bc.config.cjs']`；`builder-config.js` 的 CONFIG_NAMES 同款处理。error 文案不变。用户建 `bc.config.mjs` 会报 "未找到 bc.config.js"（语义清晰）。**未做** `.mjs` 真支持（不改 async 链路）。

**Commit**：`4c01efd`

---

## M1 · FB-010

**处理方式**：`loadUserConfig` 改为三分支（function / object / else throw），与 `loadUserBuilderConfig` 完全对齐，错误文案 `bc.config 必须导出对象或 (ctx) => config 函数，收到：${...}`。

**附赠对称修复（M1-followup）**：code review 阶段发现 `loadUserBuilderConfig` 对 `module.exports = null` 会先抛 `TypeError: Cannot read properties of null (reading 'default')`（因为 `loaded.default` 没 `?.` 保护），绕过原设计的友好错误。顺手补了 `loaded?.default ?? loaded` + 对称的 null / string 形态测试。frame 与 builder 两个 config loader 现在完全契约对齐。

**Commit**：`27a5a89`（主）+ `fb43a1e`（followup）

---

## M2 · FB-018

**处理方式**：`pack.js` / `build.js` / `child.js` 三处 `emptyDirSync(distDir)` 之前加 `logger.info('清空 dist/（frame 约定输出目录，如有重要文件请移出）')`；`child.js` 额外在 `emptyDirSync(appDir)` 前加 `logger.info('清空 app/')`。`pack.js` 阶段 B 的 `emptyDirSync(appDir)` 静默（属流水线内部清理，非命令入口清空，语义分层）。**未加** 非常规文件扫描 warn / `--no-clean` 标志（YAGNI + 与"dist 是硬约定"设计冲突）。

**Commit**：`9beae9b`（主）+ `c82b201`（e2e 的 `mockRestore` 挪进 try/finally，与 e2e-build 对齐）

---

## M3 · FB-015

**处理方式**：走**方案 A（纯文档）**——在 `docs/superpowers/specs/2026-06-24-frame-design.md` §4.1 里"target 缺省值规则"段落之后追加"字段矩阵：不同命令下的取值"表格（9 字段 × 6 命令，含 `installer` 整列为 —），并交叉引用源码路径 `src/core/build-info.js`。**未在** `build-info.js` 顶部贴自 doc 注释（保持 spec 边界）。

**Commit**：`9230402`

---

## M4 · FB-016

**处理方式**：`logger.warn` 由 `console.log` 改为 `console.warn`（走 stderr，符合 UNIX 惯例）。**连带改** `compileWarning`（也属 warn 类，与 warn 通道同位）。其他 logger 函数（`info` / `success` / `compileSuccess` / `compileFailure` / `banner` / `footer`）保持 `console.log` 不动（stdout 语义正确）。`enforceDistOutput` 里的 `logger.warn` 与 `pack.js:93` 的 warn 作为连锁收益一并走 stderr——`2>/dev/null` 后正常输出仍留在 stdout。

**Commit**：`2f44b71`

---

## L1 · FB-017

**处理方式**：`logger.js` 新增 `debug(msg)`，门控 `process.env.BC_DEBUG || global.__BC_DEBUG__`，输出走 `console.warn`（stderr，不污染 stdout 管道），前缀 `pc.dim('debug')`。`cli/index.js` 里 `runCommand` 头部反射 `--debug` 到 `global.__BC_DEBUG__`（避免让 logger 反向依赖 ctx），并加 `finally` 清理（防止多命令跑污染 global）。4 处打点：`preloadBcConfig` / `preloadBuilderConfig` 命中路径；`resolveDevServerOptions` 最终生效值（`host/port/hot/open`）；`buildTargets` 最终值（`platform/arch/dir`）。用户 `--debug` 或 `BC_DEBUG=1` 都可开启。

**Commit**：`10911ea`（part1 debug 通道）+ `f8e5ade`（part2 4 处打点）+ `a0fa328`（refactor：finally 清 `__BC_DEBUG__` + 回退中间 `result` 变量）

---

## L2 · FB-019

**处理方式**：走**方案 A**——`dev-app.js:51` 与 `dev-web.js:17` 的 `--port <n>` 描述末尾各补一句错开原因：

- `dev:app`：`renderer dev-server 端口（默认 8023，与 dev:web 的 9000 错开避免冲突）`
- `dev:web`：`dev server 端口（默认 9000，与 dev:app 的 8023 错开避免冲突）`

`--help` 输出即可自证差异理由。

**Commit**：`d0fab7c`

---

## 测试与联调

- **单测**：本轮涉及的 unit + 相关 e2e 全绿。
- **全量 `npm test`**：43 suites / 229 tests passed。**3 条失败**为 pre-existing（不在本轮范围）：
  - `tests/unit/pack/shell.test.js` · shell 变量替换断言
  - `tests/unit/e2e-pack-enhancements.test.js` · Jest worker crash
  - `tests/unit/e2e-dev-web.test.js` · Jest worker crash
  - 归因：Windows / 环境相关的可能性大，不像 frame 逻辑 bug。若要收拾，另开一条 task 单独处理。
- **联调路径**：frame 侧 `yalc push` → client-project 沙盘 `yalc update` → 走 `frame-fix-list.md §4 端到端验证清单`（11 条）。

## 后续动作（client-project 侧）

- pool（`docs/feedback-pool.md`）的 §2 Confirmed → §3 Accepted 迁移
- 沙盘端到端清单跑一遍
- 全绿后 frame 侧可打里程碑 tag `frame@P1-1-round2-done`

## 边界（本轮不做）

- 不加 CLI `--no-open` / `--no-hot` / `--no-clean` 短路
- 不做 `.mjs` 真支持（H3 走方案 A）
- 不加 emptyDirSync 前的非常规文件扫描 warn
- 不改 `compileFailure` 通道（超范围）
- 不导出 runtime helper / 不放开产物目录名 / 不把 electron-builder / bytenode 挪进 dependencies（沿用 pool §6 边界）
