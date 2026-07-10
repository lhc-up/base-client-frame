# frame-fix-list 修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落实 `docs/superpowers/specs/frame-fix-list.md` 中 H1 / H2 / H4 / H5 / M1 / M2 六项 frame 侧修复，同步覆盖式更新相关设计文档章节；H3 不改（当前行为已符合预期），L1 视为 premise 陈旧、仅在 feedback-pool 里更状态。

**Architecture:**
- 每项修复独立 commit，互不阻塞（H1 与 M2 都改 `src/config/builder-config.js`，顺序化处理）
- 走 TDD：先补/改单元测试 → 跑测试观察 fail → 改实现 → 跑测试观察 pass → commit
- 文档-only 任务（H4 / H2 §13.2 / M2 §1.3 §5.2）以"覆盖式改写"落笔，不留旧结论对照痕迹（对齐 memory：feedback-frame-no-history-baggage）
- H5 引入前置 spike：写一次性验证脚本跑真实 webpack 编译，观察 DefinePlugin 同时定义基对象与子路径的行为，据此在两种实现方案中做选择

**Tech Stack:** Node.js 18+ / Jest 30 / webpack 5 / electron-builder / cac / picocolors

**任务依赖关系:**
- Task 1 (H2) / Task 2 (H4) / Task 4 (M1) / Task 5 (H5)：互相独立
- Task 3 (H1) 与 Task 6 (M2)：都改 `src/config/builder-config.js`；Task 3 先做，Task 6 后做
- Task 7 (善后)：依赖 Task 1-6 全部完成

**开工前一次性动作：**

- [ ] **Baseline: 跑一次完整测试确认起点绿**

```bash
cd D:/Desktop/npm/base-client-frame
npm test
```

Expected: 所有测试通过（`tests/unit/e2e-dev-web.test.js` 已知会 30s 超时挂掉——TODOs.md 已记录、非本轮范围；单跑其它 e2e 或用 `jest --testPathIgnorePatterns=e2e-dev-web` 均可确认基线）。

---

## Task 1: H2 · package.json peerDependencies + 设计文档 §13.2 同步

**Files:**
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-06-24-frame-design.md` §13.2（约行 1325-1347）

**背景**：`bytenode` 走 `resolveModule` 运行时才报缺失，install 时无 warning；`electron` / `electron-builder` 在设计文档 §13.2 声明为 peerDependencies 但 package.json 里未列。补齐 peer 契约，让 npm install 阶段就给用户提示。

- [ ] **Step 1.1: 覆盖式改写 package.json 的 peerDependencies 段**

打开 `package.json`，把当前 peerDependencies 段（第 20-23 行）替换为：

```json
    "peerDependencies": {
        "bytenode": "^1.4.0",
        "electron": "*",
        "electron-builder": "^24.0.0 || ^25.0.0 || ^26.0.0",
        "webpack": "^5.0.0",
        "webpack-dev-server": "^5.0.0"
    },
    "peerDependenciesMeta": {
        "bytenode": { "optional": true },
        "electron": { "optional": true },
        "electron-builder": { "optional": true }
    },
```

要点：
- `bytenode` 版本对齐 business 现用 `^1.4.0`
- `electron` 版本随项目走，不锁死（用 `*`）
- `electron-builder` 覆盖当前主流几个主版本
- optional 标记：这些 peer 只在特定命令下才需要（`bytenode` 只 pack 用；`electron` 只 dev:app 用；`electron-builder` 只 pack/installer 用），不启用相关命令的用户可以不装，避免 install 阶段的红字警告过噪

- [ ] **Step 1.2: 跑 install 干一次，观察 peer warning 出现**

```bash
cd D:/Desktop/npm/base-client-frame
npm install
```

Expected: install 完成，且日志里能看到与 `bytenode` / `electron` / `electron-builder` 相关的 peer optional 提示（frame 自己没装这些，若同时 devDeps 里也没有——`package.json` 里只 devDeps 装了 `html-webpack-plugin` / `jest` / `webpack` / `webpack-dev-server`，符合"peer 由用户装"的语义）。

若 install 报硬错、非 warning，回退并诊断（可能是版本约束太严）。

- [ ] **Step 1.3: 跑单元测试确认 install 变更没打断现有测试**

```bash
npm test -- --testPathIgnorePatterns=e2e-dev-web
```

Expected: 与 baseline 同色（不多 fail）。

- [ ] **Step 1.4: 覆盖式改写设计文档 §13.2**

打开 `docs/superpowers/specs/2026-06-24-frame-design.md`，定位到 §13.2（约行 1325）。把整段 §13.2 替换为下面内容（**直接覆盖，不保留旧结论对照**）：

```markdown
### 13.2 包依赖

**dependencies**（运行时需要）：

- `cac`：CLI 解析
- `dotenv`：`.env` 文件解析
- `fs-extra`：`emptyDirSync` 等文件操作
- `ora`：编译 spinner
- `picocolors`：极简 ANSI 上色
- `@electron/asar`：增量 `.asax` / child `.asar` 打包
- `webpack-merge`：bc.config 合并 + customMerge 基础
- `jimp` / `png2icons`：icon 自适配

**peerDependencies**（用户项目提供，`peerDependenciesMeta.optional` 标记按命令按需）：

| 包 | 用途 | 何时必需 |
|---|---|---|
| `webpack` | 编译核心 | 所有跑 webpack 的命令 |
| `webpack-dev-server` | dev 命令 dev-server | `dev:app` / `dev:web` |
| `electron` | Electron 主进程 | `dev:app` |
| `electron-builder` | 安装包封装 | `pack` / `installer` |
| `bytenode` | 主进程字节码 | `pack` 且 `bc.config.bytenode !== false` |

`electron` / `electron-builder` / `bytenode` 不在 frame 的 dependencies——按需从用户项目 `node_modules` 解析、版本随项目走、frame 不锁定。`peerDependenciesMeta.optional` 让 npm install 阶段不因未启用相应命令而红字。
```

要点：
- 删掉了旧文档里 `lodash`（已在 review 阶段卸载）与 `字节码库：bytenode（plan 阶段确认依赖位置）`（本轮已确认走 peerDependencies）
- 删掉了 `icon 适配库：plan 阶段从 sharp / png2icons / png-to-ico 中选定`（已定为 jimp+png2icons，同步硬化）
- 将四个 peerDeps 从散列改为表格，明示"何时必需"，与 `peerDependenciesMeta.optional` 语义呼应

- [ ] **Step 1.5: 目视校对 §13.2 无格式错乱**

用 Read 或编辑器打开 `docs/superpowers/specs/2026-06-24-frame-design.md`，跳到 §13.2 附近，确认：
- 表格渲染正确（列对齐）
- 与 §13.1 / §13.3 之间的空行结构没被破坏

- [ ] **Step 1.6: commit**

```bash
git add package.json docs/superpowers/specs/2026-06-24-frame-design.md
git commit -m "feat：H2 补 peerDependencies（bytenode / electron / electron-builder），同步设计文档 §13.2。"
```

---

## Task 2: H4 · 设计文档 §7.1 立"dev-app 运行时 env 契约"专题

**Files:**
- Modify: `docs/superpowers/specs/2026-06-24-frame-design.md` §7.1（约行 566-623）

**背景**：`RENDERER_DEV_URL` / `NODE_ENV` 的注入契约现已散落在 §7.1 流程描述与 recipe 里，用户容易漏看。本 Task 只调文档结构——把契约提取成显眼的独立小节。frame 侧代码零改动。

- [ ] **Step 2.1: 定位并覆盖式改写 §7.1 中的 env 相关段落**

打开 `docs/superpowers/specs/2026-06-24-frame-design.md`，定位到 §7.1 dev:app（约行 566）。在流程伪代码之后、"main / preload 默认不 watch"说明之前，**插入**一节 §7.1.1 作为"dev-app 运行时 env 契约"（原有的"渲染入口加载约定"recipe 保留不动，位置往下推）。

具体操作：找到 §7.1 里现有的这段"渲染入口加载约定"（约行 605-613）：

```markdown
**渲染入口加载约定**（用户主进程代码自行选择，frame 不提供运行时对象）：

​```js
if (process.env.NODE_ENV === 'development') {
    win.loadURL(process.env.RENDERER_DEV_URL);
} else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
}
​```
```

**在其之前**（"`host` / `port` 三级优先级"段落之后、"渲染入口加载约定"之前）**插入**下面新增小节：

```markdown
#### 7.1.1 dev-app 运行时 env 契约

dev:app 起 Electron 子进程时，`cp.spawn` 的 `env` 字段追加下列变量，作为 frame → 用户主进程的**运行时契约**。字段名与语义稳定，**变更前先在本节公告**：

| 变量 | 值 | 语义 |
|---|---|---|
| `NODE_ENV` | `'development'` | dev-app 恒为 development；用户据此走 dev 分支加载 |
| `RENDERER_DEV_URL` | 完整 URL（含协议、host、port，如 `http://localhost:8023`） | renderer webpack-dev-server 的访问地址，主进程 `loadURL` 用 |

**为什么不导出 runtime helper**：这两个变量足够简单，包一层 `require('@base-client/frame/runtime').getRendererDevUrl()` 反而增加 frame 的对外面。若未来需要跨命令共享 runtime 常量再重启这个讨论。

**未来新增变量流程**：先补入本节表格 + 明确稳定性承诺，再落地 CLI 侧的注入代码。
```

- [ ] **Step 2.2: 目视校对**

Read `docs/superpowers/specs/2026-06-24-frame-design.md` 的 §7.1 全段（新旧内容拼接后），确认：
- §7.1.1 表格渲染正确
- 后续"渲染入口加载约定" recipe 未被破坏
- §7.1 → §7.1.1 → §7.2 层级正确

- [ ] **Step 2.3: commit**

```bash
git add docs/superpowers/specs/2026-06-24-frame-design.md
git commit -m "docs：H4 立 §7.1.1 dev-app 运行时 env 契约专题（RENDERER_DEV_URL / NODE_ENV）。"
```

---

## Task 3: H1 · electron-builder.config 兼容对象式导出

**Files:**
- Modify: `src/config/builder-config.js`（`loadUserBuilderConfig` 函数，约行 22-29）
- Modify: `tests/unit/config/builder-config.test.js`（补测试）

**背景**：`electron-builder` 官方允许 config 文件导出对象或函数，frame 当前强制函数式（`typeof fn !== 'function'` 直接抛错）。放开为兼容对象式；错误消息同步更新。**bc.config 保持函数式不动**（frame 自定契约，ctx 感知是刻意为之）。

- [ ] **Step 3.1: 补一条失败测试——用户导出对象时应正确加载**

打开 `tests/unit/config/builder-config.test.js`，在 `beforeAll` 之后追加一个 fixture 生成 + 追加一个测试用例：

在 `beforeAll` 段（约行 8-19）里追加对象式 fixture：

```js
beforeAll(() => {
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(path.join(fixtureDir, 'electron-builder.config.js'), `
        module.exports = ({ env, cliOptions, replace }) => ({
            appId: 'com.demo.app',
            win: {
                certificateFile: cliOptions.sign ? 'build/cert.pfx' : undefined,
            },
            files: replace(['package.json', '!**/node_modules/**']),
        });
    `);
    // 对象式 fixture（H1 新增）
    fs.writeFileSync(path.join(fixtureDir, 'electron-builder.config.object.js'), `
        module.exports = {
            appId: 'com.demo.object',
            productName: 'Demo Object',
        };
    `);
});
```

在 `describe('config/builder-config', () => { ... })` 内追加：

```js
    test('用户 electron-builder.config 导出对象式时正确加载', () => {
        const c = resolveBuilderConfig(
            ctx({ cliOptions: { platform: 'win', arch: 'x64', packConfig: path.join(fixtureDir, 'electron-builder.config.object.js') } }),
            pkgJson,
        );
        expect(c.appId).toBe('com.demo.object');
        // 对象式导出无法用 replace()，preset 的 files 应按 customMerge 默认（追加）规则保留
        expect(Array.isArray(c.files)).toBe(true);
    });
```

- [ ] **Step 3.2: 跑测试确认新用例 fail**

```bash
cd D:/Desktop/npm/base-client-frame
npx jest tests/unit/config/builder-config.test.js -t "对象式"
```

Expected: FAIL，报错含"electron-builder.config 必须导出函数 (ctx) => config"。

- [ ] **Step 3.3: 改 loadUserBuilderConfig 支持对象式**

打开 `src/config/builder-config.js`，将 `loadUserBuilderConfig`（约行 22-29）覆盖式替换为：

```js
function loadUserBuilderConfig(configPath, ctx) {
    const loaded = require(configPath);
    const raw = loaded.default ?? loaded;
    if (typeof raw === 'function') {
        return raw({ ...ctx, replace }) || {};
    }
    if (raw && typeof raw === 'object') {
        return raw;
    }
    throw new Error(`[base-client] electron-builder.config 必须导出对象或 (ctx) => config 函数，收到：${typeof raw}`);
}
```

- [ ] **Step 3.4: 跑同一测试确认 pass，并回归全部 builder-config 测试**

```bash
npx jest tests/unit/config/builder-config.test.js
```

Expected: 全部 pass（含新增的"对象式"测试与原有 6 条）。

- [ ] **Step 3.5: commit**

```bash
git add src/config/builder-config.js tests/unit/config/builder-config.test.js
git commit -m "feat：H1 electron-builder.config 兼容对象式导出，对齐 electron-builder 官方约定。"
```

---

## Task 4: M1 · pack / installer 缺 --platform / --arch 时用宿主兜底

**Files:**
- Modify: `src/electron/build-targets.js`（`buildTargets` 函数）
- Modify: `tests/unit/electron/build-targets.test.js`（补测试）

**背景**：`buildTargets({platform})` 缺 platform / arch 时直接抛错。改为用 `process.platform` / `process.arch` 兜底，逼近 electron-builder 原生行为（默认宿主）。logger.info 告知用户默认值来源，方便回溯。

平台映射：`win32 → win`，`darwin → mac`，`linux → linux`；未识别的宿主平台（如 freebsd）继续抛"不支持的平台"。arch 直接透传 `process.arch`；若透传值不在 `ARCH_LIST` 里，继续抛"不支持的架构"。

- [ ] **Step 4.1: 补失败测试——缺 platform / arch 时用宿主兜底**

打开 `tests/unit/electron/build-targets.test.js`，在 `describe('electron/build-targets', ...)` 块末尾追加：

```js
    describe('宿主兜底（M1）', () => {
        let originalPlatform;
        let originalArch;

        beforeEach(() => {
            originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            originalArch = Object.getOwnPropertyDescriptor(process, 'arch');
        });
        afterEach(() => {
            Object.defineProperty(process, 'platform', originalPlatform);
            Object.defineProperty(process, 'arch', originalArch);
        });

        test('缺 platform + 宿主 win32 → 默认 win', () => {
            Object.defineProperty(process, 'platform', { value: 'win32' });
            Object.defineProperty(process, 'arch', { value: 'x64' });
            expect(buildTargets({})).toEqual({ win: ['nsis'], x64: true });
        });

        test('缺 platform + 宿主 darwin → 默认 mac', () => {
            Object.defineProperty(process, 'platform', { value: 'darwin' });
            Object.defineProperty(process, 'arch', { value: 'arm64' });
            expect(buildTargets({})).toEqual({ mac: ['dmg'], arm64: true });
        });

        test('缺 platform + 宿主 linux → 默认 linux', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            Object.defineProperty(process, 'arch', { value: 'x64' });
            expect(buildTargets({})).toEqual({ linux: ['deb'], x64: true });
        });

        test('缺 platform + 宿主是不受支持的 freebsd → 抛错', () => {
            Object.defineProperty(process, 'platform', { value: 'freebsd' });
            Object.defineProperty(process, 'arch', { value: 'x64' });
            expect(() => buildTargets({})).toThrow(/不支持的平台/);
        });

        test('缺 arch → 默认宿主 arch', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            Object.defineProperty(process, 'arch', { value: 'arm64' });
            expect(buildTargets({ platform: 'linux' })).toEqual({ linux: ['deb'], arm64: true });
        });

        test('缺 arch + 宿主 arch 不在白名单 → 抛错', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            Object.defineProperty(process, 'arch', { value: 'mips' });
            expect(() => buildTargets({ platform: 'linux' })).toThrow(/不支持的架构/);
        });

        test('用户显式 --platform 覆盖宿主兜底', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            Object.defineProperty(process, 'arch', { value: 'x64' });
            expect(buildTargets({ platform: 'win', arch: 'x64' })).toEqual({ win: ['nsis'], x64: true });
        });
    });
```

**同时需要移除**顶部 describe 块里原有的两条 "缺 platform → 抛错" / "缺 arch → 抛错"（约行 20-30）——语义变了。改为如下：

```js
    // 兜底逻辑改到"宿主兜底"子 describe，此处删除缺 platform / 缺 arch 的抛错断言（M1 语义变了）
```

（其实就是直接**删掉**原来的 line 20-30 那两个 `test('缺 platform → 抛错', ...)` 和 `test('缺 arch → 抛错', ...)`。unknown platform / arch 的抛错断言保留。）

- [ ] **Step 4.2: 跑测试确认新用例 fail、原兜底路径 fail、unknown 路径 pass**

```bash
npx jest tests/unit/electron/build-targets.test.js
```

Expected: 新增的 M1 用例全部 fail（现在还没有实现），其余 pass。

- [ ] **Step 4.3: 改 buildTargets 实现宿主兜底 + logger.info**

打开 `src/electron/build-targets.js`，将 `buildTargets` 函数（约行 4-13）覆盖式替换为：

```js
const logger = require('../core/logger');

const PLATFORM_MAP = { win: ['nsis'], mac: ['dmg'], linux: ['deb'] };
const ARCH_LIST = ['ia32', 'x64', 'armv7l', 'arm64', 'universal', 'loong64'];

const HOST_PLATFORM_MAP = { win32: 'win', darwin: 'mac', linux: 'linux' };

function buildTargets({ platform, arch, dir }) {
    let resolvedPlatform = platform;
    if (!resolvedPlatform) {
        resolvedPlatform = HOST_PLATFORM_MAP[process.platform];
        if (!resolvedPlatform) {
            throw new Error(`[base-client] 不支持的平台：宿主 ${process.platform} 未映射；请显式传 --platform`);
        }
        logger.info(`--platform 未指定，使用宿主 ${resolvedPlatform}`);
    }
    if (!PLATFORM_MAP[resolvedPlatform]) throw new Error(`[base-client] 不支持的平台：${resolvedPlatform}`);

    let resolvedArch = arch;
    if (!resolvedArch) {
        resolvedArch = process.arch;
        logger.info(`--arch 未指定，使用宿主 ${resolvedArch}`);
    }
    if (!ARCH_LIST.includes(resolvedArch)) throw new Error(`[base-client] 不支持的架构：${resolvedArch}`);

    return {
        [resolvedPlatform]: dir ? ['dir'] : PLATFORM_MAP[resolvedPlatform],
        [resolvedArch]: true,
    };
}
```

顶部 `require('../core/logger')` 若与既有 import 顺序冲突就调整；文件目前没有其它 require，直接加到顶部即可。

- [ ] **Step 4.4: 跑测试确认全部 pass**

```bash
npx jest tests/unit/electron/build-targets.test.js
```

Expected: 所有测试 pass，包括宿主兜底 7 条 + unknown 抛错 2 条 + computeUnpackedDir 段全部。

- [ ] **Step 4.5: 跑一次全库测试防回归**

```bash
npm test -- --testPathIgnorePatterns=e2e-dev-web
```

Expected: 无新增 fail。若命中 `cli/commands-pack` / `commands-installer` 相关 e2e 测试变红，读一下断言看是否需要跟着放宽——多半不用（这些 e2e 都是命令契约的 shallow assertion）。

- [ ] **Step 4.6: commit**

```bash
git add src/electron/build-targets.js tests/unit/electron/build-targets.test.js
git commit -m "feat：M1 pack/installer 缺 --platform/--arch 时用宿主兜底，logger.info 告知。"
```

---

## Task 5: H5 · buildInfoPlugin 补基对象 define（含 webpack 冲突验证 spike）

**Files:**
- Create（临时）: `scripts/spike-define-plugin-conflict.js`（spike 脚本，验证完删掉）
- Modify: `src/config/presets/build-info-plugin.js`
- Modify: `tests/unit/config/presets-build-info-plugin.test.js`

**背景**：当前 `buildInfoPlugin` 只 define `__BC_BUILD__.<k>` 单键，用户写 `typeof __BC_BUILD__ !== 'undefined'` 会走 undefined 分支——因为 webpack DefinePlugin 只做字面匹配，`typeof __BC_BUILD__` 里的裸标识符 `__BC_BUILD__` 不匹配任何单键 def。

修法：额外定义基对象 `__BC_BUILD__` 为完整 buildInfo 的 JSON.stringify。**但 webpack DefinePlugin 同时定义 `A` 和 `A.b` 时是否会 warn 冲突**——文档表述不完全清晰，需 spike 验证。

### 5A. Spike：验证 DefinePlugin 同时定义基对象与子键

- [ ] **Step 5.1: 写 spike 脚本**

新建 `scripts/spike-define-plugin-conflict.js`：

```js
// 一次性 spike：验证 webpack DefinePlugin 同时定义 '__BC_BUILD__' 与 '__BC_BUILD__.foo' 时是否 warn / error。
// 运行：node scripts/spike-define-plugin-conflict.js
// 验证完删除此文件。

const path = require('path');
const fs = require('fs');
const os = require('os');
const webpack = require('webpack');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-spike-'));
const entryPath = path.join(tmp, 'entry.js');
fs.writeFileSync(entryPath, `
    if (typeof __BC_BUILD__ !== 'undefined') {
        console.log('BASE:', __BC_BUILD__);
        console.log('FOO :', __BC_BUILD__.foo);
        console.log('BAR :', __BC_BUILD__.bar);
    } else {
        console.log('UNDEF');
    }
`);

const outDir = path.join(tmp, 'out');

const buildInfo = { foo: 'hello', bar: 42 };

webpack({
    mode: 'production',
    entry: entryPath,
    output: { path: outDir, filename: 'bundle.js' },
    optimization: { minimize: false },
    plugins: [
        new webpack.DefinePlugin({
            '__BC_BUILD__': JSON.stringify(buildInfo),
            '__BC_BUILD__.foo': JSON.stringify(buildInfo.foo),
            '__BC_BUILD__.bar': JSON.stringify(buildInfo.bar),
        }),
    ],
}, (err, stats) => {
    if (err) {
        console.error('BUILD ERROR:', err);
        process.exit(1);
    }
    const info = stats.toJson({ warnings: true, errors: true, source: false });
    console.log('--- ERRORS ---');
    console.log(info.errors);
    console.log('--- WARNINGS ---');
    console.log(info.warnings);
    console.log('--- BUNDLE ---');
    console.log(fs.readFileSync(path.join(outDir, 'bundle.js'), 'utf8'));
    fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 5.2: 跑 spike 观察结果**

```bash
cd D:/Desktop/npm/base-client-frame
node scripts/spike-define-plugin-conflict.js
```

**观察三类信息**：
- **errors** 是否为空数组
- **warnings** 是否含 "Conflicting values" 之类的字样
- **bundle** 里 `if (typeof __BC_BUILD__ !== 'undefined')` / `__BC_BUILD__.foo` / `__BC_BUILD__.bar` / `console.log(__BC_BUILD__)` 各自被替换成了什么

**判定分支**：

- **分支 A · 无 warning 且替换正确**（预期 90% 概率）：`typeof` 被替换为 `typeof {...}` 或 `typeof "object"`，`.foo` 被替换成子键值——理想情况，按下方 5B 用双 define 实现。
- **分支 B · webpack 报 warning 但仍生效**：仍按 5B 实现，但在 buildInfoPlugin 里加一句注释解释"webpack 会 warn 冲突但功能正确，忽略"。
- **分支 C · webpack 报 error 或替换错误**（低概率）：退化实现——**只保留基对象 define**（`'__BC_BUILD__': JSON.stringify(baseObj)`），删除所有 `__BC_BUILD__.<k>` 单键 def。牺牲 tree-shaking 精度（webpack DCE 拿不到字面量单值），换 `typeof` 支持。用户写 `if (__BC_BUILD__.target === 'app')` 仍然工作（webpack 对象访问替换 + terser DCE 生效）。

- [ ] **Step 5.3: 记录 spike 结论**

在 plan 文件底部（或本 Task 末尾）临时补一行"spike 结论：分支 X 生效"，方便 Task 5B 选择实现。**这是临时笔记，Task 7 善后时清掉本行**。

- [ ] **Step 5.4: 删除 spike 脚本**

```bash
rm scripts/spike-define-plugin-conflict.js
```

（`scripts/` 目录本身保留——里面还有 `scripts` 下其他脚本，`rmdir` 不必。）

### 5B. 落实修法（按 5A 分支结论）

**假设走分支 A / B（双 define 生效）**——绝大多数概率的路径。若 spike 落到分支 C，把下面步骤的 buildInfoPlugin 实现改为"只留基对象 def"，测试断言相应调整。

- [ ] **Step 5.5: 补失败测试——buildInfoPlugin 应同时 define 基对象**

打开 `tests/unit/config/presets-build-info-plugin.test.js`，在 `describe` 块末尾追加：

```js
    test('同时定义基对象 __BC_BUILD__（支撑 typeof 判断）', () => {
        const plugin = buildInfoPlugin({ target: 'web', version: '1.0.0', encrypted: false });
        expect(plugin.definitions).toHaveProperty('__BC_BUILD__');
        // 基对象定义是完整 buildInfo 的 JSON.stringify
        const base = JSON.parse(plugin.definitions['__BC_BUILD__']);
        expect(base).toEqual({ target: 'web', version: '1.0.0', encrypted: false });
    });

    test('基对象定义默认剔除 encryptKey', () => {
        const plugin = buildInfoPlugin({ target: 'app', version: '1.0.0', encryptKey: 'secret' });
        const base = JSON.parse(plugin.definitions['__BC_BUILD__']);
        expect(base).not.toHaveProperty('encryptKey');
    });

    test('includeEncryptKey:true 时基对象也含 encryptKey', () => {
        const plugin = buildInfoPlugin(
            { target: 'app', version: '1.0.0', encryptKey: 'secret' },
            { includeEncryptKey: true },
        );
        const base = JSON.parse(plugin.definitions['__BC_BUILD__']);
        expect(base.encryptKey).toBe('secret');
    });
```

- [ ] **Step 5.6: 跑测试确认新用例 fail**

```bash
npx jest tests/unit/config/presets-build-info-plugin.test.js -t "基对象"
```

Expected: FAIL，报错 `to have property '__BC_BUILD__'` 之类。

- [ ] **Step 5.7: 改 buildInfoPlugin 加基对象 define**

打开 `src/config/presets/build-info-plugin.js`，覆盖式替换为：

```js
const webpack = require('webpack');

function buildInfoPlugin(buildInfo, { includeEncryptKey = false } = {}) {
    const defs = {};
    const baseObj = {};
    for (const [k, v] of Object.entries(buildInfo)) {
        if (k === 'encryptKey' && !includeEncryptKey) continue;
        defs[`__BC_BUILD__.${k}`] = JSON.stringify(v);
        baseObj[k] = v;
    }
    // 基对象定义：支撑用户 `typeof __BC_BUILD__ !== 'undefined'` 判断
    defs['__BC_BUILD__'] = JSON.stringify(baseObj);
    return new webpack.DefinePlugin(defs);
}

module.exports = { buildInfoPlugin };
```

- [ ] **Step 5.8: 跑单元测试确认全部 pass**

```bash
npx jest tests/unit/config/presets-build-info-plugin.test.js
```

Expected: 全 pass（含新增 3 条 + 原有 5 条）。

- [ ] **Step 5.9: 跑一次全库测试防回归**

```bash
npm test -- --testPathIgnorePatterns=e2e-dev-web
```

Expected: 无新增 fail。特别留意 `presets-main` / `presets-preload` / `presets-renderer` / `presets-web` 是否有对 `plugin.definitions` 精确匹配的断言（若有，需同步补上基对象 key 的期望）。

- [ ] **Step 5.10: commit**

```bash
git add src/config/presets/build-info-plugin.js tests/unit/config/presets-build-info-plugin.test.js
git commit -m "feat：H5 buildInfoPlugin 补基对象 __BC_BUILD__ define，用户 typeof __BC_BUILD__ 判断可靠。"
```

---

## Task 6: M2 · pack / installer 反向注入 directories.output = 'dist'

**Files:**
- Modify: `src/config/builder-config.js`（`resolveBuilderConfig`）
- Modify: `tests/unit/config/builder-config.test.js`（补测试）
- Modify: `docs/superpowers/specs/2026-06-24-frame-design.md` §1.3 / §5.2 中"dist 目录约定"的措辞

**背景**：设计文档 §1.3 声明"`dist/` 全部归此"，但当前实现允许用户在 `electron-builder.config.js` 里改 `directories.output`，破坏与 frame 内部 `dist/` 写点的一致性（icon / shell / .asax / emptyDirSync）。选择"方向 1 固化约定"：`resolveBuilderConfig` 出口反向注入 `directories.output = 'dist'`，用户显式改过就 warn 后覆盖。frame 内部所有 `dist/` 字面量不动。

- [ ] **Step 6.1: 补失败测试——用户配 directories.output 非 dist 时被覆盖 + warn**

打开 `tests/unit/config/builder-config.test.js`，在 `beforeAll` 段追加对象式 output 覆盖 fixture：

```js
    // M2 fixture：用户显式改 directories.output
    fs.writeFileSync(path.join(fixtureDir, 'electron-builder.config.custom-output.js'), `
        module.exports = () => ({
            appId: 'com.demo.custom',
            directories: { output: 'pack' },
        });
    `);
```

在 `describe` 块末尾追加：

```js
    describe('directories.output 归位（M2）', () => {
        let warnSpy;
        beforeEach(() => {
            const logger = require('../../../src/core/logger');
            warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        });

        test('用户未配 → 采用 preset 默认 dist', () => {
            const c = resolveBuilderConfig(ctx(), pkgJson);
            expect(c.directories.output).toBe('dist');
            expect(warnSpy).not.toHaveBeenCalled();
        });

        test('用户显式配 dist（与约定一致）→ 保持 dist、不 warn', () => {
            // 直接复用主 fixture（默认加载 electron-builder.config.js，未配 directories.output，preset 补 dist）
            const c = resolveBuilderConfig(ctx(), pkgJson);
            expect(c.directories.output).toBe('dist');
            expect(warnSpy).not.toHaveBeenCalled();
        });

        test('用户显式配非 dist（如 pack）→ 覆盖回 dist 并 logger.warn', () => {
            const c = resolveBuilderConfig(
                ctx({ cliOptions: { platform: 'win', arch: 'x64', packConfig: path.join(fixtureDir, 'electron-builder.config.custom-output.js') } }),
                pkgJson,
            );
            expect(c.directories.output).toBe('dist');
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringMatching(/directories\.output.*pack.*dist/),
            );
        });
    });
```

- [ ] **Step 6.2: 跑测试确认新用例 fail**

```bash
npx jest tests/unit/config/builder-config.test.js -t "directories.output 归位"
```

Expected: 前两条 pass（现有实现刚好符合），第三条 FAIL（当前 customMerge 允许用户覆盖）。

- [ ] **Step 6.3: 在 resolveBuilderConfig 里加 enforceDistOutput 步骤**

打开 `src/config/builder-config.js`，在文件顶部 require 段追加 logger import：

```js
const logger = require('../core/logger');
```

将 `resolveBuilderConfig` 函数（约行 36-40）覆盖式替换为：

```js
function enforceDistOutput(mergedConfig) {
    const cur = mergedConfig.directories?.output;
    if (cur && cur !== 'dist') {
        logger.warn(`electron-builder.config.directories.output 被显式配置为 "${cur}"，但 frame 强制使用 "dist"（设计约定，见 frame-design.md §1.3）；已覆盖回 "dist"。`);
    }
    mergedConfig.directories = { ...(mergedConfig.directories || {}), output: 'dist' };
}

function resolveBuilderConfig(ctx, pkgJson) {
    const userConfig = ctx.userBuilderConfig ?? loadUserBuilderConfig(locateBuilderConfig(process.cwd(), ctx.cliOptions.packConfig), ctx);
    const preset = getPackPreset(ctx, pkgJson);
    const merged = customMerge(preset, userConfig);
    enforceDistOutput(merged);
    return merged;
}
```

- [ ] **Step 6.4: 跑测试确认全 pass**

```bash
npx jest tests/unit/config/builder-config.test.js
```

Expected: 全 pass，含新增 3 条与原有 6 条 + Task 3 补的 1 条对象式测试。

- [ ] **Step 6.5: 覆盖式更新设计文档 §1.3 表格里"最终产物"行**

打开 `docs/superpowers/specs/2026-06-24-frame-design.md`，定位 §1.3 表格（约行 31-43）里"最终产物"这一行：

```markdown
| 最终产物 | `dist/` 全部归此（含 web 静态资源 / 安装包 / .asax / .asar / 状态文件） | 两端 | — |
```

替换为：

```markdown
| 最终产物 | `dist/` 全部归此（含 web 静态资源 / 安装包 / .asax / .asar / 状态文件）；**frame 强制**——用户在 `electron-builder.config` 里配 `directories.output` 非 `dist` 会被 frame 覆盖并 warn | 两端 | — |
```

- [ ] **Step 6.6: 覆盖式更新设计文档 §5.2 electron-builder.config 段落**

打开 `docs/superpowers/specs/2026-06-24-frame-design.md`，定位 §5.2 段落里的 example 之下、"ctx 字段"表之上。在 example 之后**追加**一小段说明：

```markdown
**`directories.output` 归位**：`resolveBuilderConfig` 出口强制 `directories.output = 'dist'`（frame 内部 icon / shell / .asax / emptyDirSync 都写 `dist/`，若允许用户改会与其它写点割裂）。用户在 `electron-builder.config.js` 里配非 `dist` 值时，frame logger.warn 后覆盖回 `dist`。若未来需要放开产物目录名，会同时改造 frame 所有 dist 写点走同一真相源，届时更新本节。
```

（如果 §5.2 里没有明显合适的插入点，就把这一段作为独立子节 §5.2.1 追加在 §5.2 末尾、§5.3 之前。）

- [ ] **Step 6.7: 跑一次全库测试防回归**

```bash
npm test -- --testPathIgnorePatterns=e2e-dev-web
```

Expected: 无新增 fail。

- [ ] **Step 6.8: commit**

```bash
git add src/config/builder-config.js tests/unit/config/builder-config.test.js docs/superpowers/specs/2026-06-24-frame-design.md
git commit -m "feat：M2 反向注入 directories.output=dist，用户显式改非 dist 值时 warn 覆盖；同步 §1.3 §5.2 文档。"
```

---

## Task 7: 善后 · feedback-pool 状态迁移 + 删除 frame-fix-list.md + iteration-design 补记

**Files:**
- Modify: `docs/feedback-pool.md`
- Modify: `docs/superpowers/specs/2026-07-08-frame-integration-iteration-design.md`（可选，新增 F-05 及以后编号，看当前 iteration-design 是否有编号池约定）
- Delete: `docs/superpowers/specs/frame-fix-list.md`

**背景**：本轮 6 条修复完成后：
- fix-list.md 是一次性任务清单，不是活文档，直接删
- feedback-pool.md 里的 FB-XXX 迁移到 §3 Accepted，附本轮 commit sha
- iteration-design 里若沿用 F-XX 编号池，本轮修复挂新编号（如 F-05..F-10）；若不沿用则跳过

先看 pool 结构确认迁移格式。

- [ ] **Step 7.1: 读 feedback-pool.md 现状**

```bash
cd D:/Desktop/npm/base-client-frame
```

用 Read 打开 `docs/feedback-pool.md`，看 §1 / §2 / §3 三段的实际结构与既有条目格式。

- [ ] **Step 7.2: 迁移 FB-001**

将 FB-001（"F-doc 声明与代码不一致：preset 未删的 asset/resource rules"）**直接从 §2 移除**——premise 已陈旧（F-01 已落地）。若 §3 有"rejected"分节就迁到那里附一句"F-01 已落地、premise 陈旧"；若只有"accepted"就直接删掉 FB-001 条目。**不留"曾经存在过"的痕迹**（对齐 no-history-baggage 原则）。

- [ ] **Step 7.3: 迁移 FB-002 / FB-004 / FB-005 / FB-006（已确认 confirmed → accepted）**

将 FB-002（H1）/ FB-004（H2）/ FB-005（M1）/ FB-006（M2）从 §2 迁移到 §3 Accepted。每条附一行：

```
FB-XXX（H1）· 迁自 2026-07-10 · commit <sha>
```

`<sha>` 用 Task 3 / Task 1 / Task 4 / Task 6 的 commit 短 sha（`git log --oneline -6` 可查）。

- [ ] **Step 7.4: 升级并迁移 FB-007 / FB-008（原 pending → accepted）**

FB-007（H4）/ FB-008（H5）在 fix-list §0.1 里说"pending，用户尚未 confirm"；本轮 review 属于用户口头 confirm 的动作。**直接**从 §1 Pending 迁移到 §3 Accepted（跳过 §2 Confirmed 这一步），附行注类似 Step 7.3。

- [ ] **Step 7.5: FB-003 归档（H3 不修）**

FB-003（pack 默认加密缺 fallback）本轮结论"当前行为符合预期，不修"。从 §2 Confirmed **删除**（对齐 no-history-baggage）。若 pool 惯例保留 rejected 记录，就迁到 §3 rejected 子节附一句"当前行为符合预期，用户可用 `encrypt: false` 显式关闭"。

- [ ] **Step 7.6: 删除 frame-fix-list.md**

```bash
rm docs/superpowers/specs/frame-fix-list.md
```

- [ ] **Step 7.7: iteration-design 编号池（可选）**

打开 `docs/superpowers/specs/2026-07-08-frame-integration-iteration-design.md`，看 §2/§3 F-XX 表是否需要挂本轮 6 项。若沿用编号池，就按已有 F-01..F-04 表结构追加 F-05..F-10（编号顺序：H1→F-05, H2→F-06, H4→F-07, H5→F-08, M1→F-09, M2→F-10）。若 iteration-design 定位是"接入沙盘触发的迭代项"、本轮 fix-list 已经是次一级视图，就跳过本步骤。

- [ ] **Step 7.8: commit 善后**

```bash
git add docs/feedback-pool.md docs/superpowers/specs/2026-07-08-frame-integration-iteration-design.md
git rm docs/superpowers/specs/frame-fix-list.md
git commit -m "docs：H1/H2/H4/H5/M1/M2 修复完成，pool 状态迁移至 accepted；删除 fix-list 任务清单。"
```

- [ ] **Step 7.9: 端到端验证清单（本地跑一遍）**

fix-list §4 定义的 10 项 E2E 验证清单本轮无法在 frame 侧本仓库跑完（依赖 client-project 沙盘）；把这份清单**原样拷贝到最终 commit message 之外的地方**——比如作为一条 GitHub issue、或者放到 `client-project` 侧的下一轮验证任务里。frame 本仓库跑：

```bash
npm test -- --testPathIgnorePatterns=e2e-dev-web
```

Expected: 全绿（等于 baseline 状态 + 新增单测）。

---

## 完成后自查

- [ ] 6 条修复（H1/H2/H4/H5/M1/M2）各有独立 commit + 单测覆盖（H4 仅文档除外）
- [ ] 设计文档 §1.3 / §5.2 / §7.1 / §7.1.1 / §13.2 均已覆盖式更新，无旧结论对照残留
- [ ] `docs/superpowers/specs/frame-fix-list.md` 已删
- [ ] `docs/feedback-pool.md` FB-001..FB-008 状态已到位（accepted / rejected / 删除）
- [ ] `npm test -- --testPathIgnorePatterns=e2e-dev-web` 绿

沙盘（client-project）侧的回归动作：
- `src/main/index.js` 的 `BC_RENDERER_PORT` 改为读 `RENDERER_DEV_URL`（H4 契约新公开）
- `electron-builder.config.js` 如显式配了 `directories.output` 非 `'dist'`，去掉（M2 会 warn 覆盖，去掉更干净）
- `package.json.scripts.pack / installer` 里的 `--platform win --arch x64` 可移除（M1 宿主兜底）
- `bc.config.js` 里的 `encrypt: false` 保留（H3 不修，仍需显式关）
- `electron-builder.config.js` 若为对象式导出也 OK（H1 兼容）
- 需自跑 fix-list §4 的 10 项 E2E 清单确认闭环
