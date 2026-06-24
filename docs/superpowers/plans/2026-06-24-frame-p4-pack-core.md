# Frame Phase 4：`pack` 核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `bc-frame pack` 的核心三阶段编排——阶段 A（env / CLI / `__BC_BUILD__` / icon 自适配 / 平台脚本生成 / electron-builder.config 加载与合并）、阶段 B（三进程并行生产构建）、阶段 C（调 electron-builder 出安装包）。**本 phase 不实现 AES 加密 / bytenode / 增量 .asax**——三项能力在 Phase 5 接入；P4 中这些开关被读取但不参与执行。

**Architecture:** 复用 P1+P2+P3 的 core / 三进程预设 / `runProductionBuild` / bc-config / electron 工具；新增 `config/merge.js`（customMerge + replace + REPLACE Symbol）、`config/builder-config.js`（resolveBuilderConfig）、`config/presets/pack.js`（getPackPreset）、`electron/resolve-electron-builder.js`、`electron/build-targets.js`、`pack/icon.js`、`pack/shell.js`、`templates/shell/*` 内置脚本模板、`cli/commands/pack.js` 基础形态。

**Tech Stack:** Node.js, webpack 5（peer）, electron-builder（peer）, sharp（dep，PNG 多尺寸缩放）, png2icons（dep，ICO/ICNS 生成）, webpack-merge（已在 P1 引入）, jest 30。

**Phase 范围**：`pack` 基础形态（含 icon 自适配、平台脚本生成、`--platform/--arch/--unpack/--sign` 四个专属 flag）。**不含** AES 加密、bytenode、`.asax`、`.frame-state.json`、`child` / `installer` 命令——这些分别由 P5 与 P6 承接。

**对应 spec 章节**：[2026-06-24-frame-design.md](../specs/2026-06-24-frame-design.md) § 5.2 / § 5.3 / § 9.1 pack 流程 / § 9.4 pack 命令选项 / § 10.1 icon / § 10.2 平台脚本 / § 10.6 --sign 透传。

**前置 Phase**：P1 + P2 + P3 都已完成。

---

## 文件结构（Phase 4 增量）

```
src/
├── config/
│   ├── merge.js                         # 新增：customMerge + replace + REPLACE
│   ├── builder-config.js                # 新增：resolveBuilderConfig
│   └── presets/
│       └── pack.js                      # 新增：getPackPreset
├── electron/
│   ├── resolve-electron-builder.js      # 新增
│   └── build-targets.js                 # 新增：buildTargets(cliOptions)
├── pack/                                # 新增整目录
│   ├── icon.js                          # 新增：adaptIcon
│   └── shell.js                         # 新增：generateShellScripts
├── templates/                           # 新增整目录
│   └── shell/
│       ├── win-installer.nsh
│       ├── deb-preinstall.sh
│       ├── deb-postinstall.sh
│       └── deb-postrm.sh
├── cli/
│   ├── commands/
│   │   └── pack.js                      # 新增
│   └── index.js                         # 修改：注册 pack

package.json                             # 修改：dependencies 加 sharp / png2icons
rollup.config.mjs                        # 修改：copy templates/shell/ 到 dist/

tests/unit/
├── config/
│   ├── merge.test.js
│   ├── builder-config.test.js
│   └── presets-pack.test.js
├── electron/
│   ├── resolve-electron-builder.test.js
│   └── build-targets.test.js
├── pack/
│   ├── icon.test.js
│   └── shell.test.js
├── cli/
│   ├── commands-pack.test.js
│   └── index.test.js                    # 修改：注册断言
└── e2e-pack-core.test.js                # 新增（mock electron-builder）
```

---

## Tasks

### Task 1：`src/config/merge.js`（customMerge + replace）+ 测试

**Files:**
- Create: `src/config/merge.js`
- Create: `tests/unit/config/merge.test.js`

- [ ] **Step 1：写测试**

`tests/unit/config/merge.test.js`：

```js
const { customMerge, replace } = require('../../../src/config/merge');

describe('config/merge', () => {
    test('标量：用户值覆盖 preset 值', () => {
        const out = customMerge({ appId: 'A' }, { appId: 'B' });
        expect(out.appId).toBe('B');
    });

    test('对象：递归深合并', () => {
        const out = customMerge({ win: { icon: 'a.ico' } }, { win: { target: 'nsis' } });
        expect(out.win).toEqual({ icon: 'a.ico', target: 'nsis' });
    });

    test('数组默认追加', () => {
        const out = customMerge({ files: ['a', 'b'] }, { files: ['c', 'd'] });
        expect(out.files).toEqual(['a', 'b', 'c', 'd']);
    });

    test('replace 标记的数组整组替换', () => {
        const out = customMerge({ files: ['a', 'b'] }, { files: replace(['c']) });
        expect(out.files).toEqual(['c']);
    });

    test('replace 返回值仍是 Array', () => {
        const arr = replace(['x', 'y']);
        expect(Array.isArray(arr)).toBe(true);
        expect(arr).toEqual(['x', 'y']);
    });

    test('preset 缺数组、user 用 replace 也整组生效', () => {
        const out = customMerge({}, { fpm: replace(['--x']) });
        expect(out.fpm).toEqual(['--x']);
    });

    test('user 缺该字段时 preset 透传', () => {
        const out = customMerge({ productName: 'A' }, {});
        expect(out.productName).toBe('A');
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/config/merge.test.js
```

- [ ] **Step 3：写实现**

`src/config/merge.js`：

```js
const { mergeWithCustomize } = require('webpack-merge');

const REPLACE = Symbol('replace');

function replace(arr) {
    const tagged = arr.slice();
    Object.defineProperty(tagged, REPLACE, { value: true, enumerable: false });
    return tagged;
}

function customMerge(preset, user) {
    return mergeWithCustomize({
        customizeArray: (presetArr, userArr) => {
            if (userArr && userArr[REPLACE]) return Array.from(userArr);
            return [...(presetArr || []), ...(userArr || [])];
        },
    })(preset, user);
}

module.exports = { customMerge, replace, REPLACE };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/config/merge.test.js
```

预期：7 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/config/merge.js tests/unit/config/merge.test.js
git commit -m "feat(config): 加 customMerge + replace（数组追加默认，REPLACE Symbol 标记整组替换）"
```

---

### Task 2：`src/electron/resolve-electron-builder.js` + 测试

**Files:**
- Create: `src/electron/resolve-electron-builder.js`
- Create: `tests/unit/electron/resolve-electron-builder.test.js`

- [ ] **Step 1：写测试**

`tests/unit/electron/resolve-electron-builder.test.js`：

```js
const path = require('path');
const fs = require('fs');
const { resolveElectronBuilder } = require('../../../src/electron/resolve-electron-builder');

const fixtureDir = path.join(__dirname, '../../tmp/resolve-electron-builder');

beforeEach(() => {
    fs.mkdirSync(fixtureDir, { recursive: true });
    const ebDir = path.join(fixtureDir, 'node_modules/electron-builder');
    fs.mkdirSync(ebDir, { recursive: true });
    fs.writeFileSync(path.join(ebDir, 'package.json'), JSON.stringify({
        name: 'electron-builder', main: 'out/index.js', version: '24.0.0',
    }));
    fs.mkdirSync(path.join(ebDir, 'out'), { recursive: true });
    fs.writeFileSync(path.join(ebDir, 'out/index.js'), `module.exports = { build: () => Promise.resolve([]) };`);
});
afterEach(() => { fs.rmSync(fixtureDir, { recursive: true, force: true }); });

describe('electron/resolve-electron-builder', () => {
    test('从 rootDir 解析 electron-builder 模块，返回其默认导出', () => {
        const eb = resolveElectronBuilder(fixtureDir);
        expect(typeof eb.build).toBe('function');
    });

    test('rootDir 下无 electron-builder 时抛错', () => {
        const empty = path.join(__dirname, '../../tmp/no-eb');
        fs.mkdirSync(empty, { recursive: true });
        try {
            expect(() => resolveElectronBuilder(empty)).toThrow(/electron-builder/i);
        } finally {
            fs.rmSync(empty, { recursive: true, force: true });
        }
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/electron/resolve-electron-builder.test.js
```

- [ ] **Step 3：写实现**

`src/electron/resolve-electron-builder.js`：

```js
/**
 * 从用户项目 rootDir 解析 electron-builder 模块（默认导出）。
 * 不列入 frame 的 dependencies / peerDependencies——按需解析；缺失时报错。
 */
function resolveElectronBuilder(rootDir) {
    let entryPath;
    try {
        entryPath = require.resolve('electron-builder', { paths: [rootDir] });
    } catch (err) {
        throw new Error(`[base-client] electron-builder 未安装，请在项目中 npm i -D electron-builder`);
    }
    return require(entryPath);
}

module.exports = { resolveElectronBuilder };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/electron/resolve-electron-builder.test.js
```

预期：2 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/electron/resolve-electron-builder.js tests/unit/electron/resolve-electron-builder.test.js
git commit -m "feat(electron): 加 resolveElectronBuilder（按需从用户项目 node_modules 解析）"
```

---

### Task 3：`src/electron/build-targets.js` + 测试

**Files:**
- Create: `src/electron/build-targets.js`
- Create: `tests/unit/electron/build-targets.test.js`

设计：把 `cliOptions.{platform,arch,unpack}` 翻译为 electron-builder programmatic API 的 `CliOptions` 形态：`{ [platform]: [...targets], [arch]: true }`。

- [ ] **Step 1：写测试**

`tests/unit/electron/build-targets.test.js`：

```js
const { buildTargets } = require('../../../src/electron/build-targets');

describe('electron/build-targets', () => {
    test('win + x64：{ win: ["nsis"], x64: true }', () => {
        expect(buildTargets({ platform: 'win', arch: 'x64' })).toEqual({ win: ['nsis'], x64: true });
    });

    test('mac + arm64：{ mac: ["dmg"], arm64: true }', () => {
        expect(buildTargets({ platform: 'mac', arch: 'arm64' })).toEqual({ mac: ['dmg'], arm64: true });
    });

    test('linux + x64：{ linux: ["deb"], x64: true }', () => {
        expect(buildTargets({ platform: 'linux', arch: 'x64' })).toEqual({ linux: ['deb'], x64: true });
    });

    test('--unpack 时 targets 改为 dir', () => {
        expect(buildTargets({ platform: 'win', arch: 'x64', unpack: true })).toEqual({ win: ['dir'], x64: true });
    });

    test('缺 platform → 抛错', () => {
        expect(() => buildTargets({ arch: 'x64' })).toThrow(/--platform/);
    });

    test('未知 platform → 抛错', () => {
        expect(() => buildTargets({ platform: 'ios', arch: 'arm64' })).toThrow(/不支持的平台/);
    });

    test('缺 arch → 抛错', () => {
        expect(() => buildTargets({ platform: 'win' })).toThrow(/--arch/);
    });

    test('未知 arch → 抛错', () => {
        expect(() => buildTargets({ platform: 'win', arch: 'mips' })).toThrow(/不支持的架构/);
    });

    test('loong64 / armv7l / universal / ia32 均合法', () => {
        expect(buildTargets({ platform: 'linux', arch: 'loong64' })).toEqual({ linux: ['deb'], loong64: true });
        expect(buildTargets({ platform: 'linux', arch: 'armv7l' })).toEqual({ linux: ['deb'], armv7l: true });
        expect(buildTargets({ platform: 'mac', arch: 'universal' })).toEqual({ mac: ['dmg'], universal: true });
        expect(buildTargets({ platform: 'win', arch: 'ia32' })).toEqual({ win: ['nsis'], ia32: true });
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/electron/build-targets.test.js
```

- [ ] **Step 3：写实现**

`src/electron/build-targets.js`：

```js
const PLATFORM_MAP = { win: ['nsis'], mac: ['dmg'], linux: ['deb'] };
const ARCH_LIST = ['ia32', 'x64', 'armv7l', 'arm64', 'universal', 'loong64'];

function buildTargets({ platform, arch, unpack }) {
    if (!platform) throw new Error('[base-client] 缺少 --platform');
    if (!PLATFORM_MAP[platform]) throw new Error(`[base-client] 不支持的平台：${platform}`);
    if (!arch) throw new Error('[base-client] 缺少 --arch');
    if (!ARCH_LIST.includes(arch)) throw new Error(`[base-client] 不支持的架构：${arch}`);
    return {
        [platform]: unpack ? ['dir'] : PLATFORM_MAP[platform],
        [arch]: true,
    };
}

module.exports = { buildTargets, PLATFORM_MAP, ARCH_LIST };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/electron/build-targets.test.js
```

预期：9 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/electron/build-targets.js tests/unit/electron/build-targets.test.js
git commit -m "feat(electron): 加 buildTargets（cliOptions → electron-builder CliOptions 翻译）"
```

---

### Task 4：`src/config/presets/pack.js`（getPackPreset）+ 测试

**Files:**
- Create: `src/config/presets/pack.js`
- Create: `tests/unit/config/presets-pack.test.js`

设计：参考 spec § 5.2 / § 6 / § 9.1 与 P1+P2 现状。`getPackPreset(ctx, pkgJson)` 产 electron-builder 基线 config，含产物布局（`directories.output: 'dist'`、`files: ['app/**/*', 'package.json', '!**/node_modules/**']`、`extraMetadata.main: 'main/index.js'`），及 pkgJson 派生默认（productName / copyright / artifactName）。**不**注入龙芯 electronDownload（spec § 5.2 要求用户自管）。

- [ ] **Step 1：写测试**

`tests/unit/config/presets-pack.test.js`：

```js
const { getPackPreset } = require('../../../src/config/presets/pack');

const baseCtx = (over = {}) => ({
    target: 'app',
    command: 'pack',
    mode: 'production',
    isDev: false, isProd: true, isApp: true, isWeb: false,
    cliOptions: { platform: 'win', arch: 'x64' },
    env: { BC_ENV: 'prod' },
    ...over,
});
const pkgJson = { name: 'demo', productName: 'Demo App', version: '1.2.3', author: 'lhc' };

describe('config/presets/pack', () => {
    test('directories.output = "dist"', () => {
        const p = getPackPreset(baseCtx(), pkgJson);
        expect(p.directories.output).toBe('dist');
    });

    test('files：app + package.json + 排除 node_modules', () => {
        const p = getPackPreset(baseCtx(), pkgJson);
        expect(p.files).toEqual(expect.arrayContaining([
            expect.objectContaining({ from: 'app', to: '.' }),
            'package.json',
            '!**/node_modules/**',
        ]));
    });

    test('extraMetadata.main = "main/index.js"', () => {
        const p = getPackPreset(baseCtx(), pkgJson);
        expect(p.extraMetadata.main).toBe('main/index.js');
    });

    test('productName = pkgJson.productName ?? pkgJson.name', () => {
        expect(getPackPreset(baseCtx(), pkgJson).productName).toBe('Demo App');
        expect(getPackPreset(baseCtx(), { name: 'demo', version: '1.0.0' }).productName).toBe('demo');
    });

    test('copyright 含年份与 author', () => {
        const year = new Date().getFullYear();
        const p = getPackPreset(baseCtx(), pkgJson);
        expect(p.copyright).toContain(String(year));
        expect(p.copyright).toContain('lhc');
    });

    test('artifactName 默认带 BC_ENV 维度', () => {
        const p = getPackPreset(baseCtx(), pkgJson);
        expect(p.artifactName).toContain('${env.BC_ENV}');
        expect(p.artifactName).toContain('${productName}');
        expect(p.artifactName).toContain('${version}');
    });

    test('不提供 appId 默认（由用户必填）', () => {
        const p = getPackPreset(baseCtx(), pkgJson);
        expect(p.appId).toBeUndefined();
    });

    test('preset 不注入 electronDownload / electronVersion（即使 arch=loong64）', () => {
        const p = getPackPreset(baseCtx({ cliOptions: { platform: 'linux', arch: 'loong64' } }), pkgJson);
        expect(p.electronDownload).toBeUndefined();
        expect(p.electronVersion).toBeUndefined();
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/config/presets-pack.test.js
```

- [ ] **Step 3：写实现**

`src/config/presets/pack.js`：

```js
/**
 * 产 electron-builder 配置预设，作为用户 electron-builder.config.js 合并基线。
 * 龙芯由用户自管（preset 不注入 electronDownload）。
 *
 * @param {object} ctx - { cliOptions, env, ... }
 * @param {object} pkgJson - 用户 package.json
 */
function getPackPreset(ctx, pkgJson) {
    const year = new Date().getFullYear();
    const author = pkgJson.author ?? '';
    const productName = pkgJson.productName ?? pkgJson.name;

    return {
        // A. 产物布局
        directories: { output: 'dist' },
        files: [
            { from: 'app', to: '.' },
            'package.json',
            '!**/node_modules/**',
        ],
        extraMetadata: { main: 'main/index.js' },

        // B. pkgJson 派生默认（appId 不提供，用户必填）
        productName,
        copyright: `Copyright © ${year} ${author}`.trim(),
        artifactName: '${productName}_${os}_${arch}_${env.BC_ENV}_v${version}.${ext}',
    };
}

module.exports = { getPackPreset };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/config/presets-pack.test.js
```

预期：8 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/config/presets/pack.js tests/unit/config/presets-pack.test.js
git commit -m "feat(presets): 加 getPackPreset（electron-builder 基线 config：产物布局 + pkgJson 派生）"
```

---

### Task 5：`src/config/builder-config.js`（resolveBuilderConfig）+ 测试

**Files:**
- Create: `src/config/builder-config.js`
- Create: `tests/unit/config/builder-config.test.js`

设计：定位 / 加载 `electron-builder.config.js` 函数式导出 → 注入 `ctx + replace` → customMerge 与 preset 合并。

- [ ] **Step 1：写测试**

`tests/unit/config/builder-config.test.js`：

```js
const path = require('path');
const fs = require('fs');
const { resolveBuilderConfig } = require('../../../src/config/builder-config');

const fixtureDir = path.join(__dirname, '../../fixtures/builder-config');
const pkgJson = { name: 'demo', productName: 'Demo App', version: '1.0.0' };

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
});
afterAll(() => { fs.rmSync(fixtureDir, { recursive: true, force: true }); });

const ctx = (over = {}) => ({
    command: 'pack',
    target: 'app',
    mode: 'production',
    isDev: false, isProd: true, isApp: true, isWeb: false,
    cliOptions: { platform: 'win', arch: 'x64', packConfig: path.join(fixtureDir, 'electron-builder.config.js') },
    env: { BC_ENV: 'prod', WIN_CODE_SIGN_PWD: 'pwd' },
    ...over,
});

describe('config/builder-config', () => {
    test('加载 + 合并 preset 与用户配置', () => {
        const c = resolveBuilderConfig(ctx(), pkgJson);
        expect(c.appId).toBe('com.demo.app');                // 用户必填字段透传
        expect(c.directories.output).toBe('dist');           // preset 来
        expect(c.productName).toBe('Demo App');              // preset 派生
    });

    test('用户 files 用 replace 时整组替换 preset.files', () => {
        const c = resolveBuilderConfig(ctx(), pkgJson);
        expect(c.files).toEqual(['package.json', '!**/node_modules/**']);   // 不含 preset 的 { from: 'app', to: '.' }
    });

    test('--sign 时用户分支启用 certificateFile', () => {
        const c = resolveBuilderConfig(ctx({ cliOptions: { ...ctx().cliOptions, sign: true } }), pkgJson);
        expect(c.win.certificateFile).toBe('build/cert.pfx');
    });

    test('未传 --sign 时 certificateFile 为 undefined', () => {
        const c = resolveBuilderConfig(ctx(), pkgJson);
        expect(c.win.certificateFile).toBeUndefined();
    });

    test('--pack-config 路径不存在时抛错', () => {
        const bad = ctx({ cliOptions: { ...ctx().cliOptions, packConfig: '/nonexistent/eb.config.js' } });
        expect(() => resolveBuilderConfig(bad, pkgJson)).toThrow(/未找到 electron-builder\.config/);
    });

    test('--pack-config 缺省且 cwd 无 electron-builder.config.* 时抛错', () => {
        const emptyDir = path.join(__dirname, '../../fixtures/builder-empty');
        fs.mkdirSync(emptyDir, { recursive: true });
        const oldCwd = process.cwd();
        try {
            process.chdir(emptyDir);
            const noCfg = ctx({ cliOptions: { platform: 'win', arch: 'x64' } });
            expect(() => resolveBuilderConfig(noCfg, pkgJson)).toThrow(/未找到 electron-builder\.config/);
        } finally {
            process.chdir(oldCwd);
            fs.rmSync(emptyDir, { recursive: true, force: true });
        }
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/config/builder-config.test.js
```

- [ ] **Step 3：写实现**

`src/config/builder-config.js`：

```js
const path = require('path');
const fs = require('fs');
const { customMerge, replace } = require('./merge');
const { getPackPreset } = require('./presets/pack');

const CONFIG_NAMES = ['electron-builder.config.js', 'electron-builder.config.cjs', 'electron-builder.config.mjs'];

function locateBuilderConfig(cwd, explicit) {
    if (explicit) {
        if (!fs.existsSync(explicit)) {
            throw new Error(`[base-client] 未找到 electron-builder.config（--pack-config 指定的路径不存在）：${explicit}`);
        }
        return explicit;
    }
    for (const name of CONFIG_NAMES) {
        const p = path.join(cwd, name);
        if (fs.existsSync(p)) return p;
    }
    throw new Error(`[base-client] 未找到 electron-builder.config.js（cwd=${cwd}）`);
}

function loadUserBuilderConfig(configPath, ctx) {
    const loaded = require(configPath);
    const fn = loaded.default ?? loaded;
    if (typeof fn !== 'function') {
        throw new Error(`[base-client] electron-builder.config 必须导出函数 (ctx) => config`);
    }
    return fn({ ...ctx, replace }) || {};
}

/**
 * 加载 electron-builder.config + customMerge 与 preset 合并。
 *
 * @param {object} ctx
 * @param {object} pkgJson
 * @returns {object} mergedBuilderConfig
 */
function resolveBuilderConfig(ctx, pkgJson) {
    const cwd = process.cwd();
    const configPath = locateBuilderConfig(cwd, ctx.cliOptions.packConfig);
    const userConfig = loadUserBuilderConfig(configPath, ctx);
    const preset = getPackPreset(ctx, pkgJson);
    return customMerge(preset, userConfig);
}

module.exports = { resolveBuilderConfig };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/config/builder-config.test.js
```

预期：6 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/config/builder-config.js tests/unit/config/builder-config.test.js
git commit -m "feat(config): 加 resolveBuilderConfig（加载 electron-builder.config + customMerge with preset）"
```

---

### Task 6：内置平台脚本模板 + rollup copy 配置

**Files:**
- Create: `src/templates/shell/win-installer.nsh`
- Create: `src/templates/shell/deb-preinstall.sh`
- Create: `src/templates/shell/deb-postinstall.sh`
- Create: `src/templates/shell/deb-postrm.sh`
- Modify: `rollup.config.mjs`（加 copy 插件把 templates 复制到 dist/）
- Modify: `package.json`（如需 rollup-plugin-copy）

- [ ] **Step 1：建模板文件（极简内容；真实模板待后续按需扩展）**

`src/templates/shell/win-installer.nsh`：

```nsh
; Windows NSIS 自定义安装脚本（{{APP_NAME}} / {{APP_DIR_NAME}} / {{APP_ID}}）
; 版本检测 / 自定义安装页面 / 注册表清理等
!define APP_NAME "{{APP_NAME}}"
!define APP_DIR "{{APP_DIR_NAME}}"
!define APP_ID "{{APP_ID}}"

!macro preInit
    ; 安装前置逻辑
!macroend

!macro customInstall
    ; 自定义安装步骤
!macroend
```

`src/templates/shell/deb-preinstall.sh`：

```sh
#!/bin/sh
# DEB 安装前钩子：杀进程、清旧快捷方式
APP_NAME="{{APP_NAME}}"
APP_DIR="{{APP_DIR_NAME}}"
APP_ID="{{APP_ID}}"

# 杀进程
pkill -f "${APP_DIR}" 2>/dev/null || true

# 龙芯系统识别（loongnix）
if [ -f /etc/loongnix-release ] || grep -qi "loongnix" /etc/os-release 2>/dev/null; then
    echo "[${APP_NAME}] Loongnix system detected"
fi

exit 0
```

`src/templates/shell/deb-postinstall.sh`：

```sh
#!/bin/sh
# DEB 安装后钩子：命令行链接、桌面快捷方式、SUID chrome-sandbox
APP_NAME="{{APP_NAME}}"
APP_DIR="{{APP_DIR_NAME}}"
APP_ID="{{APP_ID}}"

INSTALL_DIR="/opt/${APP_DIR}"
BIN_LINK="/usr/local/bin/${APP_DIR}"

# 命令行链接
ln -sf "${INSTALL_DIR}/${APP_DIR}" "${BIN_LINK}" 2>/dev/null || true

# SUID chrome-sandbox
if [ -f "${INSTALL_DIR}/chrome-sandbox" ]; then
    chmod 4755 "${INSTALL_DIR}/chrome-sandbox" || true
fi

# 龙芯系统额外步骤
if [ -f /etc/loongnix-release ] || grep -qi "loongnix" /etc/os-release 2>/dev/null; then
    echo "[${APP_NAME}] Loongnix postinstall completed"
fi

exit 0
```

`src/templates/shell/deb-postrm.sh`：

```sh
#!/bin/sh
# DEB 卸载后钩子：清命令行链接、清桌面快捷方式
APP_DIR="{{APP_DIR_NAME}}"
BIN_LINK="/usr/local/bin/${APP_DIR}"

rm -f "${BIN_LINK}" 2>/dev/null || true
exit 0
```

- [ ] **Step 2：装 rollup-plugin-copy（如未装）**

```bash
npm install --save-dev rollup-plugin-copy
```

- [ ] **Step 3：修改 `rollup.config.mjs`，把 templates 复制到 dist/**

在 rollup config 的 plugins 数组末尾加：

```js
import copy from 'rollup-plugin-copy';

// ... 在 plugins 中追加：
copy({
    targets: [
        { src: 'src/templates/**/*', dest: 'dist/templates' },
    ],
    hook: 'writeBundle',
}),
```

确保 CLI bundle 与 Framework bundle 至少其一带这个 copy 插件（推荐放在 CLI bundle）。

- [ ] **Step 4：跑构建验证 dist/templates 产出**

```bash
npm run build
ls dist/templates/shell/
```

预期：4 个模板文件全部在 `dist/templates/shell/`。

- [ ] **Step 5：commit**

```bash
git add src/templates/ rollup.config.mjs package.json package-lock.json
git commit -m "chore(templates): 加平台脚本模板（nsh + deb pre/post/postrm）+ rollup copy 配置"
```

---

### Task 7：`src/pack/shell.js`（生成平台脚本）+ 测试

**Files:**
- Create: `src/pack/shell.js`
- Create: `tests/unit/pack/shell.test.js`

设计：读 `src/templates/shell/<name>` → 替换 `{{APP_NAME}}` / `{{APP_DIR_NAME}}` / `{{APP_ID}}` → UTF-8 无 BOM + CRLF→LF → 写 `dist/shell/<name>` → 按需注入 `mergedBuilderConfig.nsis.include` 与 `deb.fpm`（未写时）。

注意：dist 路径 templates 在生产是 `dist/templates/shell/`（rollup copy 后），开发是 `src/templates/shell/`。frame 代码用 `path.join(__dirname, '../templates/shell/<name>')` 相对自身 dist 位置。

- [ ] **Step 1：写测试**

`tests/unit/pack/shell.test.js`：

```js
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const { generateShellScripts } = require('../../../src/pack/shell');

const tmpDir = path.join(__dirname, '../../tmp/shell');

beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
});
afterEach(() => {
    fse.removeSync(tmpDir);
});

describe('pack/shell', () => {
    test('生成 4 个脚本到 dist/shell/，替换变量', () => {
        const distDir = path.join(tmpDir, 'dist');
        const mergedBuilderConfig = {};
        generateShellScripts({
            rootDir: tmpDir,
            distDir,
            mergedBuilderConfig,
            appName: 'demo',
            appDirName: 'Demo App',
            appId: 'com.demo.app',
        });
        const shellDir = path.join(distDir, 'shell');
        const nsh = fs.readFileSync(path.join(shellDir, 'win-installer.nsh'), 'utf8');
        const pre = fs.readFileSync(path.join(shellDir, 'deb-preinstall.sh'), 'utf8');
        expect(nsh).toContain('"demo"');
        expect(nsh).toContain('"Demo App"');
        expect(nsh).toContain('"com.demo.app"');
        expect(pre).toContain('"demo"');
        // 不含 CRLF
        expect(nsh).not.toContain('\r\n');
        expect(pre).not.toContain('\r\n');
    });

    test('未设置 nsis.include 时注入 dist/shell/win-installer.nsh', () => {
        const mergedBuilderConfig = {};
        generateShellScripts({
            rootDir: tmpDir,
            distDir: path.join(tmpDir, 'dist'),
            mergedBuilderConfig,
            appName: 'demo', appDirName: 'demo', appId: 'com.demo',
        });
        expect(mergedBuilderConfig.nsis.include).toBe('dist/shell/win-installer.nsh');
    });

    test('已设置 nsis.include 时不覆盖', () => {
        const mergedBuilderConfig = { nsis: { include: 'build/custom.nsh' } };
        generateShellScripts({
            rootDir: tmpDir,
            distDir: path.join(tmpDir, 'dist'),
            mergedBuilderConfig,
            appName: 'demo', appDirName: 'demo', appId: 'com.demo',
        });
        expect(mergedBuilderConfig.nsis.include).toBe('build/custom.nsh');
    });

    test('未设置 deb.fpm 时注入 3 个 hook', () => {
        const mergedBuilderConfig = {};
        generateShellScripts({
            rootDir: tmpDir,
            distDir: path.join(tmpDir, 'dist'),
            mergedBuilderConfig,
            appName: 'demo', appDirName: 'demo', appId: 'com.demo',
        });
        expect(mergedBuilderConfig.deb.fpm).toEqual(expect.arrayContaining([
            '--before-install=dist/shell/deb-preinstall.sh',
            '--after-install=dist/shell/deb-postinstall.sh',
            '--after-remove=dist/shell/deb-postrm.sh',
        ]));
    });

    test('已有 deb.fpm 数组（非空）时不追加', () => {
        const mergedBuilderConfig = { deb: { fpm: ['--my-flag'] } };
        generateShellScripts({
            rootDir: tmpDir,
            distDir: path.join(tmpDir, 'dist'),
            mergedBuilderConfig,
            appName: 'demo', appDirName: 'demo', appId: 'com.demo',
        });
        expect(mergedBuilderConfig.deb.fpm).toEqual(['--my-flag']);
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/pack/shell.test.js
```

- [ ] **Step 3：写实现**

`src/pack/shell.js`：

```js
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

// templates 在 dist/templates/shell/（rollup copy 后）和开发期 src/templates/shell/
// frame 代码用 path.join(__dirname, '../templates/shell/...')，从 src/pack/shell.js 看 → src/templates/shell；从 dist/pack/shell.js 看 → dist/templates/shell。
// 但 rollup bundle 后，pack/shell.js 内容可能被合到 dist/cli/index.js；不再保留目录结构。
// 因此运行时定位 templates 用 require.resolve + 相对路径——更稳：约定从 frame 包根的 dist/templates/shell。
function templatesDir() {
    // require.resolve('@base-client/frame/package.json') 拿到 frame 包根
    const pkgPath = path.join(__dirname, '../../package.json');
    const root = path.dirname(pkgPath);
    return path.join(root, 'dist/templates/shell');
}

// 用于开发期单元测试：允许覆盖 templates 路径
let _templatesDirOverride = null;
function setTemplatesDir(p) { _templatesDirOverride = p; }
function getTemplatesDir() { return _templatesDirOverride || templatesDir(); }

const FILES = [
    'win-installer.nsh',
    'deb-preinstall.sh',
    'deb-postinstall.sh',
    'deb-postrm.sh',
];

function normalizeLineEndings(s) {
    return s.replace(/\r\n/g, '\n');
}

function renderTemplate(content, vars) {
    return content
        .replace(/\{\{APP_NAME\}\}/g, vars.appName)
        .replace(/\{\{APP_DIR_NAME\}\}/g, vars.appDirName)
        .replace(/\{\{APP_ID\}\}/g, vars.appId);
}

function generateShellScripts({ rootDir, distDir, mergedBuilderConfig, appName, appDirName, appId, templatesDir: customTemplatesDir }) {
    // 测试时允许直接传 templatesDir；否则用包内默认 dist/templates/shell
    const tplDir = customTemplatesDir || (fs.existsSync(getTemplatesDir()) ? getTemplatesDir() : path.join(__dirname, '../templates/shell'));
    const shellDir = path.join(distDir, 'shell');
    fse.ensureDirSync(shellDir);

    for (const name of FILES) {
        const src = path.join(tplDir, name);
        const out = path.join(shellDir, name);
        const raw = fs.readFileSync(src, 'utf8');
        const rendered = normalizeLineEndings(renderTemplate(raw, { appName, appDirName, appId }));
        fs.writeFileSync(out, rendered, { encoding: 'utf8' });
    }

    // 按需注入 mergedBuilderConfig
    if (!mergedBuilderConfig.nsis) mergedBuilderConfig.nsis = {};
    if (mergedBuilderConfig.nsis.include === undefined) {
        mergedBuilderConfig.nsis.include = 'dist/shell/win-installer.nsh';
    }

    if (!mergedBuilderConfig.deb) mergedBuilderConfig.deb = {};
    if (!Array.isArray(mergedBuilderConfig.deb.fpm) || mergedBuilderConfig.deb.fpm.length === 0) {
        mergedBuilderConfig.deb.fpm = [
            '--before-install=dist/shell/deb-preinstall.sh',
            '--after-install=dist/shell/deb-postinstall.sh',
            '--after-remove=dist/shell/deb-postrm.sh',
        ];
    }
}

module.exports = { generateShellScripts, setTemplatesDir };
```

- [ ] **Step 4：调整测试以传 customTemplatesDir 指向 src/templates/shell**

在 `tests/unit/pack/shell.test.js` 每个 generateShellScripts 调用中追加 `templatesDir: path.join(__dirname, '../../../src/templates/shell')`。

- [ ] **Step 5：跑测试确认通过**

```bash
npx jest tests/unit/pack/shell.test.js
```

预期：5 个 test PASS。

- [ ] **Step 6：commit**

```bash
git add src/pack/shell.js tests/unit/pack/shell.test.js
git commit -m "feat(pack): 加 generateShellScripts（模板替换 + LF 行尾 + mergedBuilderConfig 按需注入）"
```

---

### Task 8：`src/pack/icon.js`（icon 自适配）+ 测试

**Files:**
- Create: `src/pack/icon.js`
- Create: `tests/unit/pack/icon.test.js`
- Modify: `package.json`（加 `sharp` + `png2icons` 到 dependencies）

设计：lazy-load `sharp`（PNG 缩放）+ `png2icons`（ICO/ICNS 生成）。`adaptIcon` 跳过条件：① `build/icon.png` 不存在；② `mergedBuilderConfig.{win,mac,linux}.icon` 全已显式覆盖。

- [ ] **Step 1：装依赖**

```bash
npm install sharp png2icons
```

- [ ] **Step 2：写测试（覆盖 skip 条件 + 注入逻辑；实际图片处理在 E2E）**

`tests/unit/pack/icon.test.js`：

```js
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const { adaptIcon } = require('../../../src/pack/icon');

const tmpRoot = path.join(__dirname, '../../tmp/icon');

beforeEach(() => { fse.ensureDirSync(tmpRoot); });
afterEach(() => { fse.removeSync(tmpRoot); });

describe('pack/icon (skip conditions)', () => {
    test('build/icon.png 不存在 → 整步跳过，不创建 dist/icons', async () => {
        const distDir = path.join(tmpRoot, 'dist');
        const mergedBuilderConfig = {};
        await adaptIcon({ rootDir: tmpRoot, distDir, mergedBuilderConfig });
        expect(fs.existsSync(path.join(distDir, 'icons'))).toBe(false);
        expect(mergedBuilderConfig.win?.icon).toBeUndefined();
        expect(mergedBuilderConfig.mac?.icon).toBeUndefined();
        expect(mergedBuilderConfig.linux?.icon).toBeUndefined();
    });

    test('三平台 icon 全已显式覆盖 → 整步跳过', async () => {
        fse.ensureDirSync(path.join(tmpRoot, 'build'));
        // 用一个最小 PNG（1x1，pure JS 生成 vs sharp——这里用 sharp 写一张）
        const sharp = require('sharp');
        await sharp({
            create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
        }).png().toFile(path.join(tmpRoot, 'build/icon.png'));

        const distDir = path.join(tmpRoot, 'dist');
        const mergedBuilderConfig = {
            win: { icon: 'a.ico' },
            mac: { icon: 'b.icns' },
            linux: { icon: 'c' },
        };
        await adaptIcon({ rootDir: tmpRoot, distDir, mergedBuilderConfig });
        expect(fs.existsSync(path.join(distDir, 'icons'))).toBe(false);
        // 三个 icon 字段未被覆盖
        expect(mergedBuilderConfig.win.icon).toBe('a.ico');
        expect(mergedBuilderConfig.mac.icon).toBe('b.icns');
        expect(mergedBuilderConfig.linux.icon).toBe('c');
    });
});

describe('pack/icon (active path)', () => {
    let iconSrc;

    beforeEach(async () => {
        fse.ensureDirSync(path.join(tmpRoot, 'build'));
        iconSrc = path.join(tmpRoot, 'build/icon.png');
        // 用 sharp 生成 1024×1024 PNG（够 png2icons 用）
        const sharp = require('sharp');
        await sharp({
            create: { width: 1024, height: 1024, channels: 4, background: { r: 100, g: 200, b: 50, alpha: 1 } },
        }).png().toFile(iconSrc);
    });

    test('生成 ico + icns + 多尺寸 PNG 到 dist/icons/，并按需注入', async () => {
        const distDir = path.join(tmpRoot, 'dist');
        const mergedBuilderConfig = {};
        await adaptIcon({ rootDir: tmpRoot, distDir, mergedBuilderConfig });

        const iconsDir = path.join(distDir, 'icons');
        expect(fs.existsSync(path.join(iconsDir, 'icon.ico'))).toBe(true);
        expect(fs.existsSync(path.join(iconsDir, 'icon.icns'))).toBe(true);
        // 检查至少 256/512/1024 三档
        expect(fs.existsSync(path.join(iconsDir, '256.png'))).toBe(true);
        expect(fs.existsSync(path.join(iconsDir, '512.png'))).toBe(true);
        expect(fs.existsSync(path.join(iconsDir, '1024.png'))).toBe(true);

        expect(mergedBuilderConfig.win.icon).toBe('dist/icons/icon.ico');
        expect(mergedBuilderConfig.mac.icon).toBe('dist/icons/icon.icns');
        expect(mergedBuilderConfig.linux.icon).toBe('dist/icons');
    }, 30000);

    test('已写 win.icon 时不覆盖；mac/linux 仍生成并注入', async () => {
        const distDir = path.join(tmpRoot, 'dist');
        const mergedBuilderConfig = { win: { icon: 'user.ico' } };
        await adaptIcon({ rootDir: tmpRoot, distDir, mergedBuilderConfig });
        expect(mergedBuilderConfig.win.icon).toBe('user.ico');
        expect(mergedBuilderConfig.mac.icon).toBe('dist/icons/icon.icns');
        expect(mergedBuilderConfig.linux.icon).toBe('dist/icons');
        expect(fs.existsSync(path.join(distDir, 'icons/icon.ico'))).toBe(true);   // 仍生成，但未注入
    }, 30000);
});
```

- [ ] **Step 3：跑测试确认失败**

```bash
npx jest tests/unit/pack/icon.test.js
```

- [ ] **Step 4：写实现**

`src/pack/icon.js`：

```js
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

const PNG_SIZES = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024];

async function adaptIcon({ rootDir, distDir, mergedBuilderConfig }) {
    const iconSrc = path.join(rootDir, 'build/icon.png');
    if (!fs.existsSync(iconSrc)) return;

    const win = mergedBuilderConfig.win || (mergedBuilderConfig.win = {});
    const mac = mergedBuilderConfig.mac || (mergedBuilderConfig.mac = {});
    const linux = mergedBuilderConfig.linux || (mergedBuilderConfig.linux = {});

    if (win.icon && mac.icon && linux.icon) return;     // 全已显式覆盖

    const sharp = require('sharp');
    const png2icons = require('png2icons');

    const iconsDir = path.join(distDir, 'icons');
    fse.ensureDirSync(iconsDir);

    // 1. 多尺寸 PNG
    const sourceBuf = fs.readFileSync(iconSrc);
    for (const size of PNG_SIZES) {
        const buf = await sharp(sourceBuf).resize(size, size).png().toBuffer();
        fs.writeFileSync(path.join(iconsDir, `${size}.png`), buf);
    }

    // 2. ICO（多尺寸内嵌）
    const ico = png2icons.createICO(sourceBuf, png2icons.BILINEAR, 0, false, true);
    if (ico) fs.writeFileSync(path.join(iconsDir, 'icon.ico'), ico);

    // 3. ICNS
    const icns = png2icons.createICNS(sourceBuf, png2icons.BILINEAR, 0);
    if (icns) fs.writeFileSync(path.join(iconsDir, 'icon.icns'), icns);

    // 4. 按需注入
    if (!win.icon)   win.icon   = 'dist/icons/icon.ico';
    if (!mac.icon)   mac.icon   = 'dist/icons/icon.icns';
    if (!linux.icon) linux.icon = 'dist/icons';
}

module.exports = { adaptIcon };
```

- [ ] **Step 5：跑测试确认通过**

```bash
npx jest tests/unit/pack/icon.test.js
```

预期：4 个 test PASS（30s 超时充足）。

- [ ] **Step 6：commit**

```bash
git add src/pack/icon.js tests/unit/pack/icon.test.js package.json package-lock.json
git commit -m "feat(pack): 加 adaptIcon（sharp 多尺寸 PNG + png2icons ICO/ICNS + 按需注入 mergedBuilderConfig）"
```

---

### Task 9：`src/cli/commands/pack.js`（基础形态）+ 测试

**Files:**
- Create: `src/cli/commands/pack.js`
- Create: `tests/unit/cli/commands-pack.test.js`

设计：基础 pack 编排，按 spec § 9.1 的阶段 A→B→C 推进，但**不**接入 encrypt/bytenode/incremental（P5 加）。

- [ ] **Step 1：写命令模块测试**

`tests/unit/cli/commands-pack.test.js`：

```js
const cmd = require('../../../src/cli/commands/pack');
const { TARGETS } = require('../../../src/core/target');
const { MODES } = require('../../../src/core/mode');

describe('cli/commands/pack', () => {
    test('命令文件导出契约', () => {
        expect(cmd.name).toBe('pack');
        expect(cmd.target).toBe(TARGETS.APP);
        expect(cmd.mode).toBe(MODES.PROD);
        expect(cmd.needsBcConfig).toBe(true);
        expect(cmd.needsBuilderConfig).toBe(true);
    });

    test('options 含 --platform / --arch / --unpack / --sign / --pack-config', () => {
        const flags = cmd.options.map(o => o[0]).join(' ');
        expect(flags).toContain('--platform');
        expect(flags).toContain('--arch');
        expect(flags).toContain('--unpack');
        expect(flags).toContain('--sign');
        expect(flags).toContain('--pack-config');
    });

    test('action 是 async function', () => {
        expect(cmd.action.constructor.name).toBe('AsyncFunction');
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/cli/commands-pack.test.js
```

- [ ] **Step 3：写实现**

`src/cli/commands/pack.js`：

```js
const path = require('path');
const fse = require('fs-extra');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { deriveBuildInfo } = require('../../core/build-info');
const { resolveBuildConfig } = require('../../config/bc-config');
const { resolveBuilderConfig } = require('../../config/builder-config');
const { runProductionBuild } = require('../../webpack-runner/run-build');
const { adaptIcon } = require('../../pack/icon');
const { generateShellScripts } = require('../../pack/shell');
const { resolveElectronBuilder } = require('../../electron/resolve-electron-builder');
const { buildTargets } = require('../../electron/build-targets');
const logger = require('../../core/logger');

module.exports = {
    name: 'pack',
    description: 'app target 打包（出安装包 / 免安装目录）',
    target: TARGETS.APP,
    mode: MODES.PROD,
    needsBcConfig: true,
    needsBuilderConfig: true,
    options: [
        ['--platform <p>', '目标平台：win / mac / linux'],
        ['--arch <a>', '目标架构：ia32 / x64 / armv7l / arm64 / universal / loong64'],
        ['--unpack', '仅产 unpacked 目录，跳过 installer 阶段'],
        ['--sign', '签名标志（透传至 cliOptions.sign 与 __BC_BUILD__.sign）'],
        ['--pack-config <path>', '指定 electron-builder.config.js 路径'],
    ],
    action: async (ctx) => {
        const rootDir = process.cwd();
        const distDir = path.join(rootDir, 'dist');
        const appDir = path.join(rootDir, 'app');
        const pkgJson = require(path.resolve(rootDir, 'package.json'));

        // ============ 阶段 A · 资源准备 ============
        // ① 进场清空 dist
        fse.emptyDirSync(distDir);

        // ② 派生 __BC_BUILD__（P4 阶段：encrypted=false / encryptKey=undefined）
        const buildInfo = deriveBuildInfo(ctx, pkgJson);

        // ③+④+⑤ 加载 electron-builder.config + 与 preset 合并
        const mergedBuilderConfig = resolveBuilderConfig(ctx, pkgJson);

        // ⑥ icon 自适配
        await adaptIcon({ rootDir, distDir, mergedBuilderConfig });

        // ⑦ 平台脚本生成
        generateShellScripts({
            rootDir,
            distDir,
            mergedBuilderConfig,
            appName: pkgJson.name,
            appDirName: mergedBuilderConfig.productName ?? pkgJson.name,
            appId: mergedBuilderConfig.appId,
        });

        // ============ 阶段 B · 代码构建 ============
        // ⑧ 清 app/
        fse.emptyDirSync(appDir);

        // ⑨ 三进程并行 webpack 编译
        const { main, preload, renderer } = resolveBuildConfig(ctx, pkgJson, buildInfo);
        // renderer.devServer 在生产构建中无意义；摘出后丢弃
        const { devServer: _r, ...rendererWebpack } = renderer;
        await runProductionBuild([main, preload, rendererWebpack], ctx);

        // ⑩~⑫ encrypt / incremental / bytenode —— Phase 5 接入；P4 暂不执行

        // ============ 阶段 C · 安装包打包 ============
        // ⑬ targets
        const targets = buildTargets(ctx.cliOptions);

        // ⑭ electron-builder.build
        const builder = resolveElectronBuilder(rootDir);
        await builder.build({ ...targets, config: mergedBuilderConfig });

        // ⑮ --unpack 状态文件 —— Phase 6 接入

        logger.success('pack 完成');
    },
};
```

- [ ] **Step 4：跑命令模块测试确认通过**

```bash
npx jest tests/unit/cli/commands-pack.test.js
```

预期：3 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/cli/commands/pack.js tests/unit/cli/commands-pack.test.js
git commit -m "feat(cli): 加 pack 命令基础形态（阶段 A: icon/shell/builder-config 合并 + 阶段 B: 三进程编译 + 阶段 C: electron-builder.build）"
```

---

### Task 10：`src/cli/index.js` 注册 pack + 测试

**Files:**
- Modify: `src/cli/index.js`
- Modify: `tests/unit/cli/index.test.js`

- [ ] **Step 1：修改 `src/cli/index.js` COMMANDS 数组**

把现有的：

```js
const COMMANDS = [
    require('./commands/dev-web'),
    require('./commands/build'),
    require('./commands/dev-app'),
    // 后续 phase：pack / installer / child
];
```

改为：

```js
const COMMANDS = [
    require('./commands/dev-web'),
    require('./commands/build'),
    require('./commands/dev-app'),
    require('./commands/pack'),
    // 后续 phase：installer / child
];
```

并在 `createCli` 中加全局 `--pack-config` 选项（虽然 pack 命令也声明了，但放全局让 installer 也能用——参考 spec § 9.4）：

```js
cli.option('--pack-config <path>', '指定 electron-builder.config.js 路径');
```

- [ ] **Step 2：追加 `tests/unit/cli/index.test.js` 断言**

在 `createCli` 测试中追加：

```js
expect(names).toContain('pack');
```

- [ ] **Step 3：跑全量 cli 测试**

```bash
npx jest tests/unit/cli/
```

预期：所有命令模块测试 + cli/index 注册测试 PASS。

- [ ] **Step 4：commit**

```bash
git add src/cli/index.js tests/unit/cli/index.test.js
git commit -m "feat(cli): 注册 pack 命令 + 全局 --pack-config 选项"
```

---

### Task 11：E2E 烟雾测试（mock electron-builder，验证阶段 A/B/C 编排）

**Files:**
- Create: `tests/fixtures/minimal-pack/`（含 main.js / preload.js / renderer/index.js / renderer/index.html / bc.config.js / electron-builder.config.js / build/icon.png / .env.prod / package.json + 假 node_modules/electron + 假 node_modules/electron-builder）
- Create: `tests/unit/e2e-pack-core.test.js`

- [ ] **Step 1：建最小 pack fixture**

`tests/fixtures/minimal-pack/package.json`：

```json
{
    "name": "minimal-pack",
    "version": "1.0.0",
    "main": "app/main/index.js",
    "productName": "MinimalPack",
    "author": "test"
}
```

`tests/fixtures/minimal-pack/.env.prod`：

```
BC_ENV=prod
```

`tests/fixtures/minimal-pack/src/main/index.js`：

```js
module.exports = {};
```

`tests/fixtures/minimal-pack/src/preload/index.js`：

```js
module.exports = {};
```

`tests/fixtures/minimal-pack/src/renderer/index.js`：

```js
module.exports = {};
```

`tests/fixtures/minimal-pack/src/renderer/index.html`：

```html
<!DOCTYPE html><html><body><script src="/renderer/index.js"></script></body></html>
```

`tests/fixtures/minimal-pack/bc.config.js`：

```js
const HtmlWebpackPlugin = require('html-webpack-plugin');
module.exports = (ctx) => ({
    main: {},
    preload: {},
    renderer: {
        plugins: [new HtmlWebpackPlugin({ template: 'src/renderer/index.html', filename: 'renderer/index.html', chunks: ['renderer'] })],
    },
});
```

`tests/fixtures/minimal-pack/electron-builder.config.js`：

```js
module.exports = ({ env, cliOptions, replace }) => ({
    appId: 'com.test.minimal',
});
```

`tests/fixtures/minimal-pack/node_modules/electron/package.json`：

```json
{ "name": "electron", "main": "index.js", "version": "99.0.0" }
```

`tests/fixtures/minimal-pack/node_modules/electron/index.js`：

```js
module.exports = '/fake/electron-binary';
```

`tests/fixtures/minimal-pack/node_modules/electron-builder/package.json`：

```json
{ "name": "electron-builder", "main": "out/index.js", "version": "24.0.0" }
```

`tests/fixtures/minimal-pack/node_modules/electron-builder/out/index.js`：

```js
let lastBuildCall = null;
module.exports = {
    build: (opts) => {
        lastBuildCall = opts;
        return Promise.resolve(['/fake/output/file.exe']);
    },
    _getLastCall: () => lastBuildCall,
    _clearLastCall: () => { lastBuildCall = null; },
};
```

`tests/fixtures/minimal-pack/build/icon.png`：实测时跳过 icon 自适配（删除文件或只在不需要时建）。

- [ ] **Step 2：写 E2E 测试**

`tests/unit/e2e-pack-core.test.js`：

```js
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

const fixtureDir = path.join(__dirname, '../fixtures/minimal-pack');

describe('E2E: pack 核心阶段编排（mock electron-builder）', () => {
    let oldCwd;

    beforeAll(() => {
        oldCwd = process.cwd();
        process.chdir(fixtureDir);
    });

    afterAll(() => {
        process.chdir(oldCwd);
    });

    beforeEach(() => {
        // 清除 fixture 中假 builder 的上次调用记录
        const ebPath = path.join(fixtureDir, 'node_modules/electron-builder/out/index.js');
        delete require.cache[ebPath];
    });

    test('pack 跑通：app/ 三进程产物 + dist/shell/* + 调 electron-builder.build', async () => {
        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');

        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64' });

        // 三进程产物
        expect(fs.existsSync(path.join(fixtureDir, 'app/main/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(fixtureDir, 'app/preload/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(fixtureDir, 'app/renderer/index.js'))).toBe(true);

        // dist/shell/* 平台脚本
        expect(fs.existsSync(path.join(fixtureDir, 'dist/shell/win-installer.nsh'))).toBe(true);
        expect(fs.existsSync(path.join(fixtureDir, 'dist/shell/deb-preinstall.sh'))).toBe(true);

        // electron-builder.build 被调用
        const builderPath = path.join(fixtureDir, 'node_modules/electron-builder/out/index.js');
        const builder = require(builderPath);
        const lastCall = builder._getLastCall();
        expect(lastCall).toBeTruthy();
        expect(lastCall.win).toEqual(['nsis']);
        expect(lastCall.x64).toBe(true);
        expect(lastCall.config.appId).toBe('com.test.minimal');
        expect(lastCall.config.productName).toBe('MinimalPack');
        expect(lastCall.config.nsis.include).toBe('dist/shell/win-installer.nsh');
    }, 60000);

    test('pack --unpack 时 targets 改为 dir', async () => {
        // 重置 fixture 状态
        fse.removeSync(path.join(fixtureDir, 'app'));
        fse.removeSync(path.join(fixtureDir, 'dist'));

        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');
        const builderPath = path.join(fixtureDir, 'node_modules/electron-builder/out/index.js');
        delete require.cache[builderPath];

        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64', unpack: true });

        const builder = require(builderPath);
        const lastCall = builder._getLastCall();
        expect(lastCall.win).toEqual(['dir']);
    }, 60000);
});
```

- [ ] **Step 3：跑 E2E**

```bash
npx jest tests/unit/e2e-pack-core.test.js --runInBand
```

预期：2 个 test PASS。

- [ ] **Step 4：跑全量测试**

```bash
npx jest --runInBand
```

预期：Phase 1~4 所有测试 PASS。

- [ ] **Step 5：commit**

```bash
git add tests/fixtures/minimal-pack/ tests/unit/e2e-pack-core.test.js
git commit -m "test(e2e): pack 核心阶段编排 E2E（mock electron-builder，验证三进程产物 + shell/* + targets）"
```

---

## Phase 4 完成态

- 新增 9 个 src/ 文件（config 3 + electron 2 + pack 2 + templates 4 + cli/commands 1，及 cli/index 修改）
- 新增 dependencies：sharp, png2icons
- rollup.config.mjs 加 templates copy
- 新增 10 份测试文件，全部 PASS
- `bc-frame pack --platform win --arch x64 --env prod` 在 fixture project 跑通基础打包链路

## 下一 Phase 衔接点

Phase 5（pack 增强能力）会新增：

- `src/pack/encrypt.js`（AES 加密 app/<除 main 外>/**/*.js）
- `src/pack/bytenode.js`（主进程字节码——使用路径 A：loader.js + index.jsc）
- `src/pack/package-descriptor.js`（asar 根 package.json 派生子集，不含 encryptKey）
- `src/pack/incremental.js`（@electron/asar 打包 → dist/${env}-v${version}.asax）
- `src/cli/commands/pack.js` 接入上述四个模块（按 `bc.config.encrypt/bytenode/incremental` 开关）
- `src/core/build-info.js` 调整：encrypt 开关下计算 cryptoState，传给 deriveBuildInfo
- `src/config/presets/renderer.js`：用户多入口 entry 时的合并行为不变（webpack-merge 对象深合并已支持）；encrypt 时对所有渲染子目录递归加密
