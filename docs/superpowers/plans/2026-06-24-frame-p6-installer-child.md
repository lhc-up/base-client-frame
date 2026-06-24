# Frame Phase 6：`installer` + `child` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 frame 命令矩阵的最后两个命令：
1. **`installer`**：复用上一次 `pack --unpack` 产出的 unpacked 目录（典型场景：外部签名后回流套 installer 壳），不跑 webpack、不读 bc.config、不派生 `__BC_BUILD__`、不清 dist/。
2. **`child`**：产 child 子应用 .asar 包（宿主应用动态加载的资源包，跨平台）。

**Architecture:** 新增 `pack/frame-state.js`（dist/.frame-state.json 读写）+ `pack/child-asar.js`（@electron/asar 打包整个 app/）；新增 `cli/commands/{installer,child}.js` 两个命令模板；修改 `cli/commands/pack.js` 在 `--unpack` 流程末尾写入 frame-state；注册两个命令到 cli/index。

**Tech Stack:** Node.js, @electron/asar（已在 P5 引入）, electron-builder（peer）, jest 30。

**Phase 范围**：闭合 frame 命令矩阵，本 phase 完成后所有 spec 命令（dev / dev:web / dev:app / build / pack / installer / child）齐全。

**对应 spec 章节**：[2026-06-24-frame-design.md](../specs/2026-06-24-frame-design.md) § 9.2 child 流程 / § 9.3 installer 流程 / § 9.5 installer 选项 / § 9.6 child 选项 / § 9.7 typical CI 流程 / § 10.6 child .asar 后缀选择 / § 10.7 frame-state 文件。

**前置 Phase**：P1 ~ P5 均已完成。

---

## 文件结构（Phase 6 增量）

```
src/
├── pack/
│   ├── frame-state.js                   # 新增：readFrameState / writeFrameState
│   └── child-asar.js                    # 新增：buildChildAsar
├── cli/
│   ├── commands/
│   │   ├── installer.js                 # 新增
│   │   ├── child.js                     # 新增
│   │   └── pack.js                      # 修改：--unpack 完成后写 frame-state
│   └── index.js                         # 修改：注册 installer + child

tests/unit/
├── pack/
│   ├── frame-state.test.js              # 新增
│   └── child-asar.test.js               # 新增
├── cli/
│   ├── commands-installer.test.js       # 新增
│   ├── commands-child.test.js           # 新增
│   └── index.test.js                    # 修改：installer / child 注册断言
└── e2e-installer-child.test.js          # 新增
```

---

## Tasks

### Task 1：`src/pack/frame-state.js`（读写 .frame-state.json）+ 测试

**Files:**
- Create: `src/pack/frame-state.js`
- Create: `tests/unit/pack/frame-state.test.js`

设计：
- `writeFrameState(distDir, state)`：把 `{ lastUnpack: { platform, arch, env, version, unpackedPath, timestamp } }` 写入 `<distDir>/.frame-state.json`，目录不存在时创建。
- `readFrameState(distDir)`：读 `<distDir>/.frame-state.json`，返回解析后对象；文件不存在或解析失败返回 `null`（frame 不校验内容；交给 electron-builder 抛错）。

- [ ] **Step 1：写测试**

`tests/unit/pack/frame-state.test.js`：

```js
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const { readFrameState, writeFrameState } = require('../../../src/pack/frame-state');

const tmpDir = path.join(__dirname, '../../tmp/frame-state');

beforeEach(() => { fse.ensureDirSync(tmpDir); });
afterEach(() => { fse.removeSync(tmpDir); });

describe('pack/frame-state', () => {
    test('writeFrameState 写入 lastUnpack 字段，readFrameState 读出', () => {
        const state = {
            lastUnpack: {
                platform: 'win', arch: 'x64', env: 'prod', version: '1.2.3',
                unpackedPath: 'dist/win-unpacked', timestamp: 1700000000000,
            },
        };
        writeFrameState(tmpDir, state);
        const read = readFrameState(tmpDir);
        expect(read).toEqual(state);
    });

    test('readFrameState 文件不存在时返回 null', () => {
        expect(readFrameState(tmpDir)).toBeNull();
    });

    test('readFrameState JSON 损坏时返回 null', () => {
        fs.writeFileSync(path.join(tmpDir, '.frame-state.json'), '{ not json');
        expect(readFrameState(tmpDir)).toBeNull();
    });

    test('writeFrameState distDir 不存在时自动创建', () => {
        const sub = path.join(tmpDir, 'nested/dist');
        writeFrameState(sub, { lastUnpack: { unpackedPath: 'x' } });
        expect(fs.existsSync(path.join(sub, '.frame-state.json'))).toBe(true);
    });

    test('JSON 文件可读（人类可读格式化）', () => {
        writeFrameState(tmpDir, { lastUnpack: { unpackedPath: 'x' } });
        const raw = fs.readFileSync(path.join(tmpDir, '.frame-state.json'), 'utf8');
        expect(raw).toContain('\n');                  // 缩进/换行存在（pretty-print）
        expect(raw).toContain('"unpackedPath"');
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/pack/frame-state.test.js
```

- [ ] **Step 3：写实现**

`src/pack/frame-state.js`：

```js
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

const FILE_NAME = '.frame-state.json';

function statePath(distDir) {
    return path.join(distDir, FILE_NAME);
}

function writeFrameState(distDir, state) {
    fse.ensureDirSync(distDir);
    fs.writeFileSync(statePath(distDir), JSON.stringify(state, null, 4));
}

function readFrameState(distDir) {
    const p = statePath(distDir);
    if (!fs.existsSync(p)) return null;
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
        return null;
    }
}

module.exports = { readFrameState, writeFrameState };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/pack/frame-state.test.js
```

预期：5 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/pack/frame-state.js tests/unit/pack/frame-state.test.js
git commit -m "feat(pack): 加 readFrameState / writeFrameState（dist/.frame-state.json，frame 不校验内容）"
```

---

### Task 2：`src/pack/child-asar.js`（打 child .asar 包）+ 测试

**Files:**
- Create: `src/pack/child-asar.js`
- Create: `tests/unit/pack/child-asar.test.js`

设计：
1. 复制**整个** `app/` 到临时目录（child 与 .asax 不同——含 main）
2. 临时目录根写 `package.json` = `derivePackageDescriptor(buildInfo)`（不含 encryptKey）
3. `asar.createPackage(tmpDir, dist/child-${name}-${env}-v${version}.asar)`
4. 清临时目录

- [ ] **Step 1：写测试**

`tests/unit/pack/child-asar.test.js`：

```js
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const asar = require('@electron/asar');
const { buildChildAsar } = require('../../../src/pack/child-asar');

const tmpRoot = path.join(__dirname, '../../tmp/child-asar');

beforeEach(() => { fse.ensureDirSync(tmpRoot); });
afterEach(() => { fse.removeSync(tmpRoot); });

describe('pack/child-asar', () => {
    test('打 child-${name}-${env}-v${version}.asar，含完整 app/（含 main），根有 package.json 派生子集', async () => {
        const appDir = path.join(tmpRoot, 'app');
        const distDir = path.join(tmpRoot, 'dist');
        fse.ensureDirSync(path.join(appDir, 'main'));
        fse.ensureDirSync(path.join(appDir, 'preload'));
        fse.ensureDirSync(path.join(appDir, 'renderer'));
        fs.writeFileSync(path.join(appDir, 'main/index.js'), 'main');
        fs.writeFileSync(path.join(appDir, 'preload/index.js'), 'preload');
        fs.writeFileSync(path.join(appDir, 'renderer/index.js'), 'renderer');

        const buildInfo = {
            target: 'app', name: 'plugin-x', productName: 'PluginX', version: '0.2.0',
            env: 'prod', envName: undefined, buildTime: 1700000000000,
            platform: undefined, arch: undefined, unpack: false, sign: false, child: true,
            encrypted: false, encryptKey: undefined,
        };

        await buildChildAsar({ appDir, distDir, buildInfo });

        const asarPath = path.join(distDir, 'child-plugin-x-prod-v0.2.0.asar');
        expect(fs.existsSync(asarPath)).toBe(true);

        // 解包：含完整 app/ 内容 + package.json
        const extractDir = path.join(tmpRoot, 'extract');
        asar.extractAll(asarPath, extractDir);
        expect(fs.existsSync(path.join(extractDir, 'main/index.js'))).toBe(true);    // child 含 main
        expect(fs.existsSync(path.join(extractDir, 'preload/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'renderer/index.js'))).toBe(true);

        const pkg = JSON.parse(fs.readFileSync(path.join(extractDir, 'package.json'), 'utf8'));
        expect(pkg.name).toBe('plugin-x');
        expect(pkg.child).toBe(true);
        expect(pkg.encryptKey).toBeUndefined();
        expect(pkg.platform).toBeUndefined();     // child 命令下为 undefined
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/pack/child-asar.test.js
```

- [ ] **Step 3：写实现**

`src/pack/child-asar.js`：

```js
const path = require('path');
const fs = require('fs');
const os = require('os');
const fse = require('fs-extra');
const asar = require('@electron/asar');
const { derivePackageDescriptor } = require('./package-descriptor');

async function buildChildAsar({ appDir, distDir, buildInfo }) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-frame-child-'));
    try {
        // 1. 复制整个 app/（含 main）
        await fse.copy(appDir, tmpDir);

        // 2. 写 package.json
        const descriptor = derivePackageDescriptor(buildInfo);
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(descriptor, null, 2));

        // 3. asar 打包
        fse.ensureDirSync(distDir);
        const out = path.join(distDir, `child-${buildInfo.name}-${buildInfo.env}-v${buildInfo.version}.asar`);
        await asar.createPackage(tmpDir, out);
    } finally {
        fse.removeSync(tmpDir);
    }
}

module.exports = { buildChildAsar };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/pack/child-asar.test.js
```

预期：1 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/pack/child-asar.js tests/unit/pack/child-asar.test.js
git commit -m "feat(pack): 加 buildChildAsar（含完整 app/ + 派生 package.json → dist/child-*.asar）"
```

---

### Task 3：`src/cli/commands/pack.js` 在 `--unpack` 完成时写 frame-state

**Files:**
- Modify: `src/cli/commands/pack.js`

- [ ] **Step 1：修改 pack action 末尾**

把现有的：

```js
const targets = buildTargets(ctx.cliOptions);
const builder = resolveElectronBuilder(rootDir);
await builder.build({ ...targets, config: mergedBuilderConfig });

logger.success('pack 完成');
```

改为：

```js
const targets = buildTargets(ctx.cliOptions);
const builder = resolveElectronBuilder(rootDir);
const artifacts = await builder.build({ ...targets, config: mergedBuilderConfig });

// --unpack 完成后写 frame-state
if (ctx.cliOptions.unpack) {
    const { writeFrameState } = require('../../pack/frame-state');
    const unpackedPath = (artifacts || []).find((p) => {
        try { return fs.statSync(p).isDirectory(); } catch { return false; }
    });
    if (unpackedPath) {
        writeFrameState(distDir, {
            lastUnpack: {
                platform: ctx.cliOptions.platform,
                arch: ctx.cliOptions.arch,
                env: buildInfo.env,
                version: buildInfo.version,
                unpackedPath: path.relative(rootDir, unpackedPath),
                timestamp: Date.now(),
            },
        });
        logger.info(`已写 dist/.frame-state.json（unpackedPath=${path.relative(rootDir, unpackedPath)}）`);
    }
}

logger.success('pack 完成');
```

并在文件顶部追加 `const fs = require('fs');`（如未导入）。

- [ ] **Step 2：跑现有 pack 测试**

```bash
npx jest tests/unit/cli/commands-pack.test.js tests/unit/e2e-pack-core.test.js tests/unit/e2e-pack-enhancements.test.js --runInBand
```

预期：原有所有 pack 相关测试仍 PASS（命令契约未变；E2E 中 mock builder 返回的 artifacts 是 `['/fake/output/file.exe']`——非目录，不触发 frame-state 写入，行为退化为原版）。

- [ ] **Step 3：commit**

```bash
git add src/cli/commands/pack.js
git commit -m "feat(pack): pack --unpack 完成时写 dist/.frame-state.json（供 installer 复用 unpacked 路径）"
```

---

### Task 4：`src/cli/commands/installer.js` + 测试

**Files:**
- Create: `src/cli/commands/installer.js`
- Create: `tests/unit/cli/commands-installer.test.js`

设计要点（spec § 9.3）：
- 不读 bc.config（`needsBcConfig: false`）
- 读 electron-builder.config（`needsBuilderConfig: true`）
- 不派生 `__BC_BUILD__`、不清 dist/
- 仍要做 icon 自适配 + 平台脚本生成（阶段 A 子集）
- 阶段 C：读 frame-state → `prepackaged` 透传给 electron-builder
- 不接受 `--unpack` flag

- [ ] **Step 1：写命令模块测试**

`tests/unit/cli/commands-installer.test.js`：

```js
const cmd = require('../../../src/cli/commands/installer');
const { TARGETS } = require('../../../src/core/target');
const { MODES } = require('../../../src/core/mode');

describe('cli/commands/installer', () => {
    test('命令文件导出契约', () => {
        expect(cmd.name).toBe('installer');
        expect(cmd.target).toBe(TARGETS.APP);
        expect(cmd.mode).toBe(MODES.PROD);
        expect(cmd.needsBcConfig).toBe(false);     // installer 不读 bc.config
        expect(cmd.needsBuilderConfig).toBe(true);
    });

    test('options 含 --platform / --arch / --sign（无 --unpack）', () => {
        const flags = cmd.options.map(o => o[0]).join(' ');
        expect(flags).toContain('--platform');
        expect(flags).toContain('--arch');
        expect(flags).toContain('--sign');
        expect(flags).not.toContain('--unpack');
    });

    test('action 是 async function', () => {
        expect(cmd.action.constructor.name).toBe('AsyncFunction');
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/cli/commands-installer.test.js
```

- [ ] **Step 3：写实现**

`src/cli/commands/installer.js`：

```js
const path = require('path');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { resolveBuilderConfig } = require('../../config/builder-config');
const { adaptIcon } = require('../../pack/icon');
const { generateShellScripts } = require('../../pack/shell');
const { readFrameState } = require('../../pack/frame-state');
const { resolveElectronBuilder } = require('../../electron/resolve-electron-builder');
const { buildTargets } = require('../../electron/build-targets');
const logger = require('../../core/logger');

module.exports = {
    name: 'installer',
    description: '复用上次 pack --unpack 产出的 unpacked 目录，套 installer 壳（外部签名场景）',
    target: TARGETS.APP,
    mode: MODES.PROD,
    needsBcConfig: false,                         // installer 不读 bc.config
    needsBuilderConfig: true,
    options: [
        ['--platform <p>', '目标平台：win / mac / linux'],
        ['--arch <a>', '目标架构'],
        ['--sign', '签名标志（透传至 cliOptions.sign；__BC_BUILD__ 不派生）'],
        ['--pack-config <path>', '指定 electron-builder.config.js 路径'],
    ],
    action: async (ctx) => {
        const rootDir = process.cwd();
        const distDir = path.join(rootDir, 'dist');
        const pkgJson = require(path.resolve(rootDir, 'package.json'));

        // ============ 阶段 A 子集 · 资源准备 ============
        // 不清 dist；不派生 __BC_BUILD__；不读 bc.config

        const mergedBuilderConfig = resolveBuilderConfig(ctx, pkgJson);
        await adaptIcon({ rootDir, distDir, mergedBuilderConfig });
        generateShellScripts({
            rootDir, distDir, mergedBuilderConfig,
            appName: pkgJson.name,
            appDirName: mergedBuilderConfig.productName ?? pkgJson.name,
            appId: mergedBuilderConfig.appId,
        });

        // ============ 阶段 C · 安装包打包 ============
        const state = readFrameState(distDir);
        const unpackedPath = state?.lastUnpack?.unpackedPath
            ? path.resolve(rootDir, state.lastUnpack.unpackedPath)
            : undefined;
        // frame 不校验 unpackedPath 是否存在 / 是否匹配——electron-builder 自己抛错

        const targets = buildTargets(ctx.cliOptions);
        const builder = resolveElectronBuilder(rootDir);
        await builder.build({
            ...targets,
            config: mergedBuilderConfig,
            prepackaged: unpackedPath,
        });

        logger.success('installer 完成');
    },
};
```

- [ ] **Step 4：跑命令模块测试确认通过**

```bash
npx jest tests/unit/cli/commands-installer.test.js
```

预期：3 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/cli/commands/installer.js tests/unit/cli/commands-installer.test.js
git commit -m "feat(cli): 加 installer 命令（阶段 A 子集 + 读 frame-state + electron-builder.build prepackaged 透传）"
```

---

### Task 5：`src/cli/commands/child.js` + 测试

**Files:**
- Create: `src/cli/commands/child.js`
- Create: `tests/unit/cli/commands-child.test.js`

设计要点（spec § 9.2）：
- 读 bc.config，不读 electron-builder.config
- 清 dist/ + 清 app/
- 派生 `__BC_BUILD__`（child=true、platform/arch=undefined、unpack/sign=false）
- 三进程并行 webpack 编译
- encrypt 开则加密
- buildChildAsar → dist/child-${name}-${env}-v${version}.asar
- 不调 electron-builder、不做 icon/shell、不 bytenode、不 .asax

- [ ] **Step 1：写命令模块测试**

`tests/unit/cli/commands-child.test.js`：

```js
const cmd = require('../../../src/cli/commands/child');
const { TARGETS } = require('../../../src/core/target');
const { MODES } = require('../../../src/core/mode');

describe('cli/commands/child', () => {
    test('命令文件导出契约', () => {
        expect(cmd.name).toBe('child');
        expect(cmd.target).toBe(TARGETS.APP);
        expect(cmd.mode).toBe(MODES.PROD);
        expect(cmd.needsBcConfig).toBe(true);
        expect(cmd.needsBuilderConfig).toBe(false);
    });

    test('child 命令无专属 flag（仅全局选项）', () => {
        expect(cmd.options || []).toEqual([]);
    });

    test('action 是 async function', () => {
        expect(cmd.action.constructor.name).toBe('AsyncFunction');
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/cli/commands-child.test.js
```

- [ ] **Step 3：写实现**

`src/cli/commands/child.js`：

```js
const path = require('path');
const fse = require('fs-extra');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { deriveBuildInfo } = require('../../core/build-info');
const { resolveBuildConfig, locateBcConfig, loadUserConfig } = require('../../config/bc-config');
const { runProductionBuild } = require('../../webpack-runner/run-build');
const { computeCryptoState, encryptRenderer } = require('../../pack/encrypt');
const { buildChildAsar } = require('../../pack/child-asar');
const logger = require('../../core/logger');

module.exports = {
    name: 'child',
    description: '产 child 子应用 .asar（宿主动态加载的资源包，跨平台）',
    target: TARGETS.APP,
    mode: MODES.PROD,
    needsBcConfig: true,
    needsBuilderConfig: false,
    options: [],
    action: async (ctx) => {
        const rootDir = process.cwd();
        const distDir = path.join(rootDir, 'dist');
        const appDir = path.join(rootDir, 'app');
        const pkgJson = require(path.resolve(rootDir, 'package.json'));

        // 进场清空 dist + app
        fse.emptyDirSync(distDir);
        fse.emptyDirSync(appDir);

        // 加载 userConfig（用于读 encrypt 开关；bytenode/incremental 在 child 命令下被忽略）
        const bcConfigPath = locateBcConfig(rootDir, ctx.cliOptions.config);
        const userConfig = loadUserConfig(bcConfigPath, ctx);

        const cryptoState = computeCryptoState({ rootDir, userConfig });

        // 派生 __BC_BUILD__（child=true 由 deriveBuildInfo 根据 command='child' 决定）
        const buildInfo = deriveBuildInfo(ctx, pkgJson, cryptoState);

        // 三进程并行 webpack 编译
        const { main, preload, renderer } = resolveBuildConfig(ctx, pkgJson, buildInfo);
        const { devServer: _r, ...rendererWebpack } = renderer;
        await runProductionBuild([main, preload, rendererWebpack], ctx);

        // encrypt
        if (cryptoState.encrypted) {
            await encryptRenderer({ appDir, encryptKey: cryptoState.encryptKey });
            logger.info('AES 加密完成');
        }

        // child .asar 打包（含完整 app/）
        await buildChildAsar({ appDir, distDir, buildInfo });

        logger.success(`child 完成：dist/child-${buildInfo.name}-${buildInfo.env}-v${buildInfo.version}.asar`);
    },
};
```

- [ ] **Step 4：跑命令模块测试确认通过**

```bash
npx jest tests/unit/cli/commands-child.test.js
```

预期：3 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/cli/commands/child.js tests/unit/cli/commands-child.test.js
git commit -m "feat(cli): 加 child 命令（dist+app 清空 + 三进程编译 + 可选加密 + buildChildAsar）"
```

---

### Task 6：`src/cli/index.js` 注册 installer + child + 测试

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
    require('./commands/pack'),
    // 后续 phase：installer / child
];
```

改为：

```js
const COMMANDS = [
    require('./commands/dev-web'),
    require('./commands/build'),
    require('./commands/dev-app'),
    require('./commands/pack'),
    require('./commands/installer'),
    require('./commands/child'),
];
```

- [ ] **Step 2：追加 `tests/unit/cli/index.test.js` 断言**

在 `createCli` 测试中追加：

```js
expect(names).toContain('installer');
expect(names).toContain('child');
```

- [ ] **Step 3：跑全量 cli 测试**

```bash
npx jest tests/unit/cli/
```

预期：全部命令模块测试 + cli/index 注册测试 PASS。

- [ ] **Step 4：commit**

```bash
git add src/cli/index.js tests/unit/cli/index.test.js
git commit -m "feat(cli): 注册 installer + child 命令（命令矩阵闭合）"
```

---

### Task 7：E2E 完整链路（pack --unpack → installer + child 独立）

**Files:**
- Create: `tests/unit/e2e-installer-child.test.js`

复用 P5 的 minimal-pack fixture（含 bytenode / encrypt.key / electron-builder mock）。E2E 验证两条链路：
1. `pack --unpack` 写 frame-state；后续 `installer` 读 frame-state，调 electron-builder.build 时 prepackaged 参数正确。
2. `child` 命令产 child-${name}-${env}-v${version}.asar，内容含完整 app/。

需要修改 fixture 中假 electron-builder：让它在 dir target 时返回的 artifacts 含一个真实目录（让 frame-state 写入触发）。

- [ ] **Step 1：调整 minimal-pack 假 electron-builder**

修改 `tests/fixtures/minimal-pack/node_modules/electron-builder/out/index.js`：

```js
const path = require('path');
const fs = require('fs');
let lastBuildCall = null;
module.exports = {
    build: async (opts) => {
        lastBuildCall = opts;
        // 如果是 dir target（unpack 场景），实际创建一个 unpacked 目录并返回其路径
        const platform = Object.keys(opts).find((k) => ['win', 'mac', 'linux'].includes(k));
        const isDir = Array.isArray(opts[platform]) && opts[platform].includes('dir');
        const rootDir = process.cwd();
        if (isDir) {
            const unpackedDir = path.join(rootDir, 'dist', `${platform}-unpacked`);
            fs.mkdirSync(unpackedDir, { recursive: true });
            fs.writeFileSync(path.join(unpackedDir, 'placeholder.txt'), 'unpacked');
            return [unpackedDir];
        }
        // installer 场景：返回单个 fake file
        return [path.join(rootDir, 'dist', 'fake-installer.exe')];
    },
    _getLastCall: () => lastBuildCall,
    _clearLastCall: () => { lastBuildCall = null; },
};
```

- [ ] **Step 2：写 E2E**

`tests/unit/e2e-installer-child.test.js`：

```js
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const asar = require('@electron/asar');

const fixtureDir = path.join(__dirname, '../fixtures/minimal-pack');

describe('E2E: pack --unpack → installer 链路', () => {
    let oldCwd;
    beforeAll(() => {
        oldCwd = process.cwd();
        process.chdir(fixtureDir);
    });
    afterAll(() => { process.chdir(oldCwd); });

    beforeEach(() => {
        fse.removeSync(path.join(fixtureDir, 'app'));
        fse.removeSync(path.join(fixtureDir, 'dist'));
        const ebPath = path.join(fixtureDir, 'node_modules/electron-builder/out/index.js');
        delete require.cache[ebPath];
    });

    test('pack --unpack：dist/<platform>-unpacked/ + dist/.frame-state.json', async () => {
        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');

        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64', unpack: true });

        // 假 builder 已建出 dist/win-unpacked/
        expect(fs.existsSync(path.join(fixtureDir, 'dist/win-unpacked'))).toBe(true);

        // frame-state 写入
        const statePath = path.join(fixtureDir, 'dist/.frame-state.json');
        expect(fs.existsSync(statePath)).toBe(true);
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        expect(state.lastUnpack.platform).toBe('win');
        expect(state.lastUnpack.arch).toBe('x64');
        expect(state.lastUnpack.env).toBe('prod');
        expect(state.lastUnpack.version).toBe('1.0.0');
        expect(state.lastUnpack.unpackedPath).toMatch(/win-unpacked/);

        // .asax 不应产出（--unpack 时跳过 incremental）
        const asaxPath = path.join(fixtureDir, 'dist/prod-v1.0.0.asax');
        expect(fs.existsSync(asaxPath)).toBe(false);
    }, 120000);

    test('installer：读 frame-state，调 electron-builder.build 时 prepackaged 含 unpacked 绝对路径', async () => {
        // 先跑 pack --unpack 产 state
        const packCmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');
        await runCommand(packCmd, { env: 'prod', platform: 'win', arch: 'x64', unpack: true });

        // 清 require 缓存让 mock builder 重置 lastCall
        const ebPath = path.join(fixtureDir, 'node_modules/electron-builder/out/index.js');
        delete require.cache[ebPath];

        // 跑 installer
        const installerCmd = require('../../src/cli/commands/installer');
        await runCommand(installerCmd, { env: 'prod', platform: 'win', arch: 'x64' });

        const builder = require(ebPath);
        const lastCall = builder._getLastCall();
        expect(lastCall.win).toEqual(['nsis']);                         // installer 默认 installer target
        expect(lastCall.prepackaged).toBeDefined();
        expect(lastCall.prepackaged).toContain('win-unpacked');         // 绝对路径含 win-unpacked
    }, 120000);
});

describe('E2E: child 命令独立', () => {
    let oldCwd;
    beforeAll(() => {
        oldCwd = process.cwd();
        process.chdir(fixtureDir);
    });
    afterAll(() => { process.chdir(oldCwd); });

    beforeEach(() => {
        fse.removeSync(path.join(fixtureDir, 'app'));
        fse.removeSync(path.join(fixtureDir, 'dist'));
    });

    test('child：产 dist/child-${name}-${env}-v${version}.asar，含完整 app/', async () => {
        const cmd = require('../../src/cli/commands/child');
        const { runCommand } = require('../../src/cli/index');

        await runCommand(cmd, { env: 'prod' });

        // child .asar 产出
        const asarPath = path.join(fixtureDir, 'dist/child-minimal-pack-prod-v1.0.0.asar');
        expect(fs.existsSync(asarPath)).toBe(true);

        // 内容含 main+preload+renderer + package.json
        const extractDir = path.join(fixtureDir, 'dist/_extract');
        asar.extractAll(asarPath, extractDir);
        expect(fs.existsSync(path.join(extractDir, 'main/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'preload/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'renderer/index.js'))).toBe(true);

        const pkg = JSON.parse(fs.readFileSync(path.join(extractDir, 'package.json'), 'utf8'));
        expect(pkg.name).toBe('minimal-pack');
        expect(pkg.child).toBe(true);
        expect(pkg.encryptKey).toBeUndefined();
        expect(pkg.platform).toBeUndefined();
    }, 120000);
});
```

- [ ] **Step 3：跑 E2E**

```bash
npx jest tests/unit/e2e-installer-child.test.js --runInBand
```

预期：3 个 test PASS。

- [ ] **Step 4：跑全量测试**

```bash
npx jest --runInBand
```

预期：Phase 1~6 所有测试 PASS（完整 frame 命令矩阵齐全）。

- [ ] **Step 5：commit**

```bash
git add tests/fixtures/minimal-pack/node_modules/electron-builder/out/index.js tests/unit/e2e-installer-child.test.js
git commit -m "test(e2e): installer 复用 unpacked + child 独立打包 E2E（pack --unpack → frame-state → installer prepackaged 链路）"
```

---

## Phase 6 完成态

- 新增 4 个 src/ 文件（pack/frame-state + pack/child-asar + cli/commands/installer + cli/commands/child）
- pack 命令支持 `--unpack` 写 frame-state
- cli/index 注册 installer + child（**frame 命令矩阵彻底闭合**）
- 新增 4 份 unit 测试 + 1 份 E2E；全部 PASS

## 整个 frame 项目完成态（Phase 1~6 总览）

完成全部 6 phase 后，frame 项目交付：

**命令矩阵闭合**：
- `bc-frame dev` ≡ `dev:web`（浏览器 SPA 调试）
- `bc-frame dev:app`（Electron 三进程开发）
- `bc-frame build`（web 生产构建）
- `bc-frame pack`（app 完整打包：加密 + bytenode + .asax + electron-builder）
- `bc-frame pack --unpack`（仅产 unpacked + 写状态文件）
- `bc-frame installer`（复用 unpacked + 套 installer）
- `bc-frame child`（子应用 .asar）

**模块边界**：
- `src/core/`：mode / target / ctx / build-info / env / logger
- `src/config/`：bc-config / builder-config / merge / 5 个预设
- `src/electron/`：resolve-electron / resolve-main-entry / kill-electron / resolve-electron-builder / build-targets
- `src/webpack-runner/`：run-build / run-dev-server / compile-spinner / format-stats
- `src/pack/`：icon / shell / encrypt / bytenode / incremental / child-asar / frame-state / package-descriptor
- `src/templates/shell/`：4 个内置脚本模板
- `src/cli/`：dispatcher + 6 个命令模板

**测试覆盖**：单元测试 ~100+ 个 + E2E 烟雾测试 5 套（dev:web / build / dev:app / pack 核心 / pack 增强 / installer+child）。

**git history**：约 50 个原子 commit，每个 TDD 单元一个。

至此，frame 重写完成，可发布 v1.0.0。
