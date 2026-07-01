# frame 分发形态与依赖分层重整 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `@base-client/frame` 直接分发源码（不构建），并按"API 消费深度 + 版本兼容真实性"重整依赖分层，抽出统一的 `resolveModule` 工具处理 CJS/ESM 混合加载。

**Architecture:** 分三层执行：① 抽 `resolveModule` 收敛"包解析 + 校验 + CJS/ESM 兼容加载"，让三个消费点（electron / electron-builder / bytenode）都变成薄包装；② 用 jimp 替代 sharp，去掉唯一 native binding 依赖；③ 删掉 rollup 构建链、`main` 指向 `src/index.js`，同时移除 electron 生态相关的 peerDep（改由运行时 `resolveModule` 的存在性检查 + 友好错误提示）。所有改动锁在同一份分层判据下：peerDep 只保留"深 API 消费 + 有真实版本兼容关系"的依赖（webpack / webpack-dev-server）。

**Tech Stack:** Node.js (>=18.12) / CJS / Jest / fs-extra / jimp / png2icons

**Spec:** `docs/superpowers/specs/2026-07-01-frame-dependency-refactor-design.md`

---

## 文件全景

**新增：**
- `src/core/resolve-module.js` — 统一的模块解析加载工具
- `tests/unit/core/resolve-module.test.js` — resolveModule 单测

**修改：**
- `src/electron/resolve-electron.js` — 薄包装到 resolveModule
- `src/electron/resolve-electron-builder.js` — 薄包装到 resolveModule
- `src/pack/bytenode.js` — 内部改用 resolveModule
- `src/pack/icon.js` — sharp → jimp
- `src/cli/commands/dev-app.js` — `resolveElectron` 加 await
- `src/cli/commands/pack.js` — `resolveElectronBuilder` 加 await
- `src/cli/commands/installer.js` — `resolveElectronBuilder` 加 await
- `tests/unit/electron/resolve-electron.test.js` — 断言改 async
- `tests/unit/electron/resolve-electron-builder.test.js` — 断言改 async
- `bin/base-client.js` — 指向 src
- `package.json` — main / files / scripts / dependencies / peerDependencies / peerDependenciesMeta / devDependencies / engines / keywords

**删除：**
- `rollup.config.mjs`

---

## Task 1：新增 resolveModule 工具（TDD）

**Files:**
- Create: `src/core/resolve-module.js`
- Create: `tests/unit/core/resolve-module.test.js`

### 步骤

- [ ] **Step 1.1 · 写单测（含全部 5 条路径）**

在 `tests/unit/core/resolve-module.test.js` 创建：

```js
const path = require('path');
const fs = require('fs');
const { resolveModule } = require('../../../src/core/resolve-module');

const fixtureDir = path.join(__dirname, '../../tmp/resolve-module');

function writePkg(dir, name, main, content, extra = {}) {
    const pkgDir = path.join(dir, 'node_modules', name);
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({ name, main, version: '1.0.0', ...extra }),
    );
    fs.writeFileSync(path.join(pkgDir, main), content);
}

beforeEach(() => {
    fs.mkdirSync(fixtureDir, { recursive: true });
    writePkg(fixtureDir, 'cjs-pkg', 'index.js', `module.exports = { hello: 'cjs' };`);
    writePkg(fixtureDir, 'esm-pkg', 'index.mjs',
        `export default { hello: 'esm' };`,
        { type: 'module' });
});
afterEach(() => { fs.rmSync(fixtureDir, { recursive: true, force: true }); });

describe('core/resolve-module', () => {
    test('加载 CJS 包，返回其默认导出', async () => {
        const mod = await resolveModule('cjs-pkg', { rootDir: fixtureDir });
        expect(mod).toEqual({ hello: 'cjs' });
    });

    test('包不存在时抛出 missingHint', async () => {
        await expect(
            resolveModule('non-existent-pkg', { rootDir: fixtureDir })
        ).rejects.toThrow(/non-existent-pkg 未安装/);
    });

    test('包位于上游 node_modules 时抛出 missingHint（不复用上游）', async () => {
        // jest 一定在 base-client-frame/node_modules 里,fixtureDir 内没有 jest,
        // require.resolve 会回退到上游找到,但 relative 以 .. 开头,应触发 missingHint
        await expect(
            resolveModule('jest', { rootDir: fixtureDir })
        ).rejects.toThrow(/jest 未安装/);
    });

    test('esmCompat 为 true 时通过 dynamic import 加载 ESM 包', async () => {
        const mod = await resolveModule('esm-pkg', {
            rootDir: fixtureDir,
            esmCompat: true,
        });
        expect(mod).toEqual({ hello: 'esm' });
    });

    test('rootDir 未提供时默认 process.cwd()', async () => {
        const origCwd = process.cwd();
        process.chdir(fixtureDir);
        try {
            const mod = await resolveModule('cjs-pkg');
            expect(mod).toEqual({ hello: 'cjs' });
        } finally {
            process.chdir(origCwd);
        }
    });
});
```

- [ ] **Step 1.2 · 运行测试确认失败**

```bash
npx jest tests/unit/core/resolve-module.test.js
```

**预期**：所有 5 条测试 FAIL（`Cannot find module '../../../src/core/resolve-module'`）。

- [ ] **Step 1.3 · 实现 src/core/resolve-module.js**

```js
const path = require('path');
const { pathToFileURL } = require('url');
const fse = require('fs-extra');

/**
 * 从 rootDir 的 node_modules 中解析并加载一个包。
 *
 * @param {string} pkgName
 * @param {object} [options]
 * @param {string} [options.rootDir=process.cwd()]     用户项目根目录
 * @param {string} [options.missingHint]               包不存在时抛出的错误消息
 * @param {boolean} [options.esmCompat=false]          包若为 ESM，fallback 到 dynamic import
 * @param {boolean} [options.clearRequireCache=false]  加载前清 require.cache
 * @returns {Promise<any>}
 */
async function resolveModule(pkgName, options = {}) {
    const {
        rootDir = process.cwd(),
        missingHint = `[base-client] ${pkgName} 未安装，请在项目中 npm i -D ${pkgName}`,
        esmCompat = false,
        clearRequireCache = false,
    } = options;

    let entryPath;
    try {
        entryPath = require.resolve(pkgName, { paths: [rootDir] });
    } catch {
        throw new Error(missingHint);
    }
    // require.resolve 会回退到 NODE_PATH / 上游 node_modules，且内部有路径缓存（已删的文件仍可能返回旧路径）——
    // 必须校验解析结果落在 rootDir 下且文件实际存在
    const relative = path.relative(rootDir, entryPath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fse.existsSync(entryPath)) {
        throw new Error(missingHint);
    }

    if (clearRequireCache) delete require.cache[entryPath];

    if (!esmCompat) return require(entryPath);

    try {
        return require(entryPath);
    } catch (e) {
        if (e.code === 'ERR_REQUIRE_ESM') {
            const mod = await import(pathToFileURL(entryPath).href);
            return mod.default || mod;
        }
        throw e;
    }
}

module.exports = { resolveModule };
```

- [ ] **Step 1.4 · 运行测试确认通过**

```bash
npx jest tests/unit/core/resolve-module.test.js
```

**预期**：5/5 PASS。

- [ ] **Step 1.5 · Commit**

```bash
git add src/core/resolve-module.js tests/unit/core/resolve-module.test.js
git commit -m "feat：新增 resolveModule 工具（含 CJS/ESM 兼容与 rootDir 校验）。"
```

---

## Task 2：迁移 resolveElectron

**Files:**
- Modify: `src/electron/resolve-electron.js`
- Modify: `tests/unit/electron/resolve-electron.test.js`
- Modify: `src/cli/commands/dev-app.js:70`

### 步骤

- [ ] **Step 2.1 · 修改测试为 async 断言**

将 `tests/unit/electron/resolve-electron.test.js` 中的两个测试改为 async：

```js
describe('electron/resolve-electron', () => {
    test('从 rootDir 解析 electron 包，返回其默认导出（可执行文件路径）', async () => {
        const exe = await resolveElectron(fixtureDir);
        expect(exe).toBe('/fake/electron/binary');
    });

    test('rootDir 下无 electron 时抛错', async () => {
        const empty = path.join(__dirname, '../../tmp/no-electron');
        fs.mkdirSync(empty, { recursive: true });
        try {
            await expect(resolveElectron(empty)).rejects.toThrow(/electron/i);
        } finally {
            fs.rmSync(empty, { recursive: true, force: true });
        }
    });
});
```

- [ ] **Step 2.2 · 运行测试确认失败**

```bash
npx jest tests/unit/electron/resolve-electron.test.js
```

**预期**：FAIL（当前 `resolveElectron` 是同步函数，`await` 一个非 Promise 值仍能通过第一个用例，但 `.rejects` 断言会 FAIL）。

- [ ] **Step 2.3 · 改写 src/electron/resolve-electron.js**

替换文件全部内容为：

```js
const { resolveModule } = require('../core/resolve-module');

function resolveElectron(rootDir) {
    return resolveModule('electron', {
        rootDir,
        missingHint: `[base-client] 在 ${rootDir} 中未找到 electron 包，请在项目中安装 electron`,
        clearRequireCache: true,
        // esmCompat: false —— electron 是可执行文件包，不会转 ESM
    });
}

module.exports = { resolveElectron };
```

- [ ] **Step 2.4 · 更新 dev-app.js 的调用点**

打开 `src/cli/commands/dev-app.js`，第 70 行：

```js
        const electronExe = resolveElectron(rootDir);
```

改为：

```js
        const electronExe = await resolveElectron(rootDir);
```

- [ ] **Step 2.5 · 运行相关测试确认通过**

```bash
npx jest tests/unit/electron/resolve-electron.test.js tests/unit/e2e-dev-app.test.js
```

**预期**：两个文件全部 PASS。

- [ ] **Step 2.6 · Commit**

```bash
git add src/electron/resolve-electron.js src/cli/commands/dev-app.js tests/unit/electron/resolve-electron.test.js
git commit -m "refactor：resolveElectron 改用 resolveModule 并返回 Promise。"
```

---

## Task 3：迁移 resolveElectronBuilder

**Files:**
- Modify: `src/electron/resolve-electron-builder.js`
- Modify: `tests/unit/electron/resolve-electron-builder.test.js`
- Modify: `src/cli/commands/pack.js:83`
- Modify: `src/cli/commands/installer.js:46`

### 步骤

- [ ] **Step 3.1 · 修改测试为 async 断言**

将 `tests/unit/electron/resolve-electron-builder.test.js` 的两个测试改为 async：

```js
describe('electron/resolve-electron-builder', () => {
    test('从 rootDir 解析 electron-builder 模块，返回其默认导出', async () => {
        const eb = await resolveElectronBuilder(fixtureDir);
        expect(typeof eb.build).toBe('function');
    });

    test('rootDir 下无 electron-builder 时抛错', async () => {
        const empty = path.join(__dirname, '../../tmp/no-eb');
        fs.mkdirSync(empty, { recursive: true });
        try {
            await expect(resolveElectronBuilder(empty)).rejects.toThrow(/electron-builder/i);
        } finally {
            fs.rmSync(empty, { recursive: true, force: true });
        }
    });
});
```

- [ ] **Step 3.2 · 运行测试确认失败**

```bash
npx jest tests/unit/electron/resolve-electron-builder.test.js
```

**预期**：FAIL。

- [ ] **Step 3.3 · 改写 src/electron/resolve-electron-builder.js**

替换文件全部内容为：

```js
const { resolveModule } = require('../core/resolve-module');

function resolveElectronBuilder(rootDir) {
    return resolveModule('electron-builder', {
        rootDir,
        missingHint: '[base-client] electron-builder 未安装，请在项目中 npm i -D electron-builder',
        esmCompat: true,
    });
}

module.exports = { resolveElectronBuilder };
```

- [ ] **Step 3.4 · 更新 pack.js 的调用点**

打开 `src/cli/commands/pack.js`，第 83 行：

```js
        const builder = resolveElectronBuilder(rootDir);
```

改为：

```js
        const builder = await resolveElectronBuilder(rootDir);
```

- [ ] **Step 3.5 · 更新 installer.js 的调用点**

打开 `src/cli/commands/installer.js`，第 46 行：

```js
        const builder = resolveElectronBuilder(rootDir);
```

改为：

```js
        const builder = await resolveElectronBuilder(rootDir);
```

- [ ] **Step 3.6 · 运行相关测试确认通过**

```bash
npx jest tests/unit/electron/resolve-electron-builder.test.js tests/unit/e2e-pack-core.test.js tests/unit/e2e-installer-child.test.js
```

**预期**：三个文件全部 PASS。

- [ ] **Step 3.7 · Commit**

```bash
git add src/electron/resolve-electron-builder.js src/cli/commands/pack.js src/cli/commands/installer.js tests/unit/electron/resolve-electron-builder.test.js
git commit -m "refactor：resolveElectronBuilder 改用 resolveModule（含 ESM 兼容）。"
```

---

## Task 4：迁移 bytenodeMain 使用 resolveModule

**Files:**
- Modify: `src/pack/bytenode.js`

（此文件无对应单测，仅由 `tests/unit/e2e-pack-enhancements.test.js` 间接覆盖）

### 步骤

- [ ] **Step 4.1 · 改写 src/pack/bytenode.js**

替换文件全部内容为：

```js
const path = require('path');
const fs = require('fs');
const { resolveModule } = require('../core/resolve-module');

async function bytenodeMain({ rootDir, appDir, mergedBuilderConfig }) {
    const bytenode = await resolveModule('bytenode', {
        rootDir,
        missingHint: '[base-client] bytenode 未安装，请在项目中 npm i -D bytenode',
        esmCompat: true,
        clearRequireCache: true,
    });

    const src = path.join(appDir, 'main/index.js');
    const out = path.join(appDir, 'main/index.jsc');
    const loaderPath = path.join(appDir, 'main/loader.js');

    bytenode.compileFile({ filename: src, output: out });

    fs.writeFileSync(loaderPath, `require('bytenode');\nrequire('./index.jsc');\n`);

    if (fs.existsSync(src)) fs.unlinkSync(src);

    if (!mergedBuilderConfig.extraMetadata) mergedBuilderConfig.extraMetadata = {};
    mergedBuilderConfig.extraMetadata.main = 'main/loader.js';
}

module.exports = { bytenodeMain };
```

- [ ] **Step 4.2 · 运行 e2e 测试确认通过**

```bash
npx jest tests/unit/e2e-pack-enhancements.test.js
```

**预期**：PASS。

- [ ] **Step 4.3 · Commit**

```bash
git add src/pack/bytenode.js
git commit -m "refactor：bytenodeMain 改用 resolveModule 收敛模块解析逻辑。"
```

---

## Task 5：sharp → jimp

**Files:**
- Modify: `src/pack/icon.js`
- Modify: `package.json`（+`package-lock.json` 自动更新）

**说明**：`src/pack/icon.js` 内部延迟 require（`const sharp = require('sharp')`），仅在存在 `build/icon.png` 时执行。没有对应单测，仅由 `tests/unit/e2e-pack-core.test.js` 间接覆盖，但那个 e2e fixture 没有 `build/icon.png`，所以不会实际触发 icon 生成——需要手工验证。

### 步骤

- [ ] **Step 5.1 · 安装 jimp、卸载 sharp**

```bash
npm i jimp@^0.22.0
npm rm sharp
```

**预期**：`package.json` 的 `dependencies` 里 `sharp` 消失、`jimp` 出现（`^0.22.x`）；`package-lock.json` 同步更新。

- [ ] **Step 5.2 · 改写 src/pack/icon.js**

替换文件全部内容为：

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

    if (win.icon && mac.icon && linux.icon) return;

    const Jimp = require('jimp');
    const png2icons = require('png2icons');

    const iconsDir = path.join(distDir, 'icons');
    fse.ensureDirSync(iconsDir);

    const sourceBuf = fs.readFileSync(iconSrc);
    const sourceImg = await Jimp.read(sourceBuf);
    for (const size of PNG_SIZES) {
        const buf = await sourceImg.clone().resize(size, size).getBufferAsync(Jimp.MIME_PNG);
        fs.writeFileSync(path.join(iconsDir, `${size}.png`), buf);
    }

    const ico = png2icons.createICO(sourceBuf, png2icons.BILINEAR, 0, false, true);
    if (ico) fs.writeFileSync(path.join(iconsDir, 'icon.ico'), ico);

    const icns = png2icons.createICNS(sourceBuf, png2icons.BILINEAR, 0);
    if (icns) fs.writeFileSync(path.join(iconsDir, 'icon.icns'), icns);

    if (!win.icon)   win.icon   = 'dist/icons/icon.ico';
    if (!mac.icon)   mac.icon   = 'dist/icons/icon.icns';
    if (!linux.icon) linux.icon = 'dist/icons';
}

module.exports = { adaptIcon };
```

**关键差异**：
- `sharp(sourceBuf).resize(...).png().toBuffer()` → `(await Jimp.read(sourceBuf)).clone().resize(size, size).getBufferAsync(Jimp.MIME_PNG)`
- Jimp API 采用可变实例，多次尺寸需先 `.clone()` 避免相互影响

- [ ] **Step 5.3 · 运行全部测试确认无回归**

```bash
npm test
```

**预期**：全绿（icon.js 未被单测覆盖，但 e2e 不含 `build/icon.png` 也应正常）。

- [ ] **Step 5.4 · 手工验证 icon 生成**

准备一张 1024×1024 的 png 放到临时目录，验证 icon 生成路径：

```bash
mkdir -p /tmp/frame-icon-test/build
# 用任意 1024×1024 png 覆盖:
# cp <some-icon>.png /tmp/frame-icon-test/build/icon.png

node -e "
    const { adaptIcon } = require('./src/pack/icon');
    (async () => {
        const cfg = {};
        await adaptIcon({
            rootDir: '/tmp/frame-icon-test',
            distDir: '/tmp/frame-icon-test/dist',
            mergedBuilderConfig: cfg,
        });
        console.log('生成完成:', require('fs').readdirSync('/tmp/frame-icon-test/dist/icons'));
        console.log('config:', cfg);
    })();
"
```

**预期**：输出 `[ '1024.png', '128.png', '16.png', '24.png', '256.png', '32.png', '48.png', '512.png', '64.png', '96.png', 'icon.icns', 'icon.ico' ]`；config 里 win/mac/linux.icon 都被填充。

**如果没有测试用 png**：跳过手工验证，接受"e2e 覆盖 + 单测不失败"作为最低验收。

- [ ] **Step 5.5 · Commit**

```bash
git add src/pack/icon.js package.json package-lock.json
git commit -m "feat：icon 生成用 jimp 替代 sharp，去除 native binding 依赖。"
```

---

## Task 6：依赖分层重整（peerDep / keywords / engines）

**Files:**
- Modify: `package.json`（+`package-lock.json` 自动更新）

### 步骤

- [ ] **Step 6.1 · 改写 package.json 的 peerDependencies / peerDependenciesMeta**

打开 `package.json`。

**删除**下面两个字段的旧内容：

```jsonc
    "peerDependencies": {
        "bytenode": "^1.5.0",
        "electron": "22.3.1",
        "electron-builder": "^24.0.0",
        "webpack": "^5.0.0",
        "webpack-dev-server": "^5.0.0"
    },
    "peerDependenciesMeta": {
        "bytenode": { "optional": true },
        "electron-builder": { "optional": true }
    },
```

**替换为**：

```jsonc
    "peerDependencies": {
        "webpack": "^5.0.0",
        "webpack-dev-server": "^5.0.0"
    },
```

（`peerDependenciesMeta` 整个字段删除。）

- [ ] **Step 6.2 · 添加 engines 与更新 keywords**

在 `package.json` 顶层加入（放在 `author` 之后、`private` 附近合适位置）：

```jsonc
    "engines": {
        "node": ">=18.12.0"
    },
    "keywords": ["electron", "electron-builder", "bytenode", "webpack", "build", "packager", "cli"],
```

（如果原本没有 `keywords` 字段，直接新增；如果有，替换为上面的完整数组。）

- [ ] **Step 6.3 · 重新执行 npm install 更新 lock**

```bash
npm install
```

**预期**：`package-lock.json` 更新，不再把 electron / electron-builder / bytenode 记作 peerDep。

- [ ] **Step 6.4 · 运行全部测试确认无回归**

```bash
npm test
```

**预期**：全绿。

- [ ] **Step 6.5 · Commit**

```bash
git add package.json package-lock.json
git commit -m "chore：peerDep 精简为 webpack/wds，electron 生态改由运行时检查；加 engines/keywords。"
```

---

## Task 7：分发形态改造（不构建）

**Files:**
- Modify: `bin/base-client.js`
- Modify: `package.json`（+`package-lock.json` 自动更新）
- Delete: `rollup.config.mjs`

### 步骤

- [ ] **Step 7.1 · 改写 bin/base-client.js**

替换文件全部内容为：

```js
#!/usr/bin/env node
const { createCli } = require('../src/cli');
createCli().parse();
```

- [ ] **Step 7.2 · 改写 package.json 的 main / files / scripts / devDependencies**

在 `package.json` 中做如下修改：

- `"main": "dist/index.js"` → `"main": "src/index.js"`
- `"files": ["bin", "dist"]` → `"files": ["bin", "src"]`
- 删除 `scripts.build`（`"build": "rollup -c rollup.config.mjs"`）
- 删除 `scripts.prepublishOnly`（`"prepublishOnly": "npm run build"`）
- 从 `devDependencies` 删除以下 6 项：
    - `@rollup/plugin-commonjs`
    - `@rollup/plugin-json`
    - `@rollup/plugin-node-resolve`
    - `rollup`
    - `rollup-plugin-copy`
    - `rollup-plugin-node-externals`

**改后 devDependencies 应为**（其余顺序不变）：

```jsonc
    "devDependencies": {
        "html-webpack-plugin": "^5.6.3",
        "jest": "^30.4.2",
        "webpack": "^5.107.2",
        "webpack-dev-server": "^5.2.4"
    },
```

- [ ] **Step 7.3 · 删除 rollup.config.mjs**

```bash
git rm rollup.config.mjs
```

- [ ] **Step 7.4 · 重新执行 npm install 卸载 rollup 相关**

```bash
npm install
```

**预期**：`node_modules/rollup*` 目录消失；`package-lock.json` 更新。

- [ ] **Step 7.5 · 运行全部测试确认无回归**

```bash
npm test
```

**预期**：全绿（因为测试早就 `require('../../src/...')`，与 main/dist 路径无关）。

- [ ] **Step 7.6 · 直接跑 bin/base-client.js 验证**

```bash
node bin/base-client.js --help
```

**预期**：正常输出 6 条命令的 help（`dev:web / build / dev:app / pack / installer / child`），不报模块找不到。

- [ ] **Step 7.7 · Commit**

```bash
git add bin/base-client.js package.json package-lock.json
git commit -m "refactor：源码直发（删 rollup 构建链），main 指向 src/index.js。"
```

---

## Task 8：验收（手工 e2e + 全量测试）

**Files:** 无（纯验收）

### 步骤

- [ ] **Step 8.1 · 全量测试再跑一次**

```bash
npm test
```

**预期**：全绿。

- [ ] **Step 8.2 · 手工验证六条命令（fixture e2e）**

选择 `tests/fixtures/minimal-app`（或 `minimal-pack-full`）作为验证 fixture：

```bash
cd tests/fixtures/minimal-pack-full
npm i electron@22.3.1 electron-builder@24 bytenode@1.5.0 webpack webpack-dev-server
node ../../../bin/base-client.js dev:web
# ^C
node ../../../bin/base-client.js build
node ../../../bin/base-client.js dev:app
# ^C
node ../../../bin/base-client.js pack --platform win --arch x64 --unpack
node ../../../bin/base-client.js installer --platform win --arch x64
```

**预期**：每条命令都能成功启动/完成对应工作。**注意**：不同平台下部分命令可能无法完整跑（例如 Linux 上 `pack --platform mac` 需要额外工具），只需在**当前平台**跑通对应命令即可，其他平台组合遗留手工验证。

- [ ] **Step 8.3 · 验证依赖清单**

```bash
node -e "console.log(Object.keys(require('./package.json').dependencies).sort())"
```

**预期**（正好 9 项，全部纯 JS）：

```
[
  '@electron/asar', 'cac', 'dotenv', 'fs-extra',
  'jimp', 'ora', 'picocolors', 'png2icons', 'webpack-merge'
]
```

```bash
node -e "console.log(Object.keys(require('./package.json').peerDependencies).sort())"
```

**预期**：`[ 'webpack', 'webpack-dev-server' ]`。

- [ ] **Step 8.4 · 验证 electron / electron-builder / bytenode 完全不在依赖清单**

```bash
node -e "
const p = require('./package.json');
const all = { ...p.dependencies, ...p.devDependencies, ...p.peerDependencies };
for (const k of ['electron', 'electron-builder', 'bytenode', 'sharp']) {
    console.log(k, k in all ? '❌ 仍存在' : '✅ 已移除');
}
"
```

**预期**：4 项全部 ✅。

- [ ] **Step 8.5 · 验证 dist/ 不再产出且 templates 引用正常**

```bash
ls -la dist 2>/dev/null || echo 'dist 目录不存在（预期）'
node -e "
const path = require('path');
const shellTpl = path.join(__dirname, 'src/templates/shell/win-installer.nsh');
console.log('shell 模板存在:', require('fs').existsSync(shellTpl));
"
```

**预期**：dist 目录不存在（gitignore + 无产物）；shell 模板存在。

- [ ] **Step 8.6 · 无需再 commit（本任务纯验收）**

如果 Step 8.1-8.5 全部通过，任务完成。

---

## 遗留问题记录（不在本次范围）

以下问题不在本计划的实施范围内，任务完成后按需另开工单处理：

1. **bytenode 编译时 V8 版本与运行时 Electron V8 可能不匹配** — spec § 1.4 已记录，需另行处理
2. **`tests/unit/e2e-dev-web.test.js` 单跑超时** — `TODOs.md` 已记录
3. **龙芯 electron 镜像源** — `TODOs.md` 已记录
