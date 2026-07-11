# Frame Fix-List 第二轮 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一次落地 frame-fix-list 第二轮 9 条修复（H1/H2/H3 + M1/M2/M3/M4 + L1/L2），使 client-project 侧的 pool §2 Confirmed 全部闭环。

**Architecture:** 按 spec §5 分 3 批：H 类阻断先修 → M 源码类 → L1 观测 + M3 文档 + L2 --help。每条一 commit（TDD：改现有测试 → 让它失败 → 改源码 → 全绿 → 提交）。全部落地跑 fix-list §4 端到端验证清单。

**Tech Stack:** Node.js / CommonJS / jest / picocolors / webpack / webpack-dev-server / cac / fs-extra。缩进 4 空格；`fs-extra` 统一别名 `fse`。

**Spec:** `docs/superpowers/specs/2026-07-11-frame-fix-list-round2-design.md`

---

## 批 1 · H 类（阻断类，先修先联调）

### Task 1: H1 · devServer 三层优先级

**Files:**
- Modify: `src/webpack-runner/run-dev-server.js:7-22`
- Modify: `tests/unit/webpack-runner/run-dev-server.test.js:30-37`（改现有 "hot=true 不可被覆盖" 断言）
- Modify: `tests/unit/webpack-runner/run-dev-server.test.js`（追加 open / hot 三层优先级新用例）

- [ ] **Step 1: 改现有测试（把 bug 固化用例翻过来）**

打开 `tests/unit/webpack-runner/run-dev-server.test.js`，找到第 30-37 行 `test('hot=true 不可被覆盖', ...)`，整段替换为下面两组用例：

```js
test('userDev.hot=false 生效（覆盖 frameDefault=true）', () => {
    const opts = resolveDevServerOptions(
        { cliOptions: {}, isWeb: true },
        { hot: false },
        { defaultPort: 9000 },
    );
    expect(opts.hot).toBe(false);
});

test('userDev.hot 缺省时 frameDefault=true', () => {
    const opts = resolveDevServerOptions(
        { cliOptions: {}, isWeb: true },
        {},
        { defaultPort: 9000 },
    );
    expect(opts.hot).toBe(true);
});

test('userDev.open=false 生效（覆盖 frameDefault=ctx.isWeb）', () => {
    const opts = resolveDevServerOptions(
        { cliOptions: {}, isWeb: true },
        { open: false },
        { defaultPort: 9000 },
    );
    expect(opts.open).toBe(false);
});

test('userDev.open=true 生效（覆盖 frameDefault=ctx.isWeb=false）', () => {
    const opts = resolveDevServerOptions(
        { cliOptions: {}, isWeb: false },
        { open: true },
        { defaultPort: 9000 },
    );
    expect(opts.open).toBe(true);
});

test('userDev.open 缺省 + ctx.isWeb=true → open=true', () => {
    const opts = resolveDevServerOptions(
        { cliOptions: {}, isWeb: true },
        {},
        { defaultPort: 9000 },
    );
    expect(opts.open).toBe(true);
});

test('userDev.open 缺省 + ctx.isWeb=false → open=false', () => {
    const opts = resolveDevServerOptions(
        { cliOptions: {}, isWeb: false },
        {},
        { defaultPort: 9000 },
    );
    expect(opts.open).toBe(false);
});
```

同时把该文件里现有的其他 4 条测试（第 4-28 / 39-64 行）的 ctx 补上 `isWeb: true`（如：`{ cliOptions: {} }` → `{ cliOptions: {}, isWeb: true }`），避免 open 分支未定义。

- [ ] **Step 2: 跑测试确认 6 条新测试失败**

Run: `npx jest tests/unit/webpack-runner/run-dev-server.test.js -v`
Expected: 上面 6 条新用例中 `userDev.hot=false 生效` / `userDev.open=false 生效` / `userDev.open=true 生效` 至少 3 条 FAIL（当前源码里 `hot: true` / `open: ctx.isWeb` 是硬覆盖）。

- [ ] **Step 3: 改源码——resolveDevServerOptions 三层优先级**

打开 `src/webpack-runner/run-dev-server.js`，把第 7-22 行的函数整个替换为：

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

关键：`hot` / `open` 用 `??` 从 userDev 取值（缺省用 frameDefault），并放在 `...userDev` **之后**——确保这两个字段总是被显式赋值，不受 `...userDev` 展开影响。

- [ ] **Step 4: 全绿**

Run: `npx jest tests/unit/webpack-runner/run-dev-server.test.js -v`
Expected: 全部 PASS（原有 4 条 + 新增 6 条）。

- [ ] **Step 5: Commit**

```bash
git add src/webpack-runner/run-dev-server.js tests/unit/webpack-runner/run-dev-server.test.js
git commit -m "fix(H1/FB-014): devServer open/hot 三层优先级（cli > user > frameDefault），保持默认取值不变"
```

---

### Task 2: H2 · env 缺失兜底

**Files:**
- Modify: `src/core/env.js:10-18`
- Modify: `tests/unit/core/env.test.js:28-30`（现有 "抛错" 用例翻转为 "info 提示 + 空对象"）
- Modify: `tests/unit/core/env.test.js`（新增 "都缺失" 用例）

- [ ] **Step 1: 改现有测试 + 加新用例**

打开 `tests/unit/core/env.test.js`。**替换**第 28-30 行的 `test('loadEnv .env.<name> 不存在时抛错', ...)` 为：

```js
test('loadEnv .env.<name> 不存在时 info 提示 + 视作空环境（不抛错）', () => {
    const infoSpy = jest.spyOn(require('../../../src/core/logger'), 'info').mockImplementation(() => {});
    try {
        const env = loadEnv('nope', { cwd: fixtureDir });
        // fixtureDir 里有 .env（base），loadEnv 应返回 base 内容
        expect(env.SHARED_TOKEN).toBeDefined();
        expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/未找到 \.env\.nope/));
    } finally {
        infoSpy.mockRestore();
    }
});
```

同时**追加**到 `describe` 块末尾：

```js
test('loadEnv .env 与 .env.<name> 都不存在时返回 {} + info（.env 缺失沉默）', () => {
    const emptyDir = path.join(__dirname, '../../fixtures/env-empty');
    const fs = require('fs');
    fs.mkdirSync(emptyDir, { recursive: true });
    const infoSpy = jest.spyOn(require('../../../src/core/logger'), 'info').mockImplementation(() => {});
    try {
        const env = loadEnv('anything', { cwd: emptyDir });
        expect(env).toEqual({});
        expect(infoSpy).toHaveBeenCalledTimes(1);
        expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/未找到 \.env\.anything/));
    } finally {
        infoSpy.mockRestore();
        fs.rmSync(emptyDir, { recursive: true, force: true });
    }
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest tests/unit/core/env.test.js -v`
Expected: 两条新用例 FAIL（当前源码抛错）；原来的 `.env 不存在时不报错` 应仍 PASS。

- [ ] **Step 3: 改源码**

打开 `src/core/env.js`，把第 10-18 行的 `loadEnv` 替换为：

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

（`require('./logger')` 加在文件顶部第 4 行左右，跟其他 require 并列。）

- [ ] **Step 4: 全绿**

Run: `npx jest tests/unit/core/env.test.js -v`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/core/env.js tests/unit/core/env.test.js
git commit -m "fix(H2/FB-013): .env.<name> 缺失时 info 提示 + 空环境兜底（不再 throw）"
```

---

### Task 3: H3 · 砍 .mjs 承诺

**Files:**
- Modify: `src/config/bc-config.js:10`
- Modify: `src/config/builder-config.js:7`
- Modify: `tests/unit/config/bc-config.test.js`（追加 mjs-only 不命中用例）
- Modify: `tests/unit/config/builder-config.test.js`（追加 mjs-only 不命中用例）

- [ ] **Step 1: 追加 bc-config 测试**

打开 `tests/unit/config/bc-config.test.js`，在第一个 `describe` 末尾（第 71 行 `}` 之前）追加：

```js
test('bc.config.mjs 单独存在（无 .js/.cjs）时不命中 → throw 未找到', () => {
    const mjsOnlyDir = path.join(__dirname, '../../fixtures/bc-config-mjs-only');
    const fs = require('fs');
    fs.mkdirSync(mjsOnlyDir, { recursive: true });
    fs.writeFileSync(path.join(mjsOnlyDir, 'bc.config.mjs'), `export default () => ({});`);
    const oldCwd = process.cwd();
    try {
        process.chdir(mjsOnlyDir);
        expect(() => resolveBuildConfig(
            baseCtx({ cliOptions: {} }),
            pkgJson,
            { target: 'web' },
        )).toThrow(/未找到 bc\.config/);
    } finally {
        process.chdir(oldCwd);
        fs.rmSync(mjsOnlyDir, { recursive: true, force: true });
    }
});
```

- [ ] **Step 2: 追加 builder-config 测试**

打开 `tests/unit/config/builder-config.test.js`，在最外层 `describe` 末尾（第 143 行 `}` 之前）追加：

```js
test('electron-builder.config.mjs 单独存在（无 .js/.cjs）时不命中 → throw 未找到', () => {
    const mjsOnlyDir = path.join(__dirname, '../../fixtures/builder-mjs-only');
    fs.mkdirSync(mjsOnlyDir, { recursive: true });
    fs.writeFileSync(path.join(mjsOnlyDir, 'electron-builder.config.mjs'), `export default () => ({});`);
    const oldCwd = process.cwd();
    try {
        process.chdir(mjsOnlyDir);
        const noCfg = ctx({ cliOptions: { platform: 'win', arch: 'x64' } });
        expect(() => resolveBuilderConfig(noCfg, pkgJson)).toThrow(/未找到 electron-builder\.config/);
    } finally {
        process.chdir(oldCwd);
        fs.rmSync(mjsOnlyDir, { recursive: true, force: true });
    }
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx jest tests/unit/config/bc-config.test.js tests/unit/config/builder-config.test.js -v`
Expected: 两条新用例 FAIL（当前 CONFIG_NAMES 包含 `.mjs`，会命中并尝试 require 而报另一种错——可能是 `ERR_REQUIRE_ESM` 或类似，反正不是 "未找到 bc.config" / "未找到 electron-builder.config"）。

- [ ] **Step 4: 改源码——bc-config.js**

打开 `src/config/bc-config.js`，把第 10 行改为：

```js
const CONFIG_NAMES = ['bc.config.js', 'bc.config.cjs'];
```

- [ ] **Step 5: 改源码——builder-config.js**

打开 `src/config/builder-config.js`，把第 7 行改为：

```js
const CONFIG_NAMES = ['electron-builder.config.js', 'electron-builder.config.cjs'];
```

- [ ] **Step 6: 全绿**

Run: `npx jest tests/unit/config/bc-config.test.js tests/unit/config/builder-config.test.js -v`
Expected: 全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add src/config/bc-config.js src/config/builder-config.js tests/unit/config/bc-config.test.js tests/unit/config/builder-config.test.js
git commit -m "fix(H3/FB-011): CONFIG_NAMES 移除 .mjs——require() 无法加载 ESM，承诺与实现对齐"
```

---

## 批 2 · M 源码类

### Task 4: M1 · bc.config 兼容对象式

**Files:**
- Modify: `src/config/bc-config.js:26-33`（loadUserConfig）
- Modify: `tests/unit/config/bc-config.test.js`（新增对象式 / null / string fixture 用例）

- [ ] **Step 1: 追加对象式与错误分支测试**

打开 `tests/unit/config/bc-config.test.js`，在最外层 `describe('config/bc-config', ...)` 末尾追加：

```js
describe('bc.config 导出形态兼容（M1/FB-010）', () => {
    const fs = require('fs');
    const cases = path.join(__dirname, '../../fixtures/bc-config-shapes');

    beforeAll(() => {
        fs.mkdirSync(cases, { recursive: true });
        fs.writeFileSync(path.join(cases, 'obj.js'),
            `module.exports = { web: { devServer: { port: 7000 } } };`);
        fs.writeFileSync(path.join(cases, 'fn.js'),
            `module.exports = () => ({ web: { devServer: { port: 7001 } } });`);
        fs.writeFileSync(path.join(cases, 'null.js'), `module.exports = null;`);
        fs.writeFileSync(path.join(cases, 'str.js'), `module.exports = 'bad';`);
    });
    afterAll(() => { fs.rmSync(cases, { recursive: true, force: true }); });

    test('对象式导出 → 直接返回', () => {
        const { web } = resolveBuildConfig(
            baseCtx({ cliOptions: { config: path.join(cases, 'obj.js') } }),
            pkgJson,
            { target: 'web' },
        );
        expect(web.devServer).toEqual({ port: 7000 });
    });

    test('函数式导出 → 调 fn(ctx) 返回（回归）', () => {
        const { web } = resolveBuildConfig(
            baseCtx({ cliOptions: { config: path.join(cases, 'fn.js') } }),
            pkgJson,
            { target: 'web' },
        );
        expect(web.devServer).toEqual({ port: 7001 });
    });

    test('导出 null → throw，错误含 "null"', () => {
        expect(() => resolveBuildConfig(
            baseCtx({ cliOptions: { config: path.join(cases, 'null.js') } }),
            pkgJson,
            { target: 'web' },
        )).toThrow(/bc\.config 必须导出对象或.*收到：null/);
    });

    test('导出字符串 → throw，错误含 "string"', () => {
        expect(() => resolveBuildConfig(
            baseCtx({ cliOptions: { config: path.join(cases, 'str.js') } }),
            pkgJson,
            { target: 'web' },
        )).toThrow(/bc\.config 必须导出对象或.*收到：string/);
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest tests/unit/config/bc-config.test.js -v`
Expected: `对象式导出 → 直接返回` FAIL（当前源码强制函数式抛 `bc.config 必须导出函数`）；`导出 null` / `导出字符串` 的错误文案也不匹配（当前抛 `必须导出函数`）。

- [ ] **Step 3: 改源码**

打开 `src/config/bc-config.js`，把第 26-33 行的 `loadUserConfig` 替换为：

```js
function loadUserConfig(configPath, ctx) {
    const loaded = require(configPath);
    const raw = loaded.default ?? loaded;
    if (typeof raw === 'function') return raw(ctx) || {};
    if (raw && typeof raw === 'object') return raw;
    throw new Error(`[base-client] bc.config 必须导出对象或 (ctx) => config 函数，收到：${raw === null ? 'null' : typeof raw}`);
}
```

- [ ] **Step 4: 全绿**

Run: `npx jest tests/unit/config/bc-config.test.js -v`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/config/bc-config.js tests/unit/config/bc-config.test.js
git commit -m "fix(M1/FB-010): bc.config 兼容对象式导出，与 electron-builder.config 契约对齐"
```

---

### Task 5: M2 · emptyDirSync 提示

**Files:**
- Modify: `src/cli/commands/pack.js:36`（清空 dist 前）
- Modify: `src/cli/commands/build.js:22`（清空 dist 前）
- Modify: `src/cli/commands/child.js:27-28`（清空 dist / app 前各一条）
- Modify: `tests/unit/e2e-build.test.js`（在现有 build 跑通用例里加 info 断言）
- Modify: `tests/unit/e2e-pack-core.test.js`（同上）
- Modify: `tests/unit/e2e-installer-child.test.js`（同上，child 两条断言）

（说明：`tests/unit/cli/commands-*.test.js` 只测命令导出契约不跑 action，所以 info 断言必须放 e2e 层。三个 e2e 文件都用 `runCommand(cmd, cliOptions)` 入口，可以在同一个 `test()` 里 spyOn logger.info 后跑 action 再断言。）

- [ ] **Step 1: 改 e2e-build.test.js**

打开 `tests/unit/e2e-build.test.js`，把现有的 `test('build 跑通：...', async () => {` 块（第 19 行开始）**改为**：

```js
test('build 跑通：dist/index.html 与 dist/index.js 都存在，且清空 dist 前有 info 提示', async () => {
    const infoSpy = jest.spyOn(require('../../src/core/logger'), 'info').mockImplementation(() => {});
    try {
        const cmd = require('../../src/cli/commands/build');
        await runCommand(cmd, { env: 'prod' });

        const distDir = path.join(fixtureDir, 'dist');
        expect(fs.existsSync(path.join(distDir, 'index.html'))).toBe(true);
        expect(fs.existsSync(path.join(distDir, 'index.js'))).toBe(true);

        const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
        expect(html).toContain('<title>minimal-web</title>');

        const js = fs.readFileSync(path.join(distDir, 'index.js'), 'utf8');
        expect(js).toContain('target=web');

        // M2/FB-018：清空 dist 前必须有 info
        expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/清空 dist\//));
    } finally {
        infoSpy.mockRestore();
    }
}, 60000);
```

- [ ] **Step 2: 改 e2e-pack-core.test.js**

打开 `tests/unit/e2e-pack-core.test.js`，找到第 31 行 `test('pack 跑通：...`。在 `await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64' });`（约第 35 行）**之前**插入：

```js
const infoSpy = jest.spyOn(require('../../src/core/logger'), 'info').mockImplementation(() => {});
```

在该 test 结尾 `}, 60000);` **之前**（约第 53 行）加断言与 restore：

```js
expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/清空 dist\//));
infoSpy.mockRestore();
```

（若 test 里已有其他 `mockRestore` 收尾模式，与之保持一致；本处 test 结构较线性，直接尾部追加即可。）

- [ ] **Step 3: 改 e2e-installer-child.test.js**

打开 `tests/unit/e2e-installer-child.test.js`，找到 `test('child：产 dist/child-...`（约第 82 行）。类似地，`await runCommand(cmd, { env: 'prod' });`（约第 86 行）之前插入：

```js
const infoSpy = jest.spyOn(require('../../src/core/logger'), 'info').mockImplementation(() => {});
```

在该 test 尾部 `}, 60000);`（或对应的收尾行）之前加：

```js
expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/清空 dist\//));
expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/清空 app\//));
infoSpy.mockRestore();
```

- [ ] **Step 4: 跑 e2e 测试确认失败**

Run: `npx jest tests/unit/e2e-build.test.js tests/unit/e2e-pack-core.test.js tests/unit/e2e-installer-child.test.js -v`
Expected: 上述 4 处 info 断言 FAIL（源码里还没 info）。build/pack 的产物断言（`dist/index.html` / `app/main/index.js` 等）仍应 PASS。

- [ ] **Step 5: 改 build.js**

打开 `src/cli/commands/build.js`，在第 22 行 `fse.emptyDirSync(distDir);` **之前**插入一行：

```js
logger.info('清空 dist/（frame 约定输出目录，如有重要文件请移出）');
fse.emptyDirSync(distDir);
```

- [ ] **Step 6: 改 pack.js**

打开 `src/cli/commands/pack.js`，在第 36 行 `fse.emptyDirSync(distDir);` **之前**插入一行：

```js
logger.info('清空 dist/（frame 约定输出目录，如有重要文件请移出）');
fse.emptyDirSync(distDir);
```

- [ ] **Step 7: 改 child.js**

打开 `src/cli/commands/child.js`，把第 27-28 行改为：

```js
logger.info('清空 dist/（frame 约定输出目录，如有重要文件请移出）');
fse.emptyDirSync(distDir);
logger.info('清空 app/');
fse.emptyDirSync(appDir);
```

- [ ] **Step 8: 全绿**

Run: `npx jest tests/unit/e2e-build.test.js tests/unit/e2e-pack-core.test.js tests/unit/e2e-installer-child.test.js -v`
Expected: 全部 PASS。

- [ ] **Step 9: Commit**

```bash
git add src/cli/commands/pack.js src/cli/commands/build.js src/cli/commands/child.js tests/unit/e2e-build.test.js tests/unit/e2e-pack-core.test.js tests/unit/e2e-installer-child.test.js
git commit -m "fix(M2/FB-018): pack/build/child 清空 dist（child 含 app）前 info 提示，可见化默认动作"
```

---

### Task 6: M4 · warn / compileWarning 走 stderr

**Files:**
- Modify: `src/core/logger.js:14-16`（warn）
- Modify: `src/core/logger.js:40-43`（compileWarning）
- Modify: `tests/unit/core/logger.test.js`（改现有 warn / compileWarning 断言到 stderr）

- [ ] **Step 1: 改 logger.test.js 里的两条固化断言**

打开 `tests/unit/core/logger.test.js`。

**改** `beforeEach`（第 5-8 行），把 `errSpy` 保留 + 加 `warnSpy`：

```js
let logSpy, errSpy, warnSpy;
beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
```

**改** 第 22-25 行 `test('warn 含 ⚠', ...)` 为：

```js
test('warn 含 ⚠ 且走 console.warn（stderr）', () => {
    logger.warn('careful');
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('⚠');
    expect(logSpy).not.toHaveBeenCalled();
});
```

**改** 第 65-68 行 `test('compileWarning 0 个时不输出', ...)` 为：

```js
test('compileWarning 0 个时不输出（stdout / stderr 都不写）', () => {
    logger.compileWarning('web', 0);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
});
```

**改** 第 70-75 行 `test('compileWarning > 0 时输出 N warnings', ...)` 为：

```js
test('compileWarning > 0 时走 console.warn（stderr）', () => {
    logger.compileWarning('web', 3);
    expect(warnSpy).toHaveBeenCalled();
    const out = warnSpy.mock.calls[0][0];
    expect(out).toContain('3');
    expect(out).toContain('warning');
    expect(logSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest tests/unit/core/logger.test.js -v`
Expected: 修改的 3 条 FAIL（当前 warn / compileWarning 走 console.log，warnSpy 未被调用、logSpy 被调用）。

- [ ] **Step 3: 改 logger.js**

打开 `src/core/logger.js`。**替换**第 14-16 行 `warn`：

```js
function warn(msg) {
    console.warn(`${PREFIX} ${pc.yellow('⚠')} ${msg}`);
}
```

**替换**第 40-43 行 `compileWarning`：

```js
function compileWarning(name, count) {
    if (!count) return;
    console.warn(`${PREFIX} ${pc.yellow('⚠')} ${name} ${count} warnings`);
}
```

- [ ] **Step 4: 全绿**

Run: `npx jest tests/unit/core/logger.test.js -v`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/core/logger.js tests/unit/core/logger.test.js
git commit -m "fix(M4/FB-016): warn 与 compileWarning 走 console.warn（stderr），符合 UNIX 惯例"
```

---

## 批 3 · 观测与文档

### Task 7: L1 · logger.debug 通道 + 4 处打点

**Files:**
- Modify: `src/core/logger.js`（新增 debug）
- Modify: `src/cli/index.js`（反射 `--debug` 到 `global.__BC_DEBUG__`）
- Modify: `src/config/bc-config.js:35-38`（preloadBcConfig 打点）
- Modify: `src/config/builder-config.js:35-38`（preloadBuilderConfig 打点）
- Modify: `src/webpack-runner/run-dev-server.js`（resolveDevServerOptions return 前打点）
- Modify: `src/electron/build-targets.js`（buildTargets return 前打点）
- Modify: `tests/unit/core/logger.test.js`（新增 debug 单测）

- [ ] **Step 1: 写 logger.debug 单测**

打开 `tests/unit/core/logger.test.js`，在最后一个 test 之后（第 87 行 `});` 之前）追加：

```js
describe('debug 门控（L1/FB-017）', () => {
    let savedEnv, savedGlobal;
    beforeEach(() => {
        savedEnv = process.env.BC_DEBUG;
        savedGlobal = global.__BC_DEBUG__;
        delete process.env.BC_DEBUG;
        delete global.__BC_DEBUG__;
    });
    afterEach(() => {
        if (savedEnv === undefined) delete process.env.BC_DEBUG; else process.env.BC_DEBUG = savedEnv;
        if (savedGlobal === undefined) delete global.__BC_DEBUG__; else global.__BC_DEBUG__ = savedGlobal;
    });

    test('无 BC_DEBUG / global 时静默', () => {
        logger.debug('x');
        expect(logSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errSpy).not.toHaveBeenCalled();
    });

    test('BC_DEBUG=1 时走 console.warn（stderr）', () => {
        process.env.BC_DEBUG = '1';
        logger.debug('bc.config 命中：/tmp/x.js');
        expect(warnSpy).toHaveBeenCalled();
        expect(warnSpy.mock.calls[0][0]).toContain('bc.config 命中');
        expect(warnSpy.mock.calls[0][0]).toContain('debug');
    });

    test('global.__BC_DEBUG__=true 时走 console.warn', () => {
        global.__BC_DEBUG__ = true;
        logger.debug('devServer 最终配置');
        expect(warnSpy).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest tests/unit/core/logger.test.js -v`
Expected: 3 条 FAIL（`logger.debug` 尚未导出）。

- [ ] **Step 3: 改 logger.js——新增 debug 与导出**

打开 `src/core/logger.js`。在 `function warn` 之后（第 16 行 `}` 之后）追加：

```js
function debug(msg) {
    if (!process.env.BC_DEBUG && !global.__BC_DEBUG__) return;
    console.warn(`${PREFIX} ${pc.dim('debug')} ${msg}`);
}
```

在 `module.exports` 里加 `debug`（第 56-60 行区块内 `info, success, warn, error,` 那行改为 `info, success, warn, error, debug,`）。

- [ ] **Step 4: 跑 debug 单测确认全绿**

Run: `npx jest tests/unit/core/logger.test.js -v`
Expected: 全部 PASS。

- [ ] **Step 5: Commit debug 通道**

```bash
git add src/core/logger.js tests/unit/core/logger.test.js
git commit -m "feat(L1/FB-017 part1): logger 新增 debug()，受 BC_DEBUG env / global.__BC_DEBUG__ 门控，走 stderr"
```

- [ ] **Step 6: cli/index.js 反射 --debug 到 global**

打开 `src/cli/index.js`，找到 `async function runCommand(cmd, cliOptions)`（第 28 行）。在第一行 `try {` **之前**插入：

```js
async function runCommand(cmd, cliOptions) {
    if (cliOptions?.debug) global.__BC_DEBUG__ = true;
    try {
```

- [ ] **Step 7: bc-config.js 打点**

打开 `src/config/bc-config.js`。把第 35-38 行 `preloadBcConfig` 改为：

```js
function preloadBcConfig(ctx) {
    const configPath = locateBcConfig(process.cwd(), ctx.cliOptions.config);
    logger.debug(`bc.config 命中：${configPath}`);
    ctx.userConfig = loadUserConfig(configPath, ctx);
}
```

在文件顶部 require 区加：

```js
const logger = require('../core/logger');
```

（放在其他 require 之后即可。）

- [ ] **Step 8: builder-config.js 打点**

打开 `src/config/builder-config.js`。把 `preloadBuilderConfig`（第 35-38 行）改为：

```js
function preloadBuilderConfig(ctx) {
    const configPath = locateBuilderConfig(process.cwd(), ctx.cliOptions.packConfig);
    logger.debug(`electron-builder.config 命中：${configPath}`);
    ctx.userBuilderConfig = loadUserBuilderConfig(configPath, ctx);
}
```

（logger 已 require 在第 5 行，无需追加。）

- [ ] **Step 9: run-dev-server.js 打点**

打开 `src/webpack-runner/run-dev-server.js`。把 `resolveDevServerOptions` 改为 return 前打 debug：

```js
function resolveDevServerOptions(ctx, userDev, { defaultPort }) {
    const host = ctx.cliOptions.host ?? userDev.host ?? 'localhost';
    const port = ctx.cliOptions.port ?? userDev.port ?? defaultPort;
    const hot = userDev.hot ?? true;
    const open = userDev.open ?? ctx.isWeb;
    const result = {
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
    logger.debug(`devServer 最终配置：host=${host} port=${port} hot=${hot} open=${open}`);
    return result;
}
```

（logger 已 require 在第 3 行。）

- [ ] **Step 10: build-targets.js 打点**

打开 `src/electron/build-targets.js`。把 `buildTargets` 的 return 语句改为：

```js
const result = {
    [resolvedPlatform]: dir ? ['dir'] : PLATFORM_MAP[resolvedPlatform],
    [resolvedArch]: true,
};
logger.debug(`buildTargets 最终：platform=${resolvedPlatform} arch=${resolvedArch} dir=${!!dir}`);
return result;
```

（logger 已 require 在第 1 行。）

- [ ] **Step 11: 跑全量测试确认无回归**

Run: `npm test`
Expected: 全部 PASS（debug 未开启时不产生输出，不影响其他测试）。

若有失败：debug 输出可能被断言 `console.warn.not.toHaveBeenCalled()` 之类反向断言误捕获。逐条排查——若某 test 场景本身就会走 preloadBcConfig 但没设 BC_DEBUG，debug 不会输出；若 test 显式 `process.env.BC_DEBUG='1'` 才会打——正常情况下无回归。

- [ ] **Step 12: Commit 打点**

```bash
git add src/cli/index.js src/config/bc-config.js src/config/builder-config.js src/webpack-runner/run-dev-server.js src/electron/build-targets.js
git commit -m "feat(L1/FB-017 part2): --debug 反射 global.__BC_DEBUG__；bc-config/builder-config/dev-server/build-targets 4 处 logger.debug 打点"
```

---

### Task 8: M3 · `__BC_BUILD__` 字段矩阵文档

**Files:**
- Modify: `docs/superpowers/specs/2026-06-24-frame-design.md` §4.1

- [ ] **Step 1: 定位插入位置**

Run: `grep -n "^### 4.1\|^## 4\|__BC_BUILD__（frame 派生" docs/superpowers/specs/2026-06-24-frame-design.md`
目的：确认 §4.1 的起止行号，找到"target 缺省值规则"（约第 233 行）之后、"`installer` 命令不派生"（约第 250 行）之前的位置。

- [ ] **Step 2: 追加字段矩阵小节**

在 §4.1 "target 缺省值规则" 段落之后（第 233 行附近），"`installer` 命令不派生 `__BC_BUILD__`" 之前，插入：

```markdown
**字段矩阵：不同命令下的取值**：

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

`installer` 命令不派生 `__BC_BUILD__`（`needsBcConfig=false`），故整列为 —；用户 renderer 代码里的字段访问在 `installer` 命令下不存在消费方。字段派生逻辑源码：`src/core/build-info.js`。

```

（末尾多加一个空行，与后续段落分隔。）

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-24-frame-design.md
git commit -m "docs(M3/FB-015): frame-design.md §4.1 补 __BC_BUILD__ 字段矩阵表格（命令 × 字段）"
```

---

### Task 9: L2 · 端口差异 --help 文案

**Files:**
- Modify: `src/cli/commands/dev-app.js:51`
- Modify: `src/cli/commands/dev-web.js:17`

- [ ] **Step 1: 改 dev-app.js**

打开 `src/cli/commands/dev-app.js`，把第 51 行改为：

```js
['--port <n>', 'renderer dev-server 端口（默认 8023，与 dev:web 的 9000 错开避免冲突）'],
```

- [ ] **Step 2: 改 dev-web.js**

打开 `src/cli/commands/dev-web.js`，把第 17 行改为：

```js
['--port <n>', 'dev server 端口（默认 9000，与 dev:app 的 8023 错开避免冲突）'],
```

- [ ] **Step 3: 手工验证 --help 输出（可选）**

Run: `node bin/base-client dev:web --help`
Expected: 输出里 `--port <n>` 描述含 "错开避免冲突"。

Run: `node bin/base-client dev:app --help`
Expected: 同上。

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/dev-app.js src/cli/commands/dev-web.js
git commit -m "docs(L2/FB-019): dev:app / dev:web 的 --port --help 描述补端口错开原因"
```

---

## 收尾 · 追 sha + 端到端验证

### Task 10: 更新 fix-list 追 sha + 跑全量测试

**Files:**
- Modify: `docs/superpowers/specs/frame-fix-list.md`（每条条目末尾追 `✓ 已修 (frame commit: <sha>)`）

- [ ] **Step 1: 收集 9 条修复的 commit sha**

Run: `git log --oneline -15`
从最近 10 条 commit 里挑出对应 H1/H2/H3/M1/M2/M4/L1/M3/L2 的 sha（L1 有 2 条，取 part2 的 sha 作为 "L1 修完" 的标记，或者两条都记）。

- [ ] **Step 2: 追 sha 到 fix-list**

打开 `docs/superpowers/specs/frame-fix-list.md`，逐条在验收 checkbox **之后**追加一行 `✓ 已修 (frame commit: <sha>)`。

例如 H1 部分末尾（`sha_h1` 用 Step 1 拿到的实际 sha）：

```markdown
  - [ ] 不配 open 时：dev:web 仍弹 / dev:app 仍不弹（默认不变）

✓ 已修 (frame commit: <sha_h1>)
```

对 H2 / H3 / M1 / M2 / M3 / M4 / L1 / L2 分别追加。

- [ ] **Step 3: 跑全量测试**

Run: `npm test`
Expected: 全部 PASS（0 失败）。

- [ ] **Step 4: 跑手工验收（fix-list §4 端到端清单）**

按 fix-list.md §4 的清单逐条手工验证：

- `npm install`（peer 提示回归）
- `npm run dev:web`（9000 有 Vue Hello + `--help` 端口说明 · L2）
- `npm run dev:app`（Electron 窗口 + `--help` 端口说明 · L2）
- 沙盘 `bc.config.js` 加 `web: { devServer: { open: false } }` → `dev:web` 不弹（H1）
- 沙盘 `bc.config.js` 改对象式 → `build` 正常（M1）
- 沙盘删 `.env.prod` → `build` 正常 + info（H2）
- 沙盘 `bc.config.mjs` 单独存在 → 报"未找到 bc.config.js"（H3）
- `build`：能看到 "清空 dist/..." info（M2）
- `child`：清空 dist + app 两条 info（M2）
- `pack -- --dir --pack-config <displaced-output-config>`：warn 走 stderr，`2>/dev/null` 后消失（M4）
- `build -- --debug`：能看到 config 路径 / preset merge 详情（L1）
- `frame-design.md §4.1` 字段矩阵在位（M3）

沙盘操作在 client-project 侧执行（frame 通过 yalc push 给沙盘）；若沙盘不在手边可跳过手工步骤，仅确认 `npm test` 全绿。

- [ ] **Step 5: Commit sha 追加**

```bash
git add docs/superpowers/specs/frame-fix-list.md
git commit -m "docs: frame-fix-list.md 追 9 条修复 sha，本轮闭环"
```

- [ ] **Step 6: 打完成标记（回复用户侧参照）**

打印到 stdout / 写到 spec 末尾一段"完成信号"（供用户拷贝回复 client-project 侧）：

```
【frame fix-list round2 · 完成信号 · 2026-07-11】
- H1/FB-014：devServer 三层优先级 ✓ <sha>
- H2/FB-013：.env 缺失兜底 ✓ <sha>
- H3/FB-011：.mjs 承诺砍除 ✓ <sha>
- M1/FB-010：bc.config 对象式 ✓ <sha>
- M2/FB-018：emptyDirSync 提示 ✓ <sha>
- M3/FB-015：__BC_BUILD__ 字段矩阵 ✓ <sha>
- M4/FB-016：warn/compileWarning stderr ✓ <sha>
- L1/FB-017：logger.debug + 4 处打点 ✓ <sha> / <sha>
- L2/FB-019：--port --help 端口差异 ✓ <sha>
全量单测 npm test 全绿；yalc push 后可到 client-project 侧沙盘走 fix-list §4 端到端清单。
```

---

## 完成 DoD

- [ ] 全部 10 个 Task 完成
- [ ] `npm test` 0 失败
- [ ] `docs/superpowers/specs/frame-fix-list.md` 9 条追 sha
- [ ] 完成信号 block 已产出（供用户回复 client-project 侧）
