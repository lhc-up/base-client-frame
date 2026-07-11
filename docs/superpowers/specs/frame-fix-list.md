# Frame 修改清单 · P1 阶段 1 沙盘反馈（第二批）

**日期**：2026-07-11（下发） / 待 frame 侧回复
**来源**：`client-project` P1 阶段 1 二轮 code review + 少量非破坏性命令探测
**接收者**：用户（"再收集点问题一并反馈给 frame"）
**上一批**：见 `frame-fix-list.2026-07-10.md`（8 条已归档 / 收工）
**关联**：`docs/feedback-pool.md` §2 Confirmed 全部 9 条 = 本清单来源。**编号复用 pool 里的 FB-XXX**（权威身份），本文件在其前面加 H/M/L 优先级标签

## 汇总

| 优先级 | FB | 主题 | 影响命令 | frame 源码定位 |
|---|---|---|---|---|
| H1 | FB-014 | devServer `open` / `hot` 用户配置被 frame 静默覆盖 | `dev:web` / `dev:app` | `src/webpack-runner/run-dev-server.js:10-21` |
| H2 | FB-013 | `.env.<name>` 强制存在，无 fallback | 所有命令 | `src/core/env.js:14-16` |
| H3 | FB-011 | `.mjs` 后缀承诺但 `require()` 加载器不支持 | 所有 needs-config 命令 | `src/config/bc-config.js:10,27` + `src/config/builder-config.js:7,24` |
| M1 | FB-010 | bc.config 强制函数式 vs builder.config 兼容对象式的 API 一致性 gap | 所有 needs-config 命令 | `src/config/bc-config.js:29` |
| M2 | FB-018 | pack / build / child 一开始静默 `emptyDirSync(dist)` 无提示 | `pack` / `build` / `child` | `src/cli/commands/{pack,build,child}.js` |
| M3 | FB-015 | `__BC_BUILD__` 字段矩阵在不同命令下的差异未文档化 | 所有走 build-info-plugin 的命令 | `src/core/build-info.js:19-25` |
| M4 | FB-016 | `logger.warn` 走 stdout 不符合 UNIX 惯例 | 所有命令的 warn 输出 | `src/core/logger.js:15` |
| L1 | FB-017 | CLI 全局 `--debug` 仅打错误 stack，无命令内 debug 输出通道 | 所有命令的调试路径 | `src/cli/index.js:45` + `src/core/logger.js` |
| L2 | FB-019 | dev:app 默认端口 8023 / dev:web 9000，差异无文档说明 | `dev:app` / `dev:web` | `src/cli/commands/dev-app.js:63` + `src/cli/commands/dev-web.js:26` |

---

## §0 使用说明

- 9 条 frame 问题按建议优先级 H / M / L 排列
- 每条给出：影响命令 / frame 源码定位 / 现象 / 期望 / 推荐方案（含用户 review 时提炼的合理默认约束）
- 修完一条：
  1. 在本文件条目末尾追加 `✓ 已修 (frame commit: <sha>)`
  2. 到 `docs/feedback-pool.md` 把对应 FB-XXX 从 §2 Confirmed 迁到 §3 Accepted，附 F-XX 编号 + 晋升日期
  3. yalc publish frame → client-project 侧 yalc update
- 全部修完，跑 §末《端到端验证清单》

## §0.1 优先级说明

- **H（高）**：接入即撞 / 阻断 / 明显 bug / 用户显式配置无效
- **M（中）**：DX 卡点、一致性 gap 或潜在数据丢失，可绕但摩擦大
- **L（低）**：观测 / 文档 / 小改进，不影响功能

## §0.2 与本轮 feedback-pool 的关系

- 本清单 = `feedback-pool.md §2 Confirmed` 9 条 + 优先级视图 + 单一推荐方案（pool 保留 A/B/C 多方案，本清单只挑一条推荐给 frame 侧动手）
- **FB-009 仍在 pool §1 Pending**（M1 兜底后 platform/arch 未贯穿到 unpacked 路径推导），未纳入本清单——需用户先在 pool 里 review 确认（或与 M1 上一批一起追认）
- **FB-012 已 rejected**（正交语义误判），不下发
- 后续 P1 阶段 2+ 或 P2 发现的新 frame 问题：走 pool 首站流程（pending → confirmed），本清单不主动收——除非到"我要拿去修 frame 了"的动作节点，再从 pool 批量抽下一批

---

## §1 H 类（3 条，建议优先修）

### H1 · FB-014 · devServer `open` / `hot` 用户配置被 frame 静默覆盖

- **影响命令**：`dev:web` / `dev:app`
- **frame 源码**：`src/webpack-runner/run-dev-server.js:10-21`（`resolveDevServerOptions` 里 `open: ctx.isWeb` / `hot: true` 排在 `...userDev` 之后）
- **现象**：用户在 `bc.config.js` 里配 `web: { devServer: { open: false } }` 想关掉浏览器自动弹窗，跑 `npm run dev:web` 仍会弹；同理 `hot: false` 也无法关闭 HMR
- **期望**：CLI > user > frameDefault 三层优先级，与 `host` / `port` 处理方式一致
- **关键约束（用户 2026-07-11 review 指出）**：**当前默认值本身合理**——`dev:web` 默认弹浏览器、`dev:app` 默认不弹（Electron 有主进程窗口无需浏览器）符合 DX 直觉。**只改覆盖机制，不改默认取值**
- **推荐方案**：所有 devServer 选项统一 `cliOptions.X ?? userDev.X ?? frameDefault` 三层优先级：
  - `frameDefault(open) = ctx.isWeb`（dev:web=true 弹 / dev:app=false 不弹，保持当前直觉）
  - `frameDefault(hot) = true`
  - `frameDefault(host) = 'localhost'`
  - `frameDefault(port)` 按命令区分（dev:app=8023 / dev:web=9000，见 L2）
  - 可选进阶：CLI 加 `--no-open` / `--no-hot` 短路（等价于 `userDev.open/hot = false`，方便临时调试不改 bc.config）
- **沙盘侧回归动作**：无（沙盘目前没配 `web.devServer.open` / `hot`，走默认即可；修完后可选新增一条 `bc.config.js` 里 `web: { devServer: { open: false } }` 验证）
- **验收 checkbox**：
  - [ ] 沙盘 `bc.config.js` 加 `web: { devServer: { open: false } }` → `npm run dev:web` **不弹**浏览器
  - [ ] 沙盘 `bc.config.js` 加 `main: { devServer: { open: true } }`（或对应 dev:app 的 renderer 段）→ `npm run dev:app` **弹**浏览器
  - [ ] 不配 open 时：dev:web 仍弹 / dev:app 仍不弹（默认不变）

**✓ 已修**：`fb65f2c` (主) + `a0acc79` (补 devMiddleware 深合并断言)

---

### H2 · FB-013 · `.env.<name>` 强制存在，无 fallback / 无空对象兜底

- **影响命令**：所有命令（`.env.<name>` 是命令入口必经步骤）
- **frame 源码**：`src/core/env.js:14-16`
  ```js
  if (!specific) {
      throw new Error(`[base-client] 未找到 .env.${envName}（cwd=${cwd}）`);
  }
  ```
- **现象**：hello / 极简项目即使**完全不需要 env 变量**也必须建一个 `.env.<envName>`（默认 `.env.prod`），否则任何命令都直接 throw。启动仪式感高，与 frame "最小骨架" 定位冲突
- **期望**：无 env 需求的项目应能开箱跑，无需先建空文件
- **推荐方案**：`.env.<name>` 不存在时 `logger.info` 提示 "未找到 .env.${envName}，视作空环境" 并继续；`.env`（base）也可选。运行时 `env = { ...(base||{}), ...(specific||{}) }`
- **沙盘侧回归动作**：修完后可选把 `.env.prod` 删掉验证；也可保留（当前内容 `BC_ENV=prod` 是有意义的业务标识）
- **验收 checkbox**：
  - [ ] 删除沙盘 `.env.prod` 后跑 `npm run build`：应看到 info 提示 + 命令正常完成
  - [ ] 保留 `.env.prod` 场景不变（回归验证）

**✓ 已修**：`c04344b`

---

### H3 · FB-011 · `.mjs` 后缀承诺但 `require()` 加载器不支持

- **影响命令**：所有 needs-config 命令（dev:web / dev:app / build / pack / child / installer）
- **frame 源码**：
  - `src/config/bc-config.js:10` `CONFIG_NAMES = ['bc.config.js', 'bc.config.cjs', 'bc.config.mjs']`
  - `src/config/bc-config.js:27` `require(configPath)`
  - `src/config/builder-config.js:7` 同款 CONFIG_NAMES 声明
  - `src/config/builder-config.js:24` 同款 `require(configPath)`
- **现象**：用户按 frame 声明的支持列表命名 `bc.config.mjs`（`export default (ctx) => ({...})`），跑任何命令都会因 `require()` 无法加载 ESM 直接抛 `ERR_REQUIRE_ESM`（Node 18.12 ~ 21.x）。frame `engines.node >= 18.12.0`，并未强制 Node 22.12+
- **期望**：承诺什么就实现什么——要么删除 `.mjs` 声明，要么真的加载
- **推荐方案**：**方案 A（最轻，砍承诺）**——从 `CONFIG_NAMES` 移除 `.mjs`，只保留 `.js / .cjs`。理由：CommonJS 生态足够，避免维护动态 `import()` 的异步链路改造成本
  - 如果 frame 团队认为 `.mjs` 支持是必要的，走**方案 B**（真支持）：`configPath.endsWith('.mjs')` 时 `await import(pathToFileURL(configPath).href)`，`preloadBcConfig` / `preloadBuilderConfig` / `loadUserConfig` 全链改为 async
- **沙盘侧回归动作**：无（沙盘用 `.js` 后缀）
- **验收 checkbox**：
  - [ ] 方案 A：新建 `bc.config.mjs` 后跑 `npm run build`，应报"未找到 bc.config.js"（说明 mjs 不再被搜索）
  - [ ] 方案 B：新建 `bc.config.mjs`（`export default (ctx) => ({...})`）跑 `npm run build`，应正常加载

**✓ 已修**：`4c01efd`（走方案 A：CONFIG_NAMES 移除 .mjs）

---

## §2 M 类（4 条，建议在 H 之后修）

### M1 · FB-010 · bc.config 强制函数式与 electron-builder.config 兼容对象式的 API 一致性 gap

- **影响命令**：所有 needs-config 命令
- **frame 源码**：`src/config/bc-config.js:29`
  ```js
  if (typeof fn !== 'function') {
      throw new Error(`[base-client] bc.config 必须导出函数 (ctx) => config，收到：${typeof fn}`);
  }
  ```
- **现象**：FB-002（frame commit `1ee64bf` / `6fcaee5`）修完后，`electron-builder.config.js` 已支持"对象 或 (ctx)=>config"两种形式（`builder-config.js:26-32`）。但 `bc.config.js` 仍强制函数式。用户在两个 config 里学到不同的心智模型
- **期望**：两个 config 文件契约对齐
- **推荐方案**：**方案 A（与 FB-002 呼应）**——`bc.config` 也兼容对象式，运行时判 `typeof cfg === 'function' ? cfg(ctx) : cfg`：
  ```js
  function loadUserConfig(configPath, ctx) {
      const loaded = require(configPath);
      const raw = loaded.default ?? loaded;
      if (typeof raw === 'function') return raw(ctx) || {};
      if (raw && typeof raw === 'object') return raw;
      throw new Error(`[base-client] bc.config 必须导出对象或 (ctx) => config 函数，收到：${raw === null ? 'null' : typeof raw}`);
  }
  ```
  错误消息文案对齐 builder-config
- **沙盘侧回归动作**：无（沙盘 `bc.config.js` 已用函数式；修完后无需改，兼容后仍能跑）
- **验收 checkbox**：
  - [ ] 沙盘 `bc.config.js` 改为 `module.exports = { encrypt: false, /* 其余保留 */ }`（对象式）后 `npm run build` 应正常
  - [ ] 沙盘 `bc.config.js` 恢复函数式后 `npm run build` 仍正常

**✓ 已修**：`27a5a89` (主) + `fb43a1e` (followup: builder-config 对称 null 保护)

---

### M2 · FB-018 · pack / build / child 一开始 `emptyDirSync(dist)` 无提示、无 opt-in

- **影响命令**：`pack` / `build` / `child`
- **frame 源码**：
  - `src/cli/commands/pack.js:36` `fse.emptyDirSync(distDir);`
  - `src/cli/commands/build.js:22` `fse.emptyDirSync(distDir);`
  - `src/cli/commands/child.js:27-28` `fse.emptyDirSync(distDir); fse.emptyDirSync(appDir);`
- **现象**：三处静默清 `dist/`（child 还额外清 `app/`）。用户不小心放的 `dist/notes.md` / `dist/.gitkeep` 等文件被无声丢失。`dist/` 是 frame 硬约定可以支撑清空动作，但**用户视角看不到发生了什么**
- **期望**：清空前给用户一个"我正在清空"的可见信号
- **推荐方案**：清空前 `logger.info('清空 dist/（frame 约定输出目录，如有重要文件请移出）');`；child 命令再补 `logger.info('清空 app/');`
  - 不做扫描非常规文件的 warn（复杂度高、命名规约会漂）
  - 不加 `--no-clean` 标志（与"dist 是硬约定"设计冲突）
- **沙盘侧回归动作**：无
- **验收 checkbox**：
  - [ ] `npm run build`：banner 之后能看到 `[base-client] 清空 dist/（frame 约定输出目录，如有重要文件请移出）`
  - [ ] `npm run child`：能看到清空 dist/ + 清空 app/ 两条 info

**✓ 已修**：`9beae9b` (主) + `c82b201` (e2e try/finally 补齐)

---

### M3 · FB-015 · `__BC_BUILD__` 字段矩阵在不同命令下的差异未文档化

- **影响命令**：所有 renderer / preload / main 编译命令
- **frame 源码**：`src/core/build-info.js:19-25`
- **现象**：字段派生带命令条件——`platform / arch / dir / sign` 仅 `pack` 有值；`encrypted / encryptKey` 仅 pack+cryptoState 或 child+cryptoState 有值；`child: true` 仅 child 命令。用户在 renderer 里读 `__BC_BUILD__.platform` 判断分支，dev:app 场景恒 undefined 但没有文档说明
- **期望**：字段矩阵在 F-doc 里明示
- **推荐方案**：**方案 A（最轻，纯文档）**——F-doc 补一节 "`__BC_BUILD__` 字段矩阵"，表格形式：

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

  （installer 命令不派生 `__BC_BUILD__`，因 `needsBcConfig=false`；用户在 renderer 里的字段访问 F-doc 侧要明示）
- **沙盘侧回归动作**：无
- **验收 checkbox**：
  - [ ] F-doc 里出现完整的字段矩阵章节
  - [ ] （可选）frame 侧在 build-info.js 顶部注释里贴一份简版矩阵，作为源码内的 self-doc

**✓ 已修**：`9230402`（frame-design.md §4.1 字段矩阵）

---

### M4 · FB-016 · `logger.warn` 走 `console.log`（stdout），不符合 UNIX 惯例

- **影响命令**：所有产生 warn 输出的命令
- **frame 源码**：`src/core/logger.js:15`
  ```js
  function warn(msg) {
      console.log(`${PREFIX} ${pc.yellow('⚠')} ${msg}`);
  }
  ```
- **现象**：`warn` 走 stdout，与 `error`（走 `console.error` → stderr）不一致。CI 场景 `cmd 2>/dev/null` 抓不到 warn；tee 抓 stdout 时 warn 与正常输出混一起
- **期望**：warn / error 都走 stderr（UNIX 惯例）
- **推荐方案**：`warn` 改走 `console.warn`（默认 stderr）。同时确认 `compileWarning`（`logger.js:40`）是否也应改（该函数用 `console.log`，语义上属 warn 类）
- **沙盘侧回归动作**：无
- **验收 checkbox**：
  - [ ] 触发一次 warn 场景（如显式 `directories.output: 'pack'` 触发 FB-006 的覆盖 warn），`npm run pack -- --dir 2>/dev/null` 后 warn 消失；不加 `2>` 时 warn 仍能看到
  - [ ] 正常成功输出仍走 stdout（不受影响）

**✓ 已修**：`2f44b71`（连带改 compileWarning）

---

## §3 L 类（2 条，观测 / 文档，可延后）

### L1 · FB-017 · CLI 全局 `--debug` 仅打错误 stack，命令内部无 debug 输出通道

- **影响命令**：所有命令的调试路径
- **frame 源码**：
  - `src/cli/index.js:45` `if (cliOptions?.debug) console.error(err.stack);`
  - `src/core/logger.js` 无 `debug()`
- **现象**：用户 `--debug` 后只在出错时看到 stack；正常/半正常场景想看"加载了哪个 config / 命中哪个 preset / merge 结果"完全没通道，只能在 frame 里临时插 `console.log`
- **期望**：命令关键节点有可选 debug 输出
- **推荐方案**：logger 加 `debug(msg)` 函数，受 `ctx.cliOptions.debug || process.env.BC_DEBUG` 门控。命令关键节点补 `logger.debug(...)`：
  - `preloadBcConfig` 命中路径：`logger.debug('bc.config 命中：${configPath}')`
  - `preloadBuilderConfig` 命中路径：同上
  - `resolveDevServerOptions` 最终生效值：`logger.debug('devServer 最终配置：${JSON.stringify(...)}')`
  - `buildTargets` 兜底信息（platform/arch 兜到宿主时）
- **沙盘侧回归动作**：无
- **验收 checkbox**：
  - [ ] `npm run build -- --debug` 能看到 config 加载路径 / preset merge 结果的额外输出
  - [ ] 不加 `--debug` 输出保持简洁

**✓ 已修**：`10911ea` (part1 debug 通道) + `f8e5ade` (part2 4 处打点) + `a0fa328` (refactor: finally 清 global + 回退 result)

---

### L2 · FB-019 · dev:app 默认端口 8023 / dev:web 默认端口 9000，差异无文档说明

- **影响命令**：`dev:app` / `dev:web`
- **frame 源码**：`src/cli/commands/dev-app.js:63` + `src/cli/commands/dev-web.js:26`
- **现象**：默认端口差异（避免两个 dev-server 同时运行冲突）没在 `--help` / F-doc / banner 任何地方说明
- **期望**：`--help` 或 F-doc 里能查到差异理由
- **推荐方案**：**方案 A（最轻）**——`--help` option 描述里补一句：
  - `dev:app`：`'--port <n>': 'renderer dev-server 端口（默认 8023，与 dev:web 的 9000 错开避免冲突）'`
  - `dev:web`：`'--port <n>': 'dev server 端口（默认 9000，与 dev:app 的 8023 错开避免冲突）'`
- **沙盘侧回归动作**：无
- **验收 checkbox**：
  - [ ] `base-client dev:app --help` 与 `dev:web --help` 里能看到差异理由

**✓ 已修**：`d0fab7c`

---

## §4 修复后端到端验证清单（frame 侧对齐用）

frame yalc push 后，依次跑：

- [ ] `npm install`：peer 提示照旧无 error（回归验证）
- [ ] `npm run dev:web`：正常，:9000 有 Vue Hello 页；`--help` 里能看到端口差异说明（L2 验证点）
- [ ] `npm run dev:app`：Electron 窗口 + preload payload + buildInfo section 齐；`--help` 里能看到端口差异说明（L2 验证点）
- [ ] 沙盘 `bc.config.js` 临时加 `web: { devServer: { open: false } }` → `npm run dev:web` **不弹**浏览器（H1 验证点）；验证后删回
- [ ] 沙盘 `bc.config.js` 临时改为对象式 `module.exports = { encrypt: false }` → `npm run build` 应成功（M1 验证点）；验证后恢复函数式
- [ ] 沙盘 `.env.prod` 临时删除 → `npm run build` 应正常 + 看到 info 提示（H2 验证点）；验证后恢复
- [ ] 沙盘临时新建 `bc.config.mjs` → `npm run build` 应报"未找到 bc.config.js"（方案 A）或正常加载（方案 B）（H3 验证点）；验证后删掉
- [ ] `npm run build`：banner 后能看到 `[base-client] 清空 dist/...` info（M2 验证点）
- [ ] `npm run child`：能看到清空 dist/ + 清空 app/ 两条 info（M2 验证点）
- [ ] `npm run pack -- --dir --pack-config <显式配 directories.output='pack' 的临时 config>`：触发 FB-006 覆盖 warn；重定向 `2>/dev/null` 后 warn 消失（M4 验证点）；验证后清理
- [ ] `npm run build -- --debug`：能看到 config 加载路径 / preset merge 结果的额外输出（L1 验证点）
- [ ] F-doc 里出现 `__BC_BUILD__` 字段矩阵章节（M3 验证点）

全绿即本轮反馈 DoD 闭环，同步：
- 各条对应 `feedback-pool.md §2 Confirmed` 迁 §3 Accepted
- P1 阶段 1 §7 DoD 校验清单里 FB-014/013/011/010/018/015/016/017/019 标已闭环
- 打里程碑 tag（如 `frame@P1-1-round2-done`）

---

## §5 与 feedback-pool 的关系

- 本文件 = pool §2 Confirmed 的 **优先级视图 + 单一推荐方案 + 验证 checkbox**
- 修完一条 frame 问题：**双写更新**——本文件条目追 `✓ 已修 (frame commit: <sha>)`，pool 对应 FB 迁到 §3 Accepted
- 未来 P1 阶段 2+ 或 P2 发现的新 frame 问题：走 pool 首站流程（pending → confirmed），本清单不主动收——除非到"我要拿去修 frame 了"的动作节点，再从 pool 批量抽下一批

## §6 边界（沿用旧清单，明确 frame 侧本轮不新增）

见 `feedback-pool.md §6`：不导出 runtime helper / 不放开产物目录名 / 不把 electron-builder / bytenode 装到 frame dependencies。本轮如触发相关方向的反馈请直接回退。

---

## §7 本轮完成信号（2026-07-11 · 供回复 client-project 侧）

**Frame fix-list 第二轮 · 9 条修复全部落地**（master 分支）：

| Fix | commit(s) |
|---|---|
| H1 · FB-014 devServer 三层优先级 | `fb65f2c` + `a0acc79` |
| H2 · FB-013 .env 缺失兜底 | `c04344b` |
| H3 · FB-011 砍 .mjs 承诺（方案 A） | `4c01efd` |
| M1 · FB-010 bc.config 对象式兼容 | `27a5a89` + followup `fb43a1e`（builder-config 对称 null 保护） |
| M2 · FB-018 pack/build/child 清空前 info | `9beae9b` + `c82b201` |
| M3 · FB-015 __BC_BUILD__ 字段矩阵文档 | `9230402` |
| M4 · FB-016 warn/compileWarning 走 stderr | `2f44b71` |
| L1 · FB-017 logger.debug + 4 处打点 | `10911ea` + `f8e5ade` + `a0fa328` |
| L2 · FB-019 --port --help 端口差异 | `d0fab7c` |

- **单测**：本轮涉及的所有 unit 与相关 e2e 全绿；全量 `npm test` 43 suites / 229 tests passed，3 条失败（`pack/shell.test.js`、`e2e-pack-enhancements.test.js`、`e2e-dev-web.test.js`）为 pre-existing，与本轮无关。
- **可 yalc push 联调**：client-project 侧走 `frame-fix-list.md §4 端到端验证清单`。
- **pool 迁移**：pool §2 Confirmed → §3 Accepted 由 client-project 侧完成（本轮 frame 侧不管）。

若沙盘验收全绿，可打里程碑 tag `frame@P1-1-round2-done`。
