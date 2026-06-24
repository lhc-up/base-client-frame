# Frame Phase 3：`dev:app` 命令 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `bc-frame dev:app`：编译 Electron 三进程（main / preload 一次性，renderer 经 dev-server HMR），编译就绪后 spawn Electron 加载 dev URL。

**Architecture:** 新增 main / preload / renderer 三个预设；扩展 bc-config 接 app target 分支（返回 `{main, preload, renderer}`）；新增 electron/ 共享工具（resolve-electron / resolve-main-entry / kill-electron）；新增 cli/commands/dev-app 编排 webpack 一次性构建 + dev-server + Electron spawn。

**Tech Stack:** Node.js, webpack 5 三进程 target（electron-main / electron-preload / web）, webpack-dev-server, Electron（peer）, jest 30。复用 P1 全部基础设施 + P2 的 `runProductionBuild`（用作 main+preload 一次性编译）。

**Phase 范围**：仅 `dev:app`。pack 三进程编译复用同一份预设但走不同 phase（P4）。

**对应 spec 章节**：[2026-06-24-frame-design.md](../specs/2026-06-24-frame-design.md) § 6.1 三进程预设 / § 7.1 dev:app 流程 / § 11.5 配置加载行为。

**前置 Phase**：Phase 1 + Phase 2 都已完成。

---

## 文件结构（Phase 3 增量）

```
src/
├── config/
│   ├── bc-config.js                     # 修改：增 app target 分支
│   └── presets/
│       ├── main.js                      # 新增：getMainPreset
│       ├── preload.js                   # 新增：getPreloadPreset
│       └── renderer.js                  # 新增：getRendererPreset
├── electron/                            # 新增整目录
│   ├── resolve-electron.js              # resolveElectron(rootDir) → electron 可执行路径
│   ├── resolve-main-entry.js            # resolveMainEntry(rootDir) → main 进程入口绝对路径
│   └── kill-electron.js                 # killElectron(child) 跨平台终止进程树
├── cli/
│   ├── commands/
│   │   └── dev-app.js                   # 新增
│   └── index.js                         # 修改：注册 dev-app

tests/unit/
├── config/
│   ├── presets-main.test.js             # 新增
│   ├── presets-preload.test.js          # 新增
│   ├── presets-renderer.test.js         # 新增
│   └── bc-config.test.js                # 修改：补充 app target 分支测试
├── electron/                            # 新增
│   ├── resolve-electron.test.js
│   ├── resolve-main-entry.test.js
│   └── kill-electron.test.js
├── cli/
│   ├── commands-dev-app.test.js         # 新增
│   └── index.test.js                    # 修改：补充 dev:app 注册测试
└── e2e-dev-app.test.js                  # 新增（mock spawn）
```

---

## Tasks

### Task 1：`src/config/presets/main.js` + 测试

**Files:**
- Create: `src/config/presets/main.js`
- Create: `tests/unit/config/presets-main.test.js`

- [ ] **Step 1：写测试**

`tests/unit/config/presets-main.test.js`：

```js
const path = require('path');
const webpack = require('webpack');
const { getMainPreset } = require('../../../src/config/presets/main');

const baseCtx = (over = {}) => ({
    target: 'app',
    command: 'dev:app',
    mode: 'development',
    isDev: true, isProd: false, isApp: true, isWeb: false,
    cliOptions: {},
    env: { BC_ENV: 'prod' },
    ...over,
});
const pkgJson = { name: 'demo', version: '1.0.0' };
const buildInfo = { target: 'app', name: 'demo', version: '1.0.0', env: 'prod', encrypted: false, encryptKey: 'KEY' };

describe('config/presets/main', () => {
    test('target=electron-main, entry/output 正确', () => {
        const p = getMainPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.target).toBe('electron-main');
        expect(p.entry).toContain('src/main/index.js');
        expect(p.output.path).toContain(path.join('app', 'main'));
        expect(p.output.filename).toBe('index.js');
        expect(p.output.libraryTarget).toBe('commonjs2');
    });

    test('externals 含 electron commonjs', () => {
        const p = getMainPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.externals).toEqual({ electron: 'commonjs electron' });
    });

    test('devtool dev=source-map prod=false', () => {
        expect(getMainPreset(baseCtx({ isDev: true, isProd: false, mode: 'development' }), pkgJson, buildInfo).devtool).toBe('source-map');
        expect(getMainPreset(baseCtx({ isDev: false, isProd: true, mode: 'production' }), pkgJson, buildInfo).devtool).toBe(false);
    });

    test('plugins 含 buildInfoPlugin（含 encryptKey）+ userEnvPlugin', () => {
        const p = getMainPreset(baseCtx(), pkgJson, buildInfo);
        const defs = p.plugins.filter(pl => pl instanceof webpack.DefinePlugin);
        const allDefs = defs.reduce((acc, d) => ({ ...acc, ...d.definitions }), {});
        expect(allDefs['__BC_BUILD__.target']).toBe('"app"');
        expect(allDefs['__BC_BUILD__.encryptKey']).toBe('"KEY"');     // main 独有
        expect(allDefs['process.env.BC_ENV']).toBe('"prod"');
    });

    test('module.rules 含 Asset Modules', () => {
        const p = getMainPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.module.rules.some(r => r.test.test('foo.png'))).toBe(true);
    });

    test('resolve.extensions 含 .js .mjs .cjs .json', () => {
        const p = getMainPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.resolve.extensions).toEqual(expect.arrayContaining(['.js', '.mjs', '.cjs', '.json']));
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/config/presets-main.test.js
```

- [ ] **Step 3：写实现**

`src/config/presets/main.js`：

```js
const path = require('path');
const { buildInfoPlugin } = require('./build-info-plugin');
const { userEnvPlugin } = require('./user-env-plugin');

function getMainPreset(ctx, pkgJson, buildInfo) {
    const { mode, isDev, env } = ctx;
    const rootDir = process.cwd();

    return {
        name: 'main',
        target: 'electron-main',
        mode,
        entry: path.resolve(rootDir, 'src/main/index.js'),
        output: {
            path: path.resolve(rootDir, 'app/main'),
            filename: 'index.js',
            libraryTarget: 'commonjs2',
            assetModuleFilename: 'assets/[name].[hash:8][ext][query]',
        },
        externals: { electron: 'commonjs electron' },
        devtool: isDev ? 'source-map' : false,
        resolve: {
            extensions: ['.js', '.mjs', '.cjs', '.json'],
        },
        module: {
            rules: [
                { test: /\.(png|jpe?g|gif|svg|webp|avif)$/i,   type: 'asset/resource' },
                { test: /\.(woff2?|eot|ttf|otf)$/i,            type: 'asset/resource' },
                { test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i, type: 'asset/resource' },
            ],
        },
        plugins: [
            buildInfoPlugin(buildInfo, { includeEncryptKey: true }),   // main 独有：注入 encryptKey
            userEnvPlugin(env),
        ],
    };
}

module.exports = { getMainPreset };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/config/presets-main.test.js
```

预期：6 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/config/presets/main.js tests/unit/config/presets-main.test.js
git commit -m "feat(presets): 加 getMainPreset（electron-main / commonjs2 / externals / __BC_BUILD__ 含 encryptKey）"
```

---

### Task 2：`src/config/presets/preload.js` + 测试

**Files:**
- Create: `src/config/presets/preload.js`
- Create: `tests/unit/config/presets-preload.test.js`

- [ ] **Step 1：写测试**

`tests/unit/config/presets-preload.test.js`：

```js
const path = require('path');
const webpack = require('webpack');
const { getPreloadPreset } = require('../../../src/config/presets/preload');

const baseCtx = (over = {}) => ({
    target: 'app',
    command: 'dev:app',
    mode: 'development',
    isDev: true, isProd: false, isApp: true, isWeb: false,
    cliOptions: {},
    env: { BC_ENV: 'prod' },
    ...over,
});
const pkgJson = { name: 'demo', version: '1.0.0' };
const buildInfo = { target: 'app', name: 'demo', version: '1.0.0', env: 'prod', encrypted: false, encryptKey: 'KEY' };

describe('config/presets/preload', () => {
    test('target=electron-preload, entry/output 正确', () => {
        const p = getPreloadPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.target).toBe('electron-preload');
        expect(p.entry).toContain('src/preload/index.js');
        expect(p.output.path).toContain(path.join('app', 'preload'));
        expect(p.output.filename).toBe('index.js');
    });

    test('externals 含 electron', () => {
        const p = getPreloadPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.externals).toEqual({ electron: 'commonjs electron' });
    });

    test('plugins 含 buildInfoPlugin（不含 encryptKey）', () => {
        const p = getPreloadPreset(baseCtx(), pkgJson, buildInfo);
        const defs = p.plugins.filter(pl => pl instanceof webpack.DefinePlugin);
        const allDefs = defs.reduce((acc, d) => ({ ...acc, ...d.definitions }), {});
        expect(allDefs['__BC_BUILD__.target']).toBe('"app"');
        expect(allDefs['__BC_BUILD__.encryptKey']).toBeUndefined();   // preload 不含
        expect(allDefs['process.env.BC_ENV']).toBe('"prod"');
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/config/presets-preload.test.js
```

- [ ] **Step 3：写实现**

`src/config/presets/preload.js`：

```js
const path = require('path');
const { buildInfoPlugin } = require('./build-info-plugin');
const { userEnvPlugin } = require('./user-env-plugin');

function getPreloadPreset(ctx, pkgJson, buildInfo) {
    const { mode, isDev, env } = ctx;
    const rootDir = process.cwd();

    return {
        name: 'preload',
        target: 'electron-preload',
        mode,
        entry: path.resolve(rootDir, 'src/preload/index.js'),
        output: {
            path: path.resolve(rootDir, 'app/preload'),
            filename: 'index.js',
            libraryTarget: 'commonjs2',
            assetModuleFilename: 'assets/[name].[hash:8][ext][query]',
        },
        externals: { electron: 'commonjs electron' },
        devtool: isDev ? 'source-map' : false,
        resolve: {
            extensions: ['.js', '.mjs', '.cjs', '.json'],
        },
        module: {
            rules: [
                { test: /\.(png|jpe?g|gif|svg|webp|avif)$/i,   type: 'asset/resource' },
                { test: /\.(woff2?|eot|ttf|otf)$/i,            type: 'asset/resource' },
                { test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i, type: 'asset/resource' },
            ],
        },
        plugins: [
            buildInfoPlugin(buildInfo),                            // 不传 includeEncryptKey
            userEnvPlugin(env),
        ],
    };
}

module.exports = { getPreloadPreset };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/config/presets-preload.test.js
```

预期：3 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/config/presets/preload.js tests/unit/config/presets-preload.test.js
git commit -m "feat(presets): 加 getPreloadPreset（electron-preload；__BC_BUILD__ 不含 encryptKey）"
```

---

### Task 3：`src/config/presets/renderer.js` + 测试

**Files:**
- Create: `src/config/presets/renderer.js`
- Create: `tests/unit/config/presets-renderer.test.js`

- [ ] **Step 1：写测试**

`tests/unit/config/presets-renderer.test.js`：

```js
const path = require('path');
const webpack = require('webpack');
const { getRendererPreset } = require('../../../src/config/presets/renderer');

const baseCtx = (over = {}) => ({
    target: 'app',
    command: 'dev:app',
    mode: 'development',
    isDev: true, isProd: false, isApp: true, isWeb: false,
    cliOptions: {},
    env: { BC_ENV: 'prod' },
    ...over,
});
const pkgJson = { name: 'demo', version: '1.0.0' };
const buildInfo = { target: 'app', name: 'demo', version: '1.0.0', env: 'prod', encrypted: false, encryptKey: 'KEY' };

describe('config/presets/renderer', () => {
    test('target=web，entry 是对象形态（多入口预留）', () => {
        const p = getRendererPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.target).toBe('web');
        expect(typeof p.entry).toBe('object');
        expect(p.entry.renderer).toContain('src/renderer/index.js');
    });

    test('output.filename 使用 [name]/index.js 模板', () => {
        const p = getRendererPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.output.filename).toBe('[name]/index.js');
        expect(p.output.path).toContain('app');
    });

    test('publicPath dev=/ prod=./', () => {
        expect(getRendererPreset(baseCtx({ isDev: true, isProd: false, mode: 'development' }), pkgJson, buildInfo).output.publicPath).toBe('/');
        expect(getRendererPreset(baseCtx({ isDev: false, isProd: true, mode: 'production' }), pkgJson, buildInfo).output.publicPath).toBe('./');
    });

    test('externals 为空（renderer 跑浏览器）', () => {
        const p = getRendererPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.externals).toBeUndefined();
    });

    test('plugins 含 buildInfoPlugin（不含 encryptKey）+ userEnvPlugin', () => {
        const p = getRendererPreset(baseCtx(), pkgJson, buildInfo);
        const defs = p.plugins.filter(pl => pl instanceof webpack.DefinePlugin);
        const allDefs = defs.reduce((acc, d) => ({ ...acc, ...d.definitions }), {});
        expect(allDefs['__BC_BUILD__.target']).toBe('"app"');
        expect(allDefs['__BC_BUILD__.encryptKey']).toBeUndefined();
        expect(allDefs['process.env.BC_ENV']).toBe('"prod"');
    });

    test('stats 静默 + infrastructureLogging.level=warn', () => {
        const p = getRendererPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.stats).toBe('none');
        expect(p.infrastructureLogging.level).toBe('warn');
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/config/presets-renderer.test.js
```

- [ ] **Step 3：写实现**

`src/config/presets/renderer.js`：

```js
const path = require('path');
const { buildInfoPlugin } = require('./build-info-plugin');
const { userEnvPlugin } = require('./user-env-plugin');

function getRendererPreset(ctx, pkgJson, buildInfo) {
    const { mode, isDev, env } = ctx;
    const rootDir = process.cwd();

    return {
        name: 'renderer',
        target: 'web',
        mode,
        entry: {
            renderer: path.resolve(rootDir, 'src/renderer/index.js'),
        },
        output: {
            path: path.resolve(rootDir, 'app'),
            filename: '[name]/index.js',
            publicPath: isDev ? '/' : './',
            assetModuleFilename: 'assets/[name].[hash:8][ext][query]',
        },
        devtool: isDev ? 'source-map' : false,
        resolve: {
            extensions: ['.js', '.mjs', '.cjs', '.json'],
        },
        module: {
            rules: [
                { test: /\.(png|jpe?g|gif|svg|webp|avif)$/i,   type: 'asset/resource' },
                { test: /\.(woff2?|eot|ttf|otf)$/i,            type: 'asset/resource' },
                { test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i, type: 'asset/resource' },
            ],
        },
        plugins: [
            buildInfoPlugin(buildInfo),
            userEnvPlugin(env),
        ],
        stats: 'none',
        infrastructureLogging: { level: 'warn' },
    };
}

module.exports = { getRendererPreset };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/config/presets-renderer.test.js
```

预期：6 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/config/presets/renderer.js tests/unit/config/presets-renderer.test.js
git commit -m "feat(presets): 加 getRendererPreset（target=web，entry 对象形态预留多入口）"
```

---

### Task 4：`src/config/bc-config.js` 接 app target 分支 + 补充测试

**Files:**
- Modify: `src/config/bc-config.js`
- Modify: `tests/unit/config/bc-config.test.js`（追加 app target 测试）

- [ ] **Step 1：在现有测试文件追加 app target 测试**

在 `tests/unit/config/bc-config.test.js` 的 describe 块末尾追加：

```js
describe('config/bc-config (app target)', () => {
    const path = require('path');
    const fs = require('fs');
    const fixtureDir = path.join(__dirname, '../../fixtures/bc-config-app');

    beforeAll(() => {
        fs.mkdirSync(fixtureDir, { recursive: true });
        fs.writeFileSync(path.join(fixtureDir, '.env.prod'), 'BC_ENV=prod\n');
        fs.writeFileSync(path.join(fixtureDir, 'bc.config.js'), `
            module.exports = (ctx) => ({
                main: { plugins: [{ apply: () => {} }] },
                preload: {},
                renderer: { devServer: { port: 8023 } },
            });
        `);
    });
    afterAll(() => { fs.rmSync(fixtureDir, { recursive: true, force: true }); });

    const appCtx = () => ({
        command: 'dev:app',
        target: 'app',
        mode: 'development',
        isDev: true, isProd: false, isApp: true, isWeb: false,
        cliOptions: { config: path.join(fixtureDir, 'bc.config.js') },
        env: { BC_ENV: 'prod' },
    });

    test('target=app 时返回 { main, preload, renderer }', () => {
        const cfgs = require('../../../src/config/bc-config').resolveBuildConfig(
            appCtx(),
            { name: 'demo', version: '1.0.0' },
            { target: 'app', name: 'demo', version: '1.0.0', env: 'prod', encrypted: false },
        );
        expect(cfgs.main).toBeDefined();
        expect(cfgs.preload).toBeDefined();
        expect(cfgs.renderer).toBeDefined();
        expect(cfgs.web).toBeUndefined();
    });

    test('renderer.devServer 透传至 renderer 配置', () => {
        const { renderer } = require('../../../src/config/bc-config').resolveBuildConfig(
            appCtx(),
            { name: 'demo', version: '1.0.0' },
            { target: 'app' },
        );
        expect(renderer.devServer).toEqual({ port: 8023 });
    });

    test('main.plugins 用户值 + 预设值合并（追加）', () => {
        const { main } = require('../../../src/config/bc-config').resolveBuildConfig(
            appCtx(),
            { name: 'demo', version: '1.0.0' },
            { target: 'app' },
        );
        // 预设有 2 个 DefinePlugin + 用户的 1 个 = 3 个
        expect(main.plugins.length).toBe(3);
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/config/bc-config.test.js
```

预期：3 个新 app test FAIL（resolveBuildConfig 抛 "暂未实现"）。

- [ ] **Step 3：修改 `src/config/bc-config.js`：加 app target 分支**

把现有的 `resolveBuildConfig` 中的：

```js
if (ctx.target === 'web') {
    const preset = getWebPreset(ctx, pkgJson, buildInfo);
    const userWeb = userConfig.web || {};
    return { web: webpackMerge(preset, userWeb) };
}

// Phase 1 仅实现 web；其余 target 由后续 phase 接入
throw new Error(`[base-client] target=${ctx.target} 暂未实现（Phase 1 仅支持 web）`);
```

替换为：

```js
if (ctx.target === 'web') {
    const preset = getWebPreset(ctx, pkgJson, buildInfo);
    const userWeb = userConfig.web || {};
    return { web: webpackMerge(preset, userWeb) };
}

if (ctx.target === 'app') {
    const mainPreset = getMainPreset(ctx, pkgJson, buildInfo);
    const preloadPreset = getPreloadPreset(ctx, pkgJson, buildInfo);
    const rendererPreset = getRendererPreset(ctx, pkgJson, buildInfo);
    return {
        main: webpackMerge(mainPreset, userConfig.main || {}),
        preload: webpackMerge(preloadPreset, userConfig.preload || {}),
        renderer: webpackMerge(rendererPreset, userConfig.renderer || {}),
    };
}

throw new Error(`[base-client] 未知 target：${ctx.target}`);
```

并在文件顶部加 require：

```js
const { getMainPreset } = require('./presets/main');
const { getPreloadPreset } = require('./presets/preload');
const { getRendererPreset } = require('./presets/renderer');
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/config/bc-config.test.js
```

预期：web 原有 5 test + app 新 3 test 全部 PASS。

- [ ] **Step 5：commit**

```bash
git add src/config/bc-config.js tests/unit/config/bc-config.test.js
git commit -m "feat(config): bc-config 接 app target 分支（返回 { main, preload, renderer }）"
```

---

### Task 5：`src/electron/resolve-electron.js` + 测试

**Files:**
- Create: `src/electron/resolve-electron.js`
- Create: `tests/unit/electron/resolve-electron.test.js`

- [ ] **Step 1：写测试**

`tests/unit/electron/resolve-electron.test.js`：

```js
const path = require('path');
const fs = require('fs');
const { resolveElectron } = require('../../../src/electron/resolve-electron');

const fixtureDir = path.join(__dirname, '../../tmp/resolve-electron');

beforeEach(() => {
    fs.mkdirSync(fixtureDir, { recursive: true });
    // 模拟用户项目里的 electron 包：node_modules/electron + index.js 导出可执行文件路径
    const electronDir = path.join(fixtureDir, 'node_modules/electron');
    fs.mkdirSync(electronDir, { recursive: true });
    fs.writeFileSync(path.join(electronDir, 'package.json'), JSON.stringify({
        name: 'electron', main: 'index.js', version: '99.0.0',
    }));
    fs.writeFileSync(path.join(electronDir, 'index.js'), `module.exports = '/fake/electron/binary';`);
});
afterEach(() => { fs.rmSync(fixtureDir, { recursive: true, force: true }); });

describe('electron/resolve-electron', () => {
    test('从 rootDir 解析 electron 包，返回其默认导出（可执行文件路径）', () => {
        const exe = resolveElectron(fixtureDir);
        expect(exe).toBe('/fake/electron/binary');
    });

    test('rootDir 下无 electron 时抛错', () => {
        const empty = path.join(__dirname, '../../tmp/no-electron');
        fs.mkdirSync(empty, { recursive: true });
        try {
            expect(() => resolveElectron(empty)).toThrow(/electron/i);
        } finally {
            fs.rmSync(empty, { recursive: true, force: true });
        }
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/electron/resolve-electron.test.js
```

- [ ] **Step 3：写实现**

`src/electron/resolve-electron.js`：

```js
/**
 * 从用户项目 rootDir 解析 electron 模块入口，返回其默认导出
 * （electron 的 main 字段 index.js 导出 electron 可执行文件绝对路径）。
 * 解析锚定 rootDir/node_modules：使用用户项目声明的 electron 版本。
 *
 * @param {string} rootDir
 * @returns {string} electron 可执行文件绝对路径
 */
function resolveElectron(rootDir) {
    let entryPath;
    try {
        entryPath = require.resolve('electron', { paths: [rootDir] });
    } catch (err) {
        throw new Error(`[base-client] 在 ${rootDir} 中未找到 electron 包，请在项目中安装 electron`);
    }
    // 清缓存——测试场景需要每次重新读取（生产可省略）
    delete require.cache[entryPath];
    return require(entryPath);
}

module.exports = { resolveElectron };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/electron/resolve-electron.test.js
```

预期：2 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/electron/resolve-electron.js tests/unit/electron/resolve-electron.test.js
git commit -m "feat(electron): 加 resolveElectron（从用户项目 node_modules 解析 electron 可执行路径）"
```

---

### Task 6：`src/electron/resolve-main-entry.js` + 测试

**Files:**
- Create: `src/electron/resolve-main-entry.js`
- Create: `tests/unit/electron/resolve-main-entry.test.js`

- [ ] **Step 1：写测试**

`tests/unit/electron/resolve-main-entry.test.js`：

```js
const path = require('path');
const fs = require('fs');
const { resolveMainEntry } = require('../../../src/electron/resolve-main-entry');

const fixtureDir = path.join(__dirname, '../../tmp/resolve-main-entry');

beforeEach(() => { fs.mkdirSync(fixtureDir, { recursive: true }); });
afterEach(() => { fs.rmSync(fixtureDir, { recursive: true, force: true }); });

describe('electron/resolve-main-entry', () => {
    test('package.json.main 指向已存在的入口时正常返回绝对路径', () => {
        fs.writeFileSync(path.join(fixtureDir, 'package.json'), JSON.stringify({
            name: 'demo', main: 'app/main/index.js',
        }));
        const dir = path.join(fixtureDir, 'app/main');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.js'), 'console.log("main");');
        const entry = resolveMainEntry(fixtureDir);
        expect(entry).toBe(path.join(fixtureDir, 'app/main/index.js'));
    });

    test('入口不存在时抛错', () => {
        fs.writeFileSync(path.join(fixtureDir, 'package.json'), JSON.stringify({
            name: 'demo', main: 'app/main/index.js',
        }));
        expect(() => resolveMainEntry(fixtureDir)).toThrow(/主进程入口不存在/);
    });

    test('package.json 不存在时抛错', () => {
        expect(() => resolveMainEntry(fixtureDir)).toThrow();
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/electron/resolve-main-entry.test.js
```

- [ ] **Step 3：写实现**

`src/electron/resolve-main-entry.js`：

```js
const path = require('path');
const fs = require('fs');

/**
 * 以 package.json.main 为真相源解析主进程入口绝对路径。
 *
 * @param {string} rootDir
 * @returns {string}
 */
function resolveMainEntry(rootDir) {
    const pkgPath = path.resolve(rootDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (!pkg.main) {
        throw new Error(`[base-client] package.json 缺少 main 字段（${pkgPath}）`);
    }
    const entry = path.resolve(rootDir, pkg.main);
    if (!fs.existsSync(entry)) {
        throw new Error(`[base-client] 主进程入口不存在：${entry}（请先构建，或检查 package.json 的 main 字段）`);
    }
    return entry;
}

module.exports = { resolveMainEntry };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/electron/resolve-main-entry.test.js
```

预期：3 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/electron/resolve-main-entry.js tests/unit/electron/resolve-main-entry.test.js
git commit -m "feat(electron): 加 resolveMainEntry（package.json.main 真相源 + 存在性校验）"
```

---

### Task 7：`src/electron/kill-electron.js` + 测试

**Files:**
- Create: `src/electron/kill-electron.js`
- Create: `tests/unit/electron/kill-electron.test.js`

- [ ] **Step 1：写测试**

`tests/unit/electron/kill-electron.test.js`：

```js
const { killElectron } = require('../../../src/electron/kill-electron');

describe('electron/kill-electron', () => {
    test('child 为 null/undefined 时不报错', () => {
        expect(() => killElectron(null)).not.toThrow();
        expect(() => killElectron(undefined)).not.toThrow();
    });

    test('child 已退出（exitCode 非 null）时跳过', () => {
        const child = { pid: 123, exitCode: 0, kill: jest.fn() };
        killElectron(child);
        expect(child.kill).not.toHaveBeenCalled();
    });

    test('Linux/macOS：调 child.kill(SIGTERM)', () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', { value: 'linux' });
        try {
            const child = { pid: 999, exitCode: null, kill: jest.fn() };
            killElectron(child);
            expect(child.kill).toHaveBeenCalledWith('SIGTERM');
        } finally {
            Object.defineProperty(process, 'platform', { value: original });
        }
    });

    test('Windows：调 taskkill /pid <pid> /T /F（execSync 静默 stdio）', () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const cp = require('child_process');
        const spy = jest.spyOn(cp, 'execSync').mockImplementation(() => {});
        try {
            killElectron({ pid: 1234, exitCode: null, kill: jest.fn() });
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('taskkill /pid 1234 /T /F'), expect.objectContaining({ stdio: 'ignore' }));
        } finally {
            Object.defineProperty(process, 'platform', { value: original });
            spy.mockRestore();
        }
    });

    test('Windows execSync 抛错时被静默吞', () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const cp = require('child_process');
        const spy = jest.spyOn(cp, 'execSync').mockImplementation(() => { throw new Error('not found'); });
        try {
            expect(() => killElectron({ pid: 1234, exitCode: null, kill: jest.fn() })).not.toThrow();
        } finally {
            Object.defineProperty(process, 'platform', { value: original });
            spy.mockRestore();
        }
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/electron/kill-electron.test.js
```

- [ ] **Step 3：写实现**

`src/electron/kill-electron.js`：

```js
const cp = require('child_process');

/**
 * 跨平台终止 Electron 子进程及其整棵进程树。
 *
 * Windows：taskkill /T /F 终止进程树（避免 GPU / helper 子进程残留）；execSync stdio:'ignore'
 * 屏蔽 stderr（进程可能已自行退出导致 taskkill 报 "not found"）。
 *
 * 非 Windows：child.kill('SIGTERM') 即可（spawn 时建独立进程组场景由调用方处理）。
 *
 * @param {ChildProcess|null|undefined} child
 */
function killElectron(child) {
    if (!child || child.exitCode != null) return;

    if (process.platform === 'win32') {
        try {
            cp.execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
        } catch {
            // 进程可能已退出，吞掉 taskkill not-found 类错误
        }
        return;
    }

    try {
        child.kill('SIGTERM');
    } catch {
        // 进程已退出
    }
}

module.exports = { killElectron };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/electron/kill-electron.test.js
```

预期：5 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/electron/kill-electron.js tests/unit/electron/kill-electron.test.js
git commit -m "feat(electron): 加 killElectron（Windows taskkill /T /F；其余 SIGTERM；幂等吞错）"
```

---

### Task 8：`src/cli/commands/dev-app.js` + 测试

**Files:**
- Create: `src/cli/commands/dev-app.js`
- Create: `tests/unit/cli/commands-dev-app.test.js`

设计要点：
- 并行启动两路：① `webpack([main, preload]).run(cb)` 一次性编译 ② webpack-dev-server 起 renderer（HMR）
- 两路都就绪 → resolveElectron + resolveMainEntry → `child_process.spawn(electron, [mainEntry], { env: { ...process.env, NODE_ENV: 'development', RENDERER_DEV_URL: 'http://host:port' }, stdio: 'inherit' })`
- 监听 child.on('close') → 关 dev-server → 进程退出（带 child 的退出码）
- 监听 SIGINT → killElectron + 关 dev-server + 退出

- [ ] **Step 1：写命令模块测试（仅契约层 — 命令配置；E2E 在 Task 10）**

`tests/unit/cli/commands-dev-app.test.js`：

```js
const cmd = require('../../../src/cli/commands/dev-app');
const { TARGETS } = require('../../../src/core/target');
const { MODES } = require('../../../src/core/mode');

describe('cli/commands/dev-app', () => {
    test('命令文件导出契约', () => {
        expect(cmd.name).toBe('dev:app');
        expect(cmd.target).toBe(TARGETS.APP);
        expect(cmd.mode).toBe(MODES.DEV);
        expect(cmd.needsBcConfig).toBe(true);
        expect(cmd.needsBuilderConfig).toBe(false);
        expect(cmd.aliases || []).toEqual([]);
    });

    test('options 含 --port 与 --host', () => {
        const flags = cmd.options.map(o => o[0]);
        expect(flags.some(f => f.includes('--port'))).toBe(true);
        expect(flags.some(f => f.includes('--host'))).toBe(true);
    });

    test('action 是 async function', () => {
        expect(cmd.action.constructor.name).toBe('AsyncFunction');
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/cli/commands-dev-app.test.js
```

- [ ] **Step 3：写实现**

`src/cli/commands/dev-app.js`：

```js
const path = require('path');
const cp = require('child_process');
const webpack = require('webpack');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { deriveBuildInfo } = require('../../core/build-info');
const { resolveBuildConfig } = require('../../config/bc-config');
const { resolveDevServerOptions, runDevServer } = require('../../webpack-runner/run-dev-server');
const { resolveElectron } = require('../../electron/resolve-electron');
const { resolveMainEntry } = require('../../electron/resolve-main-entry');
const { killElectron } = require('../../electron/kill-electron');
const logger = require('../../core/logger');
const { extractStatsSummary } = require('../../webpack-runner/format-stats');

function compileMainPreload(mainConfig, preloadConfig) {
    return new Promise((resolve, reject) => {
        webpack([mainConfig, preloadConfig], (err, multiStats) => {
            if (err) {
                logger.compileFailure('main+preload');
                return reject(err);
            }
            const stats = multiStats.stats;
            let failed = false;
            for (let i = 0; i < stats.length; i += 1) {
                const sum = extractStatsSummary(stats[i], i === 0 ? 'main' : 'preload');
                if (sum.errorCount > 0) {
                    logger.compileFailure(sum.name);
                    console.error(stats[i].toString({ colors: true }));
                    failed = true;
                } else {
                    logger.compileSuccess(sum.name, sum.ms, sum.totalSize);
                    logger.compileWarning(sum.name, sum.warningCount);
                }
            }
            if (failed) return reject(new Error('main / preload 编译失败'));
            resolve();
        });
    });
}

module.exports = {
    name: 'dev:app',
    description: '启动 Electron 三进程开发环境（main+preload 一次性编译，renderer HMR）',
    target: TARGETS.APP,
    mode: MODES.DEV,
    needsBcConfig: true,
    needsBuilderConfig: false,
    options: [
        ['--port <n>', 'renderer dev-server 端口（默认 8023）'],
        ['--host <host>', 'renderer dev-server host（默认 localhost）'],
    ],
    action: async (ctx) => {
        const rootDir = process.cwd();
        const pkgJson = require(path.resolve(rootDir, 'package.json'));
        const buildInfo = deriveBuildInfo(ctx, pkgJson);

        const { main, preload, renderer } = resolveBuildConfig(ctx, pkgJson, buildInfo);

        // 摘出 renderer.devServer
        const { devServer: userDev = {}, ...rendererWebpack } = renderer;
        const devServerOptions = resolveDevServerOptions(ctx, userDev, { defaultPort: 8023 });
        const devUrl = `http://${devServerOptions.host}:${devServerOptions.port}`;

        // 并行：① main+preload 一次性编译 ② renderer dev-server
        const [, devServer] = await Promise.all([
            compileMainPreload(main, preload),
            runDevServer(rendererWebpack, devServerOptions, 'renderer', ctx),
        ]);

        // spawn Electron
        const electronExe = resolveElectron(rootDir);
        const mainEntry = resolveMainEntry(rootDir);
        const child = cp.spawn(electronExe, [mainEntry], {
            stdio: 'inherit',
            env: {
                ...process.env,
                NODE_ENV: 'development',
                RENDERER_DEV_URL: devUrl,
            },
        });

        // 生命周期
        const shutdown = async (exitCode = 0) => {
            killElectron(child);
            try { await devServer.stop(); } catch {}
            process.exit(exitCode);
        };

        child.on('close', (code) => shutdown(code ?? 0));
        process.on('SIGINT', () => shutdown(130));
    },
};
```

- [ ] **Step 4：跑命令模块测试确认通过**

```bash
npx jest tests/unit/cli/commands-dev-app.test.js
```

预期：3 个 test PASS。（深度集成测试在 Task 10）

- [ ] **Step 5：commit**

```bash
git add src/cli/commands/dev-app.js tests/unit/cli/commands-dev-app.test.js
git commit -m "feat(cli): 加 dev:app 命令（main+preload 一次性 + renderer HMR + spawn Electron 联动）"
```

---

### Task 9：`src/cli/index.js` 注册 dev-app + 测试

**Files:**
- Modify: `src/cli/index.js`
- Modify: `tests/unit/cli/index.test.js`

- [ ] **Step 1：修改 `src/cli/index.js` COMMANDS 数组**

把现有的：

```js
const COMMANDS = [
    require('./commands/dev-web'),
    require('./commands/build'),
    // 后续 phase：dev-app / pack / installer / child
];
```

改为：

```js
const COMMANDS = [
    require('./commands/dev-web'),
    require('./commands/build'),
    require('./commands/dev-app'),
    // 后续 phase：pack / installer / child
];
```

- [ ] **Step 2：在 `tests/unit/cli/index.test.js` `createCli` 测试中追加断言**

把已有的：

```js
expect(names).toContain('dev:web');
expect(names).toContain('build');
```

末尾追加：

```js
expect(names).toContain('dev:app');
```

- [ ] **Step 3：跑全量 cli 测试**

```bash
npx jest tests/unit/cli/
```

预期：dev-web / build / dev-app 命令模块测试 + cli/index 注册测试全 PASS。

- [ ] **Step 4：commit**

```bash
git add src/cli/index.js tests/unit/cli/index.test.js
git commit -m "feat(cli): 注册 dev:app 命令"
```

---

### Task 10：E2E 烟雾测试（mock spawn 验证编排链路）

**Files:**
- Create: `tests/fixtures/minimal-app/`（含 main.js / preload.js / renderer/index.js / renderer/index.html / bc.config.js / .env.prod / package.json + 假 node_modules/electron）
- Create: `tests/unit/e2e-dev-app.test.js`

- [ ] **Step 1：建最小 app fixture**

`tests/fixtures/minimal-app/package.json`：

```json
{
    "name": "minimal-app",
    "version": "0.0.1",
    "main": "app/main/index.js"
}
```

`tests/fixtures/minimal-app/.env.prod`：

```
BC_ENV=prod
```

`tests/fixtures/minimal-app/src/main/index.js`：

```js
// 占位空文件，仅供 webpack 编译
module.exports = {};
```

`tests/fixtures/minimal-app/src/preload/index.js`：

```js
module.exports = {};
```

`tests/fixtures/minimal-app/src/renderer/index.js`：

```js
const banner = document.createElement('div');
banner.textContent = `target=${__BC_BUILD__.target}`;
document.body.appendChild(banner);
```

`tests/fixtures/minimal-app/src/renderer/index.html`：

```html
<!DOCTYPE html><html><body><script src="/renderer/index.js"></script></body></html>
```

`tests/fixtures/minimal-app/bc.config.js`：

```js
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (ctx) => ({
    main: {},
    preload: {},
    renderer: {
        plugins: [
            new HtmlWebpackPlugin({
                template: 'src/renderer/index.html',
                filename: 'renderer/index.html',
                chunks: ['renderer'],
            }),
        ],
        devServer: { port: 19023 },
    },
});
```

`tests/fixtures/minimal-app/node_modules/electron/package.json`：

```json
{ "name": "electron", "main": "index.js", "version": "99.0.0" }
```

`tests/fixtures/minimal-app/node_modules/electron/index.js`：

```js
module.exports = '/fake/electron-binary';
```

- [ ] **Step 2：写 E2E 测试**

`tests/unit/e2e-dev-app.test.js`：

```js
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const EventEmitter = require('events');

jest.mock('child_process');

const fixtureDir = path.join(__dirname, '../fixtures/minimal-app');

describe('E2E: dev:app 编排链路（mock spawn）', () => {
    let oldCwd;
    let fakeChild;
    let server;

    beforeAll(() => {
        oldCwd = process.cwd();
        process.chdir(fixtureDir);
        // mock cp.spawn → 返回不退出的 EventEmitter
        fakeChild = new EventEmitter();
        fakeChild.pid = 999;
        fakeChild.exitCode = null;
        fakeChild.kill = jest.fn();
        cp.spawn.mockReturnValue(fakeChild);
    });

    afterAll(async () => {
        if (server) try { await server.stop(); } catch {}
        process.chdir(oldCwd);
    });

    test('编译 main+preload + 起 dev-server + spawn Electron 含 RENDERER_DEV_URL', async () => {
        const cmd = require('../../src/cli/commands/dev-app');
        const { runCommand } = require('../../src/cli/index');

        // hook runDevServer 拿 server 引用
        const runDevServerMod = require('../../src/webpack-runner/run-dev-server');
        const original = runDevServerMod.runDevServer;
        runDevServerMod.runDevServer = async (...args) => {
            server = await original(...args);
            return server;
        };

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

        try {
            // 不等 action 永远 resolve（dev:app 是常驻进程）；用超时让它启动
            const actionPromise = runCommand(cmd, { env: 'prod' });
            await new Promise((r) => setTimeout(r, 8000));

            // 验证 webpack 编译产物落地
            expect(fs.existsSync(path.join(fixtureDir, 'app/main/index.js'))).toBe(true);
            expect(fs.existsSync(path.join(fixtureDir, 'app/preload/index.js'))).toBe(true);

            // 验证 spawn 被调用，参数含 electron exe + main entry + 注入了 RENDERER_DEV_URL
            expect(cp.spawn).toHaveBeenCalledTimes(1);
            const [exe, args, opts] = cp.spawn.mock.calls[0];
            expect(exe).toBe('/fake/electron-binary');
            expect(args[0]).toContain('app/main/index.js');
            expect(opts.env.NODE_ENV).toBe('development');
            expect(opts.env.RENDERER_DEV_URL).toBe('http://localhost:19023');

            // 模拟 Electron 退出
            fakeChild.exitCode = 0;
            fakeChild.emit('close', 0);

            // 容许 shutdown 执行
            await new Promise((r) => setTimeout(r, 500));
            expect(exitSpy).toHaveBeenCalled();
        } finally {
            runDevServerMod.runDevServer = original;
            exitSpy.mockRestore();
        }
    }, 30000);
});
```

- [ ] **Step 3：跑 E2E**

```bash
npx jest tests/unit/e2e-dev-app.test.js --runInBand
```

预期：1 个 test PASS。

- [ ] **Step 4：跑全量测试**

```bash
npx jest --runInBand
```

预期：Phase 1 + 2 + 3 所有测试 PASS。

- [ ] **Step 5：commit**

```bash
git add tests/fixtures/minimal-app/ tests/unit/e2e-dev-app.test.js
git commit -m "test(e2e): 加 dev:app E2E（mock spawn 验证 main+preload 编译 / dev-server / RENDERER_DEV_URL 注入）"
```

---

## Phase 3 完成态

- 新增 7 个 src/ 文件（presets 3 + electron 3 + commands 1）
- bc-config 接 app target 分支
- cli/index 注册 dev:app
- 新增 8 份测试文件 + 修改 2 份；全部 PASS
- `bc-frame dev:app` 在 fixture project 中能编译三进程 + 起 dev-server + spawn 假 electron + 退出收尾

## 下一 Phase 衔接点

Phase 4（pack 核心）会复用：

- 三个预设（main/preload/renderer）
- bc-config 的 app target 分支（同样产 `{main, preload, renderer}`，但 mode 为 production）
- `runProductionBuild` 传 `[main, preload, renderer]` 跑三进程并行生产编译

Phase 4 新增：

- `src/config/merge.js`（customMerge + replace + REPLACE Symbol，专供 electron-builder.config 合并）
- `src/config/builder-config.js`（resolveBuilderConfig）
- `src/config/presets/pack.js`（getPackPreset）
- `src/electron/resolve-electron-builder.js`
- `src/pack/icon.js`、`src/pack/shell.js`
- `src/templates/shell/*`
- `src/cli/commands/pack.js`（基础形态，无 encrypt/bytenode/incremental——P5 再加）
