# Frame Fix-List 第二轮修复 · 设计

**日期**：2026-07-11
**来源**：`docs/superpowers/specs/frame-fix-list.md`（第二批，pool §2 Confirmed 9 条）
**目标**：一次修完 H1/H2/H3 + M1/M2/M3/M4 + L1/L2 共 9 条，闭环端到端验证
**范围锁**：H3 走**方案 A**（砍 `.mjs` 承诺），M4 **连带**改 `compileWarning`

---

## §0 背景

client-project P1 阶段 1 二轮 code review 汇总 9 条 frame 反馈。fix-list.md 已给单一推荐方案与验收 checkbox，本 spec 承担设计约束落地——把方案确定性写死、单测覆盖点定死、边界写死，为后续 plan/impl 提供依据。

第一批（H1-H5、M1-M2）已在 `a8e7566` 收工归档；本轮编号（H1/M1 等）仅是本文件优先级标签，**权威身份是 pool 里的 FB-XXX**。

---

## §1 H 类（3 条 · 阻断类）

### H1 · FB-014 · devServer 三层优先级

**改动位置**：`src/webpack-runner/run-dev-server.js:7-22`

**新契约**：`cliOptions.X ?? userDev.X ?? frameDefault(X)`。frameDefault 保持当前默认值，只改覆盖机制。

```js
function resolveDevServerOptions(ctx, userDev, { defaultPort }) {
    const host = ctx.cliOptions.host ?? userDev.host ?? 'localhost';
    const port = ctx.cliOptions.port ?? userDev.port ?? defaultPort;
    const hot = userDev.hot ?? true;
    const open = userDev.open ?? ctx.isWeb;
    return {
        historyApiFallback: true,
        ...userDev,
        host,
        port,
        hot,
        open,
        devMiddleware: {
            stats: false,
            ...(userDev.devMiddleware || {}),
        },
    };
}
```

**关键点**：
- `hot` / `open` 从 frameDefault 分支挪进"取值"位置，`...userDev` 后仍显式赋值——不再被无脑覆盖，也不受 `...userDev` 展开顺序影响
- `historyApiFallback` 保持 frame 默认（用户如需自定义可在 `userDev` 里覆盖，展开顺序保留原语义）
- **不**加 `--no-open` / `--no-hot` CLI 短路（YAGNI，bc.config 已够）

**单测覆盖点**（`tests/unit/webpack-runner/run-dev-server.test.js`，若无则新建）：
- user `{ open: false }` → 结果 `open: false`
- user `{ hot: false }` → 结果 `hot: false`
- user 未设 `open` + `ctx.isWeb=true` → 结果 `open: true`
- user 未设 `open` + `ctx.isWeb=false` → 结果 `open: false`
- CLI `--host abc.local` 覆盖 user host（回归）
- user `{ devMiddleware: { hot: false } }` → 深合并 `{ stats: false, hot: false }`

---

### H2 · FB-013 · env 缺失兜底

**改动位置**：`src/core/env.js:10-18`

**新契约**：`.env.<envName>` 缺失时 `logger.info` 提示 + 视作空对象；`.env`（base）缺失沉默 fallback（本就是可选）。

```js
const logger = require('./logger');

function loadEnv(envName, { cwd = process.cwd() } = {}) {
    const base = readEnvFile(path.join(cwd, '.env')) || {};
    const specificPath = path.join(cwd, `.env.${envName}`);
    const specific = readEnvFile(specificPath);
    if (!specific) {
        logger.info(`未找到 .env.${envName}，视作空环境`);
    }
    return { ...base, ...(specific || {}) };
}
```

**关键点**：
- `.env` 缺失**不** info（本身就是可选补充，info 会太吵）
- `.env.<envName>` 缺失时 info 一次，不 throw
- 二者都缺失场景合法（hello 项目开箱能跑）

**单测**（`tests/unit/core/env.test.js`）：
- 两个文件都缺失 → 返回 `{}` + 有一条 info（`.env.<name>` 缺失）
- 只有 base → 返回 base 内容 + 有 info
- 只有 specific → 返回 specific 内容 + 无 info
- 两个都有 → 返回合并 + 无 info（回归）

---

### H3 · FB-011 · 砍 `.mjs` 承诺

**改动位置**：`src/config/bc-config.js:10` + `src/config/builder-config.js:7`

**新契约**：`CONFIG_NAMES` 只保留 `.js / .cjs`。

```js
// bc-config.js
const CONFIG_NAMES = ['bc.config.js', 'bc.config.cjs'];

// builder-config.js
const CONFIG_NAMES = ['electron-builder.config.js', 'electron-builder.config.cjs'];
```

**关键点**：
- error 文案 "未找到 bc.config.js" / "未找到 electron-builder.config.js" 保持（本就没提 mjs）
- 用户已建 `bc.config.mjs` 但没建 `.js/.cjs` 时报"未找到"——语义清晰

**单测**（`tests/unit/config/bc-config.test.js` + `builder-config.test.js`）：
- fixture 只有 `bc.config.mjs` → `locateBcConfig` throw
- fixture 有 `.js` 或 `.cjs` → 正常命中（回归）

---

## §2 M 类（4 条）

### M1 · FB-010 · bc.config 兼容对象式

**改动位置**：`src/config/bc-config.js:26-33`

**新契约**：与 `builder-config.js:23-33` 完全对齐（function / object / else 三分支）。

```js
function loadUserConfig(configPath, ctx) {
    const loaded = require(configPath);
    const raw = loaded.default ?? loaded;
    if (typeof raw === 'function') return raw(ctx) || {};
    if (raw && typeof raw === 'object') return raw;
    throw new Error(`[base-client] bc.config 必须导出对象或 (ctx) => config 函数，收到：${raw === null ? 'null' : typeof raw}`);
}
```

**关键点**：
- 文案与 builder-config 完全对齐（除了 config 类型名）
- `raw === null` 单独处理，避免 `typeof null === 'object'` 误命中对象分支

**单测**（`tests/unit/config/bc-config.test.js`）：
- 对象式 fixture → 直接返回
- 函数式 fixture → 调 `raw(ctx)` 返回（回归）
- 导出 `null` fixture → throw，错误里含 "null"
- 导出字符串 fixture → throw，错误里含 "string"

---

### M2 · FB-018 · emptyDirSync 提示

**改动位置**：
- `src/cli/commands/pack.js:36` 前
- `src/cli/commands/build.js:22` 前
- `src/cli/commands/child.js:27-28` 前后

**新契约**：清空前 `logger.info`，用户可见。

```js
// pack.js / build.js
logger.info('清空 dist/（frame 约定输出目录，如有重要文件请移出）');
fse.emptyDirSync(distDir);

// child.js（两处都要）
logger.info('清空 dist/（frame 约定输出目录，如有重要文件请移出）');
fse.emptyDirSync(distDir);
logger.info('清空 app/');
fse.emptyDirSync(appDir);
```

**关键点**：
- pack.js 已有 `logger` 引用，直接用
- build.js 已有 `logger` 引用，直接用
- child.js 已有 `logger` 引用，直接用
- 不做非常规文件扫描 warn（复杂度高、命名规约会漂）
- 不加 `--no-clean` 标志（与"dist 是硬约定"设计冲突）

**测试**（e2e 或 unit）：
- `tests/unit/cli/commands-build.test.js`：捕获 info 断言含"清空 dist/"
- `tests/unit/cli/commands-child.test.js`：捕获 info 断言含两条清空
- `tests/unit/cli/commands-pack.test.js`：捕获 info 断言含"清空 dist/"

---

### M3 · FB-015 · `__BC_BUILD__` 字段矩阵文档

**改动位置**：`docs/superpowers/specs/2026-06-24-frame-design.md` §4.1（第 210 行区块内）

**新增内容**：在 §4.1 里补一节 "**字段矩阵：不同命令下的取值**"，含下表：

| 字段 | dev:web | build | dev:app | pack | child | installer |
|---|---|---|---|---|---|---|
| `target` | web | web | app | app | app | — |
| `name / productName / version` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `env / envName` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `buildTime` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `platform / arch` | undefined | undefined | undefined | cli 值 | undefined | — |
| `dir / sign` | false | false | false | cli 值 | false | — |
| `encrypted` | false | false | false | cryptoState | cryptoState | — |
| `encryptKey` | undefined | undefined | undefined | 有条件 | 有条件 | — |
| `child` | false | false | false | false | true | — |

同时在表前加一句"installer 命令不派生 `__BC_BUILD__`（`needsBcConfig=false`），用户 renderer 代码里的 `__BC_BUILD__` 字段访问在 installer 命令下不存在消费方"，与 §4.1 现有"250 行左右"的 installer 说明形成交叉引用。

**关键点**：
- 只改文档、不改源码
- `src/core/build-info.js` 顶部**可选**贴一份简版矩阵作为源码 self-doc（本轮不做，若日后 build-info 派生逻辑变复杂再补）

---

### M4 · FB-016 · warn/compileWarning 走 stderr

**改动位置**：`src/core/logger.js:14` + `logger.js:40`

**新契约**：

```js
function warn(msg) {
    console.warn(`${PREFIX} ${pc.yellow('⚠')} ${msg}`);
}

function compileWarning(name, count) {
    if (!count) return;
    console.warn(`${PREFIX} ${pc.yellow('⚠')} ${name} ${count} warnings`);
}
```

**关键点**：
- `console.warn` 默认走 stderr
- `success` / `info` / `compileSuccess` / `compileFailure` / `banner` / `footer` **不动**（走 stdout 语义正确）
- `compileFailure` 语义偏 error 但当前用 `console.log`——本轮**不改**（避免超范围；后续可单开一条）

**单测**（`tests/unit/core/logger.test.js`）：
- mock `console.warn` 与 `console.log`，触发 `warn('x')` 断言 `console.warn` 被调、`console.log` 未被调
- mock `console.warn`，触发 `compileWarning('web', 3)` 断言 `console.warn` 被调
- `compileWarning('web', 0)` 断言两个 mock 都未被调（回归）

---

## §3 L 类（2 条）

### L1 · FB-017 · logger.debug 通道

**改动位置**：`src/core/logger.js` 加 `debug`；`src/cli/index.js` 反射 `--debug` 到全局；关键节点插桩。

**门控策略**：为避免 `logger` 反向依赖 `ctx`，采用**双入口**：
- `process.env.BC_DEBUG` 优先（用户设 `BC_DEBUG=1 base-client build` 即可开）
- `global.__BC_DEBUG__`（`cli/index.js` 在 `--debug` 分支里赋值 `true`，logger 读取）

`logger.js` 新增：

```js
function debug(msg) {
    if (!process.env.BC_DEBUG && !global.__BC_DEBUG__) return;
    console.warn(`${PREFIX} ${pc.dim('debug')} ${msg}`);
}
```

- 输出走 stderr（debug 惯例，不污染 stdout 管道）
- 颜色用 `pc.dim` 弱化，与 `warn` 区分

`cli/index.js` 修改：

```js
async function runCommand(cmd, cliOptions) {
    if (cliOptions?.debug) global.__BC_DEBUG__ = true;
    try {
        // ...原逻辑
    } catch (err) {
        logger.error(`${cmd.name} 失败：`, err.message);
        if (cliOptions?.debug) console.error(err.stack);
        process.exit(1);
    }
}
```

**打点节点**（4 处，与 fix-list §3 L1 对齐）：

1. `src/config/bc-config.js` · `preloadBcConfig` 命中后：
   ```js
   logger.debug(`bc.config 命中：${configPath}`);
   ```
2. `src/config/builder-config.js` · `preloadBuilderConfig` 命中后：
   ```js
   logger.debug(`electron-builder.config 命中：${configPath}`);
   ```
3. `src/webpack-runner/run-dev-server.js` · `resolveDevServerOptions` return 前：
   ```js
   logger.debug(`devServer 最终配置：${JSON.stringify({ host, port, hot, open })}`);
   ```
4. `src/electron/build-targets.js` · `buildTargets` platform/arch 兜到宿主时：
   ```js
   logger.debug(`buildTargets 兜底：platform=${p} arch=${a}（宿主 fallback）`);
   ```

**单测**（`tests/unit/core/logger.test.js`）：
- `BC_DEBUG=1` env → `debug('x')` 触发 `console.warn`
- `global.__BC_DEBUG__=true` → `debug('x')` 触发 `console.warn`
- 二者都无 → `debug('x')` 无输出

（打点位置的集成测试跟随各文件的现有测试补，不额外新增测试文件）

---

### L2 · FB-019 · 端口差异 --help

**改动位置**：`src/cli/commands/dev-app.js:51` + `src/cli/commands/dev-web.js:17`

**新契约**：

```js
// dev-app.js
['--port <n>', 'renderer dev-server 端口（默认 8023，与 dev:web 的 9000 错开避免冲突）'],

// dev-web.js
['--port <n>', 'dev server 端口（默认 9000，与 dev:app 的 8023 错开避免冲突）'],
```

**关键点**：
- 只改 `options[]` 里的描述字符串
- 不加单测（--help 输出是文档不测；改错了也不影响功能）

---

## §4 边界（不做的事）

- **不**加 `--no-open` / `--no-hot` / `--no-clean` CLI 短路
- **不**做 `.mjs` 真支持（不改 async 链路）
- **不**做 emptyDirSync 前的非常规文件扫描 warn
- **不**改 `compileFailure` 的输出流（超范围）
- **不**在 `src/core/build-info.js` 顶部贴字段矩阵注释（M3 只改 F-doc）
- **不**改 pool §6 边界：不导出 runtime helper / 不放开产物目录名 / 不把 electron-builder / bytenode 挪进 dependencies

---

## §5 落地顺序与 commit 策略

按 fix-list 的落地建议分批：

1. **批 1 · H 类（阻断优先）**：H1 → H2 → H3。每条一 commit（含单测）
2. **批 2 · M 源码类**：M1 → M2 → M4。每条一 commit（含单测）
3. **批 3 · 观测与文档**：L1（含四处打点）→ M3（F-doc 表格）→ L2（--help 文案）。每条一 commit

每条修完后：
- 在 `docs/superpowers/specs/frame-fix-list.md` 对应条目末尾加 `✓ 已修 (frame commit: <sha>)`——**由 frame 侧动手**（fix-list.md 虽是 client-project 视角的清单，但物理放在 frame repo 里，直接原地更新）
- pool（`docs/feedback-pool.md`）迁 `§2 Confirmed → §3 Accepted` 是 **client-project 侧**的收工动作，frame 侧不管——本 spec 不涉及

全部落地后跑 fix-list §4 的《端到端验证清单》。

---

## §6 测试与验证

**单测层**：每条改动都有对应 unit test（除 L2 --help 与 M3 文档）。跑 `npm test` 全绿。

**e2e 层**：现有 `tests/unit/e2e-*.test.js` 是 pack/build/child/dev 全链路 e2e。M2 的 info 断言直接进 e2e。

**手工验收**：fix-list §4 端到端验证清单（11 条），按顺序过一遍。

---

## §7 完成信号

**给用户侧回复用的 checklist**（本 spec 完工的 DoD 校验点）：

- [ ] H1：devServer 三层优先级 + user `{open:false}` / `{hot:false}` 生效
- [ ] H2：`.env.<name>` 缺失时 info 提示 + 命令继续；`.env` 缺失沉默
- [ ] H3：`CONFIG_NAMES` 两处砍 `.mjs`；`bc.config.mjs` 单独存在时报"未找到"
- [ ] M1：bc.config 兼容对象式导出；错误文案与 builder-config 对齐
- [ ] M2：pack / build / child 清空前有 info 提示（child 两条）
- [ ] M3：`frame-design.md §4.1` 出现 `__BC_BUILD__` 字段矩阵表格
- [ ] M4：warn / compileWarning 走 `console.warn`（stderr）
- [ ] L1：`logger.debug` + `BC_DEBUG` 或 `--debug` 门控 + 四处打点
- [ ] L2：dev:app / dev:web 的 `--port` 描述含端口错开说明
- [ ] `npm test` 全绿
- [ ] fix-list 条目末尾追 commit sha（frame 侧动手）

全部打勾即 frame 侧本轮闭环，用户可拿本 checklist 回复 client-project 侧（pool 的 §2→§3 迁移由 client-project 侧自行完成）。
