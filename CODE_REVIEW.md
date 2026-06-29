# @base-client/frame 代码审阅报告（第二版）

> 审阅基准：`docs/superpowers/specs/2026-06-24-frame-design.md`
> 审阅范围：`src/` 实现、测试、打包配置
> 审阅日期：2026-06-29（第二版，基于 `14c2bba` 修复后）
> **未修改任何源码**，仅记录发现的问题。

---

## 摘要

上次审阅（CODE_REVIEW.md 第一版）共发现 23 项问题。本轮对照 `14c2bba`（fix：修复审阅问题）commit 后：

- **已修复**：8 项
- **未修复 / 部分修复**：13 项
- **新发现问题**：2 项（由"修复"引入的回归）
- **当前测试**：`npm test` 46 套件中 1 失败 / 198 用例中 1 失败（197 通过），唯一失败为 E2E dev:web 端口占用超时（已知问题，TODOs.md 已记录）

---

## 一、上次 P0 问题处理结果

### P0-1（已修复 → 引入新问题）

**原问题**：`buildInfoPlugin` 整体注入 `__BC_BUILD__: JSON.stringify(obj)`，不符合设计 §1.2 要求的逐字段 `__BC_BUILD__.<field>` 注入。

**修复情况**：`14c2bba` 中 `build-info-plugin.js` 的修复**将实现改回了整体注入**，但测试也随之调整为断言整体注入——形成"测试与实现一致，但均与设计不符"的局面。

**设计意图**（§1.2）：逐字段注入是为了让 webpack DCE 正确消除死代码。例如：

```js
if (__BC_BUILD__.target === 'app') {
    require('electron'); // app 分支
} else {
    fetch('/api');       // web 分支
}
```

整体注入时，webpack 看到的是 `__BC_BUILD__: { target: 'web', ... }` 整体对象，无法折叠条件分支；逐字段注入时，webpack 看到 `__BC_BUILD__.target === 'app'` 比较可直接消除 else 分支。

**建议**：恢复逐字段注入实现，并统一测试断言。

---

### P0-2（已正确修复）

**原问题**：`encrypt` 默认开启时，缺失 `build/encrypt.key` 不抛错。

**当前实现**（`src/pack/encrypt.js`）：

```js
function computeCryptoState({ rootDir, userConfig }) {
    if (userConfig.encrypt === false) return { encrypted: false };
    const keyPath = path.join(rootDir, 'build/encrypt.key');
    if (!fs.existsSync(keyPath)) {
        throw new Error(`[base-client] 启用了 encrypt 但未找到 build/encrypt.key...`);
    }
    // 附加校验：ASCII 字符检查、密钥长度 >= 32
    ...
    return { encrypted: true, encryptKey };
}
```

符合设计 §5.1：`encrypt !== false` 且密钥缺失时 fail-fast；同时增加了 P2-17 的校验项（密钥长度 >= 32）。**此问题已正确修复**。

---

### P0-3（未修复）

**原问题**：child `.asar` 根 `package.json` 未保留 `undefined` 字段键。

**当前实现**（`src/pack/package-descriptor.js`）：

```js
function derivePackageDescriptor(buildInfo) {
    return {
        name: buildInfo.name,
        productName: buildInfo.productName,
        // ...
        platform: buildInfo.platform,    // undefined 时 JSON.stringify 会省略
        arch: buildInfo.arch,
        // ...
    };
}
```

`JSON.stringify(descriptor)` 会省略值为 `undefined` 的字段。设计 §10.5.1 要求保留这些键（值为 `undefined`），以便宿主区分 child 包与主应用 `.asax`。

**修复方案**：使用自定义 `JSON.stringify` replacer 或显式写 `null`：

```js
const descriptor = {};
for (const k of DESCRIPTOR_KEYS) {
    descriptor[k] = buildInfo[k] ?? null;  // undefined → null，保留键
}
fs.writeFileSync(p, JSON.stringify(descriptor, null, 2));
```

---

## 二、上次 P1 问题处理结果

### P1-4（未明确修复）

**原问题**：`dev:app` 未按 encrypt 开关派生 `encrypted` / `encryptKey`。

**当前实现**：`deriveBuildInfo(ctx, pkgJson)` 调用处未传入 `cryptoState`，`encrypted` 恒为 `false`。设计 §4.1 缺省值表要求 `dev:app` 下 encrypted 按 encrypt 开关。

**注**：`14c2bba` 未涉及此问题。需评估：`dev:app` 场景下是否真的需要 encryptKey 注入（main 进程在 dev 态通常不需要加密）？如不需要，此问题可关闭。

---

### P1-5（部分修复）

**原问题**：dispatcher 仅 `locate` 配置，未实际加载校验。

**当前修复**：`cli/index.js` 新增：

```js
if (cmd.needsBcConfig) locateBcConfig(process.cwd(), cliOptions.config);
if (cmd.needsBuilderConfig) locateBuilderConfig(process.cwd(), cliOptions.packConfig);
```

实现了 fail-fast（配置文件缺失立即报错），但仍不执行 `loadUserConfig` / `loadUserBuilderConfig`。配置存在但导出非函数、require 报错等问题仍推迟到 action 内部。

**如需完全修复**：在 locate 之后执行 `require(configPath)` 的初次加载验证（可捕获语法错误和导出类型错误）。

---

### P1-6（未修复）

**原问题**：`dev:web` SIGINT 未关闭 dev-server。

**当前实现**：仍为 `process.on('SIGINT', () => process.exit(0))`，未调用 `server.stop()`。

---

### P1-7（未修复）

**原问题**：`pack --unpack` 写 frame-state 失败时静默跳过。

**当前实现**：`pack.js` 第 89-107 行，`unpackedPath` 找不到时无 warn/error。

---

### P1-8（未修复）

**原问题**：logger 未在输出前统一 `spinner.clear()`。

**当前实现**：`logger.js` 各 API 未集成 `spinner.clear()`，仅局部调用。

---

### P1-9（未修复）

**原问题**：错误报告格式与 §12.5 不一致。

**当前实现**：`logger.error(cmd.name, err.message)`，缺少"失败："文案。

---

### P1-10（未修复）

**原问题**：`process.title` 缺少 `BC_ENV` 兜底。

**当前实现**：`process.title = bc-${cmd.name}|env=${env.BC_ENV}`，BC_ENV 缺失时显示 `env=undefined` 而非 `?`。

---

## 三、上次 P2 问题处理结果

| # | 问题 | 状态 |
|---|------|------|
| 11 | target 字面量未收敛到 `target.js` | 未修复，仍散布于 `bc-config.js`、`build-info.js` |
| 12 | `lodash` 为 dependencies 但零引用 | 未修复，仍为冗余依赖 |
| 13 | CLI 选项 `--pack-config` 重复注册 | 未修复，`pack.js`/`installer.js` 的 options 仍重复声明 |
| 14 | `index.js` 公共 API 导出极少 | 未修复 |
| 15 | 平台脚本模板仍为占位实现 | 未修复，`win-installer.nsh` 仅空宏，`deb-*.sh` 基础逻辑有但桌面快捷方式等未实现 |
| 16 | Icon 自适配未校验源图尺寸 | 未修复 |
| 17 | AES 密钥长度未校验 | **已修复**，`encrypt.js` 新增 `encryptKey.length < 32` 校验 |
| 18 | bytenode 运行时依赖未文档 | 未修复 |
| 19 | `TODOs.md` 与实现不同步 | 未修复 |
| 20 | 发布前必须先 `npm run build` | 未修复 |

---

## 四、新发现 / 回归问题

### 新-1：`buildInfoPlugin` 注入方式与设计相反

**描述**：P0-1 的"修复"将逐字段注入改为整体注入，测试也随之调整，但两者均与设计 §1.2 / §6.3 矛盾。这是一次"将错就错"的修复——使测试通过但背离设计。

**影响**：同构死代码消除可能失效，web bundle 可能包含 `require('electron')` 等 app 分支代码。

---

### 新-2：`encrypt.js` 逻辑变更导致默认行为改变

**原设计**（§5.1、§11.4）：`encrypt` 默认为 `true`；开启时密钥缺失抛错。

**新实现**：

```js
if (userConfig.encrypt === false) return { encrypted: false };
// 后续逻辑：无 else，密钥缺失直接抛错
```

这意味着 `encrypt: undefined`（未配置）和 `encrypt: true`（明确开启）行为相同——密钥缺失均抛错。这与设计一致，但测试用例 `test('encrypt 缺省且密钥缺失 → encrypted=false（不抛错；开关明确为 false 才报）')` 被删除或修改，可能存在测试覆盖缺口。

---

## 五、测试状态

| 套件 | 结果 | 说明 |
|------|------|------|
| `npm test` 总计 | 46 套件通过 / 1 套失败 | 197 通过 / 1 失败 |
| `e2e-dev-web.test.js` | **失败** | 端口 19099 `EADDRINUSE`；dev-server 常驻进程不 resolve（TDOs.md 已知问题） |

**所有其他套件均 PASS**——包括上次审阅中失败的 `presets-*.test.js`（因测试断言随实现调整了）。

---

## 六、建议修复优先级

| 优先级 | 项 | 建议 |
|--------|-----|------|
| **P0** | 新-1: buildInfoPlugin 注入方式 | 恢复逐字段注入 `__BC_BUILD__.<k>`，并统一测试断言 |
| **P0** | P0-3: child asar undefined 字段 | 用 `null` 或自定义 replacer 保留 undefined 键 |
| **P1** | P1-4: dev:app encrypt 派生 | 评估是否需要；如不需要则关闭此问题 |
| **P1** | P1-5: dispatcher 完全校验 | 初次加载验证（require 语法/导出类型） |
| **P1** | P1-6~10 | 补齐 dev:web shutdown、frame-state warn、logger 集成、错误格式、process.title 兜底 |
| **P2** | P2-11~16, 18~20 | 规范清理、模板补全、文档同步 |
| 测试 | E2E dev:web 端口占用 | 解决端口冲突或使用随机端口 |

---

*本报告由对照设计文档的静态审阅与 `npm test` 执行结果生成。*
