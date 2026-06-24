# Frame Phase 5：pack 增强能力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 P4 pack 命令补齐三项增强能力：① AES 加密渲染层（`bc.config.encrypt` 开关）② bytenode 主进程字节码（`bc.config.bytenode` 开关，**路径 A**：外挂 loader 入口）③ 增量 `.asax` 包（`bc.config.incremental` 开关，非 `--unpack` 时）。同时实现 asar 包描述派生器 `derivePackageDescriptor`（供 P6 child .asar 复用）。

**Architecture:** 新增 `pack/encrypt.js` / `pack/bytenode.js` / `pack/package-descriptor.js` / `pack/incremental.js` 四个独立小模块；在 `cli/commands/pack.js` 阶段 B 第 ⑩~⑫ 步按开关依次调用。`__BC_BUILD__` 派生时增加 cryptoState 计算（`bc.config.encrypt !== false` 且 `build/encrypt.key` 存在 → encrypted=true）。

**Tech Stack:** Node.js crypto（AES）, bytenode（peer，运行时由用户项目提供）, @electron/asar（dep）, jest 30。

**Phase 范围**：仅 pack 命令的三项能力扩展。`installer` / `child` 命令、`.frame-state.json` 状态文件——由 Phase 6 承接。

**对应 spec 章节**：[2026-06-24-frame-design.md](../specs/2026-06-24-frame-design.md) § 5.1 pack 开关字段 / § 9.1 ⑩~⑫ / § 10.3 AES 加密 / § 10.4 bytenode（采用**路径 A**）/ § 10.5 增量 .asax / § 10.5.1 包描述 / § 10.9 多渲染入口。

**前置 Phase**：P1 ~ P4 均已完成。

---

## 文件结构（Phase 5 增量）

```
src/
├── pack/
│   ├── encrypt.js                       # 新增：encryptRenderer + computeCryptoState
│   ├── bytenode.js                      # 新增：bytenodeMain（路径 A）
│   ├── package-descriptor.js            # 新增：derivePackageDescriptor
│   └── incremental.js                   # 新增：buildIncrementalAsax
├── cli/commands/pack.js                 # 修改：阶段 B 接入 encrypt / incremental / bytenode

package.json                             # 修改：dependencies 加 @electron/asar；peerDependencies 加 bytenode

tests/unit/pack/
├── encrypt.test.js                      # 新增
├── bytenode.test.js                     # 新增
├── package-descriptor.test.js           # 新增
└── incremental.test.js                  # 新增

tests/unit/e2e-pack-enhancements.test.js # 新增（mock electron-builder + mock bytenode）
```

---

## Tasks

### Task 1：`src/pack/encrypt.js`（AES 加密 + cryptoState 计算）+ 测试

**Files:**
- Create: `src/pack/encrypt.js`
- Create: `tests/unit/pack/encrypt.test.js`

设计：
- `computeCryptoState({ rootDir, userConfig })` → `{ encrypted, encryptKey }`。`encrypt !== false && build/encrypt.key 存在` → `{ encrypted: true, encryptKey: <文件内容去末尾换行> }`。`encrypt !== false` 但密钥文件缺失 → 抛错。`encrypt === false` → `{ encrypted: false }`。
- `encryptRenderer({ appDir, encryptKey })` → 对 `appDir/<除 main 外>/**/*.js` 逐个 AES-256-CBC 加密（IV = 密钥前 16 字符），输出二进制覆盖原文件。

- [ ] **Step 1：写测试**

`tests/unit/pack/encrypt.test.js`：

```js
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const crypto = require('crypto');
const { computeCryptoState, encryptRenderer } = require('../../../src/pack/encrypt');

const tmpRoot = path.join(__dirname, '../../tmp/encrypt');
const KEY = '0123456789abcdef0123456789abcdef';   // 32 字符

beforeEach(() => { fse.ensureDirSync(tmpRoot); });
afterEach(() => { fse.removeSync(tmpRoot); });

describe('pack/encrypt.computeCryptoState', () => {
    test('encrypt 默认 (undefined) 且 build/encrypt.key 存在 → encrypted=true', () => {
        fse.ensureDirSync(path.join(tmpRoot, 'build'));
        fs.writeFileSync(path.join(tmpRoot, 'build/encrypt.key'), KEY + '\n');
        const s = computeCryptoState({ rootDir: tmpRoot, userConfig: {} });
        expect(s.encrypted).toBe(true);
        expect(s.encryptKey).toBe(KEY);
    });

    test('encrypt: false → encrypted=false，不读密钥', () => {
        fse.ensureDirSync(path.join(tmpRoot, 'build'));
        fs.writeFileSync(path.join(tmpRoot, 'build/encrypt.key'), KEY);
        const s = computeCryptoState({ rootDir: tmpRoot, userConfig: { encrypt: false } });
        expect(s.encrypted).toBe(false);
        expect(s.encryptKey).toBeUndefined();
    });

    test('encrypt: true 但密钥文件缺失 → 抛错', () => {
        expect(() => computeCryptoState({ rootDir: tmpRoot, userConfig: { encrypt: true } })).toThrow(/encrypt\.key/);
    });

    test('encrypt 缺省且密钥缺失 → encrypted=false（不抛错；开关明确为 false 才报）', () => {
        const s = computeCryptoState({ rootDir: tmpRoot, userConfig: {} });
        expect(s.encrypted).toBe(false);
    });

    test('密钥文件末尾换行被去除', () => {
        fse.ensureDirSync(path.join(tmpRoot, 'build'));
        fs.writeFileSync(path.join(tmpRoot, 'build/encrypt.key'), KEY + '\r\n');
        const s = computeCryptoState({ rootDir: tmpRoot, userConfig: { encrypt: true } });
        expect(s.encryptKey).toBe(KEY);
    });
});

describe('pack/encrypt.encryptRenderer', () => {
    test('加密 app/<除 main 外>/**/*.js，main 不动', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(path.join(appDir, 'main'));
        fse.ensureDirSync(path.join(appDir, 'renderer'));
        fse.ensureDirSync(path.join(appDir, 'preload'));
        fse.ensureDirSync(path.join(appDir, 'update'));

        const mainContent = 'console.log("main");';
        const rendererContent = 'console.log("renderer");';
        const preloadContent = 'console.log("preload");';
        const updateContent = 'console.log("update");';
        fs.writeFileSync(path.join(appDir, 'main/index.js'), mainContent);
        fs.writeFileSync(path.join(appDir, 'renderer/index.js'), rendererContent);
        fs.writeFileSync(path.join(appDir, 'preload/index.js'), preloadContent);
        fs.writeFileSync(path.join(appDir, 'update/index.js'), updateContent);

        await encryptRenderer({ appDir, encryptKey: KEY });

        // main 不动
        expect(fs.readFileSync(path.join(appDir, 'main/index.js'), 'utf8')).toBe(mainContent);
        // 其余被替换（内容不再等于原文）
        expect(fs.readFileSync(path.join(appDir, 'renderer/index.js'), 'utf8')).not.toBe(rendererContent);
        expect(fs.readFileSync(path.join(appDir, 'preload/index.js'), 'utf8')).not.toBe(preloadContent);
        expect(fs.readFileSync(path.join(appDir, 'update/index.js'), 'utf8')).not.toBe(updateContent);
    });

    test('加密产物可用同算法解密回原文（aes-256-cbc，IV=key.slice(0,16)）', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(path.join(appDir, 'renderer'));
        const original = 'console.log("hello world");';
        const filePath = path.join(appDir, 'renderer/index.js');
        fs.writeFileSync(filePath, original);

        await encryptRenderer({ appDir, encryptKey: KEY });

        const encrypted = fs.readFileSync(filePath);
        const iv = Buffer.from(KEY.slice(0, 16), 'utf8');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(KEY, 'utf8'), iv);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
        expect(decrypted).toBe(original);
    });

    test('递归加密渲染入口下的所有 .js（不仅顶层）', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(path.join(appDir, 'renderer/sub'));
        const original = 'console.log("nested");';
        const filePath = path.join(appDir, 'renderer/sub/deep.js');
        fs.writeFileSync(filePath, original);

        await encryptRenderer({ appDir, encryptKey: KEY });

        expect(fs.readFileSync(filePath, 'utf8')).not.toBe(original);
    });

    test('非 .js 文件不加密（如 .html / .css / asset）', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(path.join(appDir, 'renderer'));
        const htmlContent = '<html></html>';
        const cssContent = 'body { color: red; }';
        fs.writeFileSync(path.join(appDir, 'renderer/index.html'), htmlContent);
        fs.writeFileSync(path.join(appDir, 'renderer/style.css'), cssContent);

        await encryptRenderer({ appDir, encryptKey: KEY });

        expect(fs.readFileSync(path.join(appDir, 'renderer/index.html'), 'utf8')).toBe(htmlContent);
        expect(fs.readFileSync(path.join(appDir, 'renderer/style.css'), 'utf8')).toBe(cssContent);
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/pack/encrypt.test.js
```

- [ ] **Step 3：写实现**

`src/pack/encrypt.js`：

```js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * 计算 cryptoState：决定 __BC_BUILD__.encrypted 与 encryptKey。
 *
 * @param {object} args
 * @param {string} args.rootDir
 * @param {object} args.userConfig - bc.config 返回值
 * @returns {{ encrypted: boolean, encryptKey?: string }}
 */
function computeCryptoState({ rootDir, userConfig }) {
    if (userConfig.encrypt === false) return { encrypted: false };

    const keyPath = path.join(rootDir, 'build/encrypt.key');
    if (!fs.existsSync(keyPath)) {
        if (userConfig.encrypt === true) {
            throw new Error(`[base-client] 启用了 encrypt 但未找到 build/encrypt.key，请提供密钥文件或在 bc.config.js 设 encrypt: false`);
        }
        // encrypt 缺省 + 密钥缺失 → 视为关闭加密
        return { encrypted: false };
    }

    const encryptKey = fs.readFileSync(keyPath, 'utf8').replace(/\r?\n$/, '');
    return { encrypted: true, encryptKey };
}

/**
 * 递归加密 appDir 下除 main/ 之外所有子目录中的 *.js 文件。
 * 算法：aes-256-cbc，密钥 = encryptKey（UTF-8），IV = 密钥前 16 字符。
 */
async function encryptRenderer({ appDir, encryptKey }) {
    const key = Buffer.from(encryptKey, 'utf8');
    const iv = Buffer.from(encryptKey.slice(0, 16), 'utf8');

    const entries = fs.readdirSync(appDir, { withFileTypes: true });
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (ent.name === 'main') continue;
        await encryptDirRecursive(path.join(appDir, ent.name), key, iv);
    }
}

async function encryptDirRecursive(dir, key, iv) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            await encryptDirRecursive(p, key, iv);
            continue;
        }
        if (!ent.name.endsWith('.js')) continue;

        const raw = fs.readFileSync(p);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
        fs.writeFileSync(p, encrypted);
    }
}

module.exports = { computeCryptoState, encryptRenderer };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/pack/encrypt.test.js
```

预期：9 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/pack/encrypt.js tests/unit/pack/encrypt.test.js
git commit -m "feat(pack): 加 encryptRenderer + computeCryptoState（AES-256-CBC，IV=key前16，main 不动）"
```

---

### Task 2：`src/pack/bytenode.js`（路径 A：loader + jsc）+ 测试

**Files:**
- Create: `src/pack/bytenode.js`
- Create: `tests/unit/pack/bytenode.test.js`
- Modify: `package.json`（`peerDependencies` 加 `bytenode`）

设计（路径 A · 外挂 loader 入口）：
1. 解析用户项目的 bytenode 模块：`require.resolve('bytenode', { paths: [rootDir] })`
2. 调 `bytenode.compileFile({ filename: 'app/main/index.js', output: 'app/main/index.jsc' })`
3. 生成 `app/main/loader.js`：内容 `require('bytenode'); require('./index.jsc');`
4. 删除原 `app/main/index.js`（避免 Electron 加载到 .js 而不走字节码）
5. 修改 `mergedBuilderConfig.extraMetadata.main = 'main/loader.js'`

- [ ] **Step 1：把 bytenode 加为 peerDependency**

```bash
npm install --save-peer bytenode
```

- [ ] **Step 2：写测试（mock bytenode lib）**

`tests/unit/pack/bytenode.test.js`：

```js
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

// mock bytenode（用户项目根 node_modules 解析）
const fixtureDir = path.join(__dirname, '../../tmp/bytenode');
const bytenodeMock = path.join(fixtureDir, 'node_modules/bytenode');

beforeEach(() => {
    fse.ensureDirSync(bytenodeMock);
    fs.writeFileSync(path.join(bytenodeMock, 'package.json'), JSON.stringify({ name: 'bytenode', main: 'index.js' }));
    fs.writeFileSync(path.join(bytenodeMock, 'index.js'), `
        const fs = require('fs');
        module.exports = {
            compileFile: ({ filename, output }) => {
                fs.writeFileSync(output, '<FAKE_BYTECODE_OF:' + fs.readFileSync(filename, 'utf8') + '>');
                return output;
            },
        };
    `);
});
afterEach(() => { fse.removeSync(fixtureDir); });

describe('pack/bytenode (path A)', () => {
    test('产 main/index.jsc + main/loader.js，原 main/index.js 删除', async () => {
        const appDir = path.join(fixtureDir, 'app');
        fse.ensureDirSync(path.join(appDir, 'main'));
        fs.writeFileSync(path.join(appDir, 'main/index.js'), 'console.log("hello main");');

        const { bytenodeMain } = require('../../../src/pack/bytenode');
        const mergedBuilderConfig = {};
        await bytenodeMain({ rootDir: fixtureDir, appDir, mergedBuilderConfig });

        // index.jsc 产出
        expect(fs.existsSync(path.join(appDir, 'main/index.jsc'))).toBe(true);
        const jsc = fs.readFileSync(path.join(appDir, 'main/index.jsc'), 'utf8');
        expect(jsc).toContain('FAKE_BYTECODE_OF');

        // loader.js 产出且内容正确
        const loader = fs.readFileSync(path.join(appDir, 'main/loader.js'), 'utf8');
        expect(loader).toContain(`require('bytenode')`);
        expect(loader).toContain(`require('./index.jsc')`);

        // 原 index.js 删除
        expect(fs.existsSync(path.join(appDir, 'main/index.js'))).toBe(false);

        // mergedBuilderConfig.extraMetadata.main 改为 loader.js
        expect(mergedBuilderConfig.extraMetadata.main).toBe('main/loader.js');
    });

    test('已有 extraMetadata.main 时被覆盖为 main/loader.js（bytenode 是 frame 注入的产物，需 frame 自己说算）', async () => {
        const appDir = path.join(fixtureDir, 'app');
        fse.ensureDirSync(path.join(appDir, 'main'));
        fs.writeFileSync(path.join(appDir, 'main/index.js'), 'x');

        const { bytenodeMain } = require('../../../src/pack/bytenode');
        const mergedBuilderConfig = { extraMetadata: { main: 'custom/path.js' } };
        await bytenodeMain({ rootDir: fixtureDir, appDir, mergedBuilderConfig });

        expect(mergedBuilderConfig.extraMetadata.main).toBe('main/loader.js');
    });

    test('rootDir 下未装 bytenode 时抛错', async () => {
        fse.removeSync(bytenodeMock);
        const appDir = path.join(fixtureDir, 'app');
        fse.ensureDirSync(path.join(appDir, 'main'));
        fs.writeFileSync(path.join(appDir, 'main/index.js'), 'x');

        const { bytenodeMain } = require('../../../src/pack/bytenode');
        await expect(bytenodeMain({ rootDir: fixtureDir, appDir, mergedBuilderConfig: {} })).rejects.toThrow(/bytenode/);
    });
});
```

- [ ] **Step 3：跑测试确认失败**

```bash
npx jest tests/unit/pack/bytenode.test.js
```

- [ ] **Step 4：写实现**

`src/pack/bytenode.js`：

```js
const path = require('path');
const fs = require('fs');

/**
 * bytenode 主进程字节码（路径 A · 外挂 loader 入口）。
 *
 * 流程：
 *   1. 调用 bytenode.compileFile 把 app/main/index.js → app/main/index.jsc
 *   2. 生成 app/main/loader.js（require bytenode + require ./index.jsc）
 *   3. 删除原 app/main/index.js
 *   4. mergedBuilderConfig.extraMetadata.main = 'main/loader.js'
 */
async function bytenodeMain({ rootDir, appDir, mergedBuilderConfig }) {
    let bytenodeEntry;
    try {
        bytenodeEntry = require.resolve('bytenode', { paths: [rootDir] });
    } catch (err) {
        throw new Error(`[base-client] bytenode 未安装，请在项目中 npm i -D bytenode`);
    }
    // 清缓存以保证测试场景每次走最新的 mock
    delete require.cache[bytenodeEntry];
    const bytenode = require(bytenodeEntry);

    const src = path.join(appDir, 'main/index.js');
    const out = path.join(appDir, 'main/index.jsc');
    const loaderPath = path.join(appDir, 'main/loader.js');

    bytenode.compileFile({ filename: src, output: out });

    fs.writeFileSync(loaderPath, `require('bytenode');\nrequire('./index.jsc');\n`);

    // 删除原 .js
    if (fs.existsSync(src)) fs.unlinkSync(src);

    if (!mergedBuilderConfig.extraMetadata) mergedBuilderConfig.extraMetadata = {};
    mergedBuilderConfig.extraMetadata.main = 'main/loader.js';
}

module.exports = { bytenodeMain };
```

- [ ] **Step 5：跑测试确认通过**

```bash
npx jest tests/unit/pack/bytenode.test.js
```

预期：3 个 test PASS。

- [ ] **Step 6：commit**

```bash
git add src/pack/bytenode.js tests/unit/pack/bytenode.test.js package.json package-lock.json
git commit -m "feat(pack): 加 bytenodeMain（路径 A：index.jsc + loader.js + 删原 .js + 注入 extraMetadata.main）"
```

---

### Task 3：`src/pack/package-descriptor.js` + 测试

**Files:**
- Create: `src/pack/package-descriptor.js`
- Create: `tests/unit/pack/package-descriptor.test.js`

设计：从 buildInfo 取定 12 字段（不含 encryptKey），作为 .asax / child .asar 根的 package.json 内容。

- [ ] **Step 1：写测试**

`tests/unit/pack/package-descriptor.test.js`：

```js
const { derivePackageDescriptor } = require('../../../src/pack/package-descriptor');

describe('pack/package-descriptor', () => {
    test('取 12 字段（含 child / encrypted），不含 encryptKey', () => {
        const buildInfo = {
            target: 'app',
            name: 'demo',
            productName: 'Demo App',
            version: '1.0.0',
            env: 'prod',
            envName: '生产',
            buildTime: 1700000000000,
            platform: 'win',
            arch: 'x64',
            unpack: false,
            sign: true,
            child: false,
            encrypted: true,
            encryptKey: 'SECRET_KEY_THIS_SHOULD_NOT_LEAK',
        };
        const d = derivePackageDescriptor(buildInfo);
        expect(d).toEqual({
            name: 'demo',
            productName: 'Demo App',
            version: '1.0.0',
            env: 'prod',
            envName: '生产',
            buildTime: 1700000000000,
            platform: 'win',
            arch: 'x64',
            unpack: false,
            sign: true,
            child: false,
            encrypted: true,
        });
        expect('encryptKey' in d).toBe(false);
        expect('target' in d).toBe(false);     // target 也不出现（它是构建侧概念，不需进 setup 描述）
    });

    test('child 命令产物：child=true，platform/arch 为 undefined（保留键）', () => {
        const buildInfo = {
            target: 'app',
            name: 'child-app',
            productName: 'Child App',
            version: '2.0.0',
            env: 'prod',
            envName: undefined,
            buildTime: 1700000000000,
            platform: undefined,
            arch: undefined,
            unpack: false,
            sign: false,
            child: true,
            encrypted: false,
        };
        const d = derivePackageDescriptor(buildInfo);
        expect(d.child).toBe(true);
        expect(d.platform).toBeUndefined();
        expect(d.arch).toBeUndefined();
        // platform / arch 键仍存在以便宿主识别（即使值为 undefined）
        expect('platform' in d).toBe(true);
        expect('arch' in d).toBe(true);
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/pack/package-descriptor.test.js
```

- [ ] **Step 3：写实现**

`src/pack/package-descriptor.js`：

```js
/**
 * 派生 .asax / child .asar 根 package.json 内容。
 * 从 __BC_BUILD__ 取 12 字段；**绝不包含 encryptKey**；target 也不出现（target 是构建侧概念）。
 */
function derivePackageDescriptor(buildInfo) {
    return {
        name: buildInfo.name,
        productName: buildInfo.productName,
        version: buildInfo.version,
        env: buildInfo.env,
        envName: buildInfo.envName,
        buildTime: buildInfo.buildTime,
        platform: buildInfo.platform,
        arch: buildInfo.arch,
        unpack: buildInfo.unpack,
        sign: buildInfo.sign,
        child: buildInfo.child,
        encrypted: buildInfo.encrypted,
    };
}

module.exports = { derivePackageDescriptor };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/pack/package-descriptor.test.js
```

预期：2 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/pack/package-descriptor.js tests/unit/pack/package-descriptor.test.js
git commit -m "feat(pack): 加 derivePackageDescriptor（asar 根 package.json 12 字段，无 encryptKey/target）"
```

---

### Task 4：`src/pack/incremental.js`（增量 .asax 打包）+ 测试

**Files:**
- Create: `src/pack/incremental.js`
- Create: `tests/unit/pack/incremental.test.js`
- Modify: `package.json`（`dependencies` 加 `@electron/asar`）

设计：
1. 复制 `app/<除 main 外>` 到临时目录（`os.tmpdir()/bc-frame-asax-<rand>/`）
2. 临时目录根写 `package.json` = `derivePackageDescriptor(buildInfo)` 的 JSON
3. `asar.createPackage(tmpDir, outAsax)` → `dist/${env}-v${version}.asax`
4. 清临时目录

- [ ] **Step 1：装 @electron/asar**

```bash
npm install @electron/asar
```

- [ ] **Step 2：写测试**

`tests/unit/pack/incremental.test.js`：

```js
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const asar = require('@electron/asar');

const tmpRoot = path.join(__dirname, '../../tmp/incremental');

beforeEach(() => { fse.ensureDirSync(tmpRoot); });
afterEach(() => { fse.removeSync(tmpRoot); });

describe('pack/incremental', () => {
    test('打 .asax 到 dist/${env}-v${version}.asax，含除 main 外所有内容 + 派生 package.json', async () => {
        const { buildIncrementalAsax } = require('../../../src/pack/incremental');

        const appDir = path.join(tmpRoot, 'app');
        const distDir = path.join(tmpRoot, 'dist');
        fse.ensureDirSync(path.join(appDir, 'main'));
        fse.ensureDirSync(path.join(appDir, 'renderer'));
        fse.ensureDirSync(path.join(appDir, 'preload'));
        fs.writeFileSync(path.join(appDir, 'main/index.js'), 'main');
        fs.writeFileSync(path.join(appDir, 'renderer/index.js'), 'renderer');
        fs.writeFileSync(path.join(appDir, 'preload/index.js'), 'preload');

        const buildInfo = {
            target: 'app', name: 'demo', productName: 'Demo', version: '1.2.3',
            env: 'prod', envName: undefined, buildTime: 1700000000000,
            platform: 'win', arch: 'x64', unpack: false, sign: false, child: false,
            encrypted: true, encryptKey: 'SHOULD_NOT_LEAK',
        };

        await buildIncrementalAsax({ appDir, distDir, buildInfo });

        const asaxPath = path.join(distDir, 'prod-v1.2.3.asax');
        expect(fs.existsSync(asaxPath)).toBe(true);

        // 解包后检查内容：含 renderer / preload，不含 main，且根有 package.json（不含 encryptKey）
        const extractDir = path.join(tmpRoot, 'extract');
        asar.extractAll(asaxPath, extractDir);
        expect(fs.existsSync(path.join(extractDir, 'renderer/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'preload/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'main'))).toBe(false);
        const pkg = JSON.parse(fs.readFileSync(path.join(extractDir, 'package.json'), 'utf8'));
        expect(pkg.name).toBe('demo');
        expect(pkg.version).toBe('1.2.3');
        expect(pkg.encryptKey).toBeUndefined();
        expect(pkg.target).toBeUndefined();
    });
});
```

- [ ] **Step 3：跑测试确认失败**

```bash
npx jest tests/unit/pack/incremental.test.js
```

- [ ] **Step 4：写实现**

`src/pack/incremental.js`：

```js
const path = require('path');
const fs = require('fs');
const os = require('os');
const fse = require('fs-extra');
const asar = require('@electron/asar');
const { derivePackageDescriptor } = require('./package-descriptor');

async function buildIncrementalAsax({ appDir, distDir, buildInfo }) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-frame-asax-'));
    try {
        // 1. 复制 app/<除 main 外>
        const entries = fs.readdirSync(appDir, { withFileTypes: true });
        for (const ent of entries) {
            if (!ent.isDirectory() || ent.name === 'main') continue;
            await fse.copy(path.join(appDir, ent.name), path.join(tmpDir, ent.name));
        }

        // 2. 写 package.json
        const descriptor = derivePackageDescriptor(buildInfo);
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(descriptor, null, 2));

        // 3. asar 打包 → dist/${env}-v${version}.asax
        fse.ensureDirSync(distDir);
        const out = path.join(distDir, `${buildInfo.env}-v${buildInfo.version}.asax`);
        await asar.createPackage(tmpDir, out);
    } finally {
        // 4. 清临时目录
        fse.removeSync(tmpDir);
    }
}

module.exports = { buildIncrementalAsax };
```

- [ ] **Step 5：跑测试确认通过**

```bash
npx jest tests/unit/pack/incremental.test.js
```

预期：1 个 test PASS。

- [ ] **Step 6：commit**

```bash
git add src/pack/incremental.js tests/unit/pack/incremental.test.js package.json package-lock.json
git commit -m "feat(pack): 加 buildIncrementalAsax（app/除 main 外 + 派生 package.json → @electron/asar → dist/.asax）"
```

---

### Task 5：`src/cli/commands/pack.js` 接入 encrypt / incremental / bytenode + 测试

**Files:**
- Modify: `src/cli/commands/pack.js`
- Modify: `tests/unit/cli/commands-pack.test.js`（无需新增；E2E 在 Task 6）

- [ ] **Step 1：修改 `src/cli/commands/pack.js` action 流程**

把现有 action 中阶段 B 的：

```js
// ⑩~⑫ encrypt / incremental / bytenode —— Phase 5 接入；P4 暂不执行
```

替换为：

```js
// ⑩ AES 加密渲染层
if (cryptoState.encrypted) {
    const { encryptRenderer } = require('../../pack/encrypt');
    await encryptRenderer({ appDir, encryptKey: cryptoState.encryptKey });
    logger.info('AES 加密完成');
}

// ⑪ 增量 .asax 包（非 --unpack）
if (userConfig.incremental !== false && !ctx.cliOptions.unpack) {
    const { buildIncrementalAsax } = require('../../pack/incremental');
    await buildIncrementalAsax({ appDir, distDir, buildInfo });
    logger.info(`增量包 dist/${buildInfo.env}-v${buildInfo.version}.asax 已产出`);
}

// ⑫ bytenode 主进程字节码
if (userConfig.bytenode !== false) {
    const { bytenodeMain } = require('../../pack/bytenode');
    await bytenodeMain({ rootDir, appDir, mergedBuilderConfig });
    logger.info('bytenode 字节码完成');
}
```

同时在 action 顶部 require + 计算 cryptoState：

```js
const { computeCryptoState } = require('../../pack/encrypt');
const { loadUserConfig, locateBcConfig } = require('../../config/bc-config');
```

并在派生 buildInfo 之前插入：

```js
// 加载 userConfig 用于读取 encrypt/bytenode/incremental 三开关
const bcConfigPath = locateBcConfig(rootDir, ctx.cliOptions.config);
const userConfig = loadUserConfig(bcConfigPath, ctx);

// 计算 cryptoState
const cryptoState = computeCryptoState({ rootDir, userConfig });

// 派生 __BC_BUILD__（含 encrypted/encryptKey）
const buildInfo = deriveBuildInfo(ctx, pkgJson, cryptoState);
```

> 注：`resolveBuildConfig` 内部也调用一次 `loadUserConfig`——这是重复加载（开销可接受，bc.config 通常很小）。如要消除可后续重构。

完整 action 写法见下方代码片段（参考）：

```js
action: async (ctx) => {
    const rootDir = process.cwd();
    const distDir = path.join(rootDir, 'dist');
    const appDir = path.join(rootDir, 'app');
    const pkgJson = require(path.resolve(rootDir, 'package.json'));

    // ============ 阶段 A · 资源准备 ============
    fse.emptyDirSync(distDir);

    const bcConfigPath = locateBcConfig(rootDir, ctx.cliOptions.config);
    const userConfig = loadUserConfig(bcConfigPath, ctx);
    const cryptoState = computeCryptoState({ rootDir, userConfig });
    const buildInfo = deriveBuildInfo(ctx, pkgJson, cryptoState);

    const mergedBuilderConfig = resolveBuilderConfig(ctx, pkgJson);
    await adaptIcon({ rootDir, distDir, mergedBuilderConfig });
    generateShellScripts({
        rootDir, distDir, mergedBuilderConfig,
        appName: pkgJson.name,
        appDirName: mergedBuilderConfig.productName ?? pkgJson.name,
        appId: mergedBuilderConfig.appId,
    });

    // ============ 阶段 B · 代码构建 ============
    fse.emptyDirSync(appDir);
    const { main, preload, renderer } = resolveBuildConfig(ctx, pkgJson, buildInfo);
    const { devServer: _r, ...rendererWebpack } = renderer;
    await runProductionBuild([main, preload, rendererWebpack], ctx);

    if (cryptoState.encrypted) {
        const { encryptRenderer } = require('../../pack/encrypt');
        await encryptRenderer({ appDir, encryptKey: cryptoState.encryptKey });
        logger.info('AES 加密完成');
    }

    if (userConfig.incremental !== false && !ctx.cliOptions.unpack) {
        const { buildIncrementalAsax } = require('../../pack/incremental');
        await buildIncrementalAsax({ appDir, distDir, buildInfo });
        logger.info(`增量包 dist/${buildInfo.env}-v${buildInfo.version}.asax 已产出`);
    }

    if (userConfig.bytenode !== false) {
        const { bytenodeMain } = require('../../pack/bytenode');
        await bytenodeMain({ rootDir, appDir, mergedBuilderConfig });
        logger.info('bytenode 字节码完成');
    }

    // ============ 阶段 C · 安装包打包 ============
    const targets = buildTargets(ctx.cliOptions);
    const builder = resolveElectronBuilder(rootDir);
    await builder.build({ ...targets, config: mergedBuilderConfig });

    logger.success('pack 完成');
},
```

- [ ] **Step 2：跑现有 pack 命令模块测试（应仍 PASS）**

```bash
npx jest tests/unit/cli/commands-pack.test.js
```

预期：3 个原有 test 仍 PASS（命令契约未变）。

- [ ] **Step 3：commit**

```bash
git add src/cli/commands/pack.js
git commit -m "feat(pack): pack 命令接入 encrypt / incremental / bytenode 三能力（按 bc.config 开关）"
```

---

### Task 6：E2E 完整 pack（encrypt + bytenode + incremental 全开 + 多渲染入口）

**Files:**
- Modify: `tests/fixtures/minimal-pack/build/encrypt.key`（新增 32 字符密钥）
- Modify: `tests/fixtures/minimal-pack/bc.config.js`（追加 update 渲染入口）
- Modify: `tests/fixtures/minimal-pack/src/update/index.js`（新增）
- Modify: `tests/fixtures/minimal-pack/node_modules/bytenode/*`（新增 mock）
- Create: `tests/unit/e2e-pack-enhancements.test.js`

- [ ] **Step 1：扩 fixture**

`tests/fixtures/minimal-pack/build/encrypt.key`：

```
0123456789abcdef0123456789abcdef
```

`tests/fixtures/minimal-pack/src/update/index.js`：

```js
module.exports = {};
```

`tests/fixtures/minimal-pack/bc.config.js` 改为：

```js
const HtmlWebpackPlugin = require('html-webpack-plugin');
module.exports = (ctx) => ({
    main: {},
    preload: {},
    renderer: {
        entry: {
            renderer: 'src/renderer/index.js',
            update: 'src/update/index.js',
        },
        plugins: [
            new HtmlWebpackPlugin({ template: 'src/renderer/index.html', filename: 'renderer/index.html', chunks: ['renderer'] }),
            new HtmlWebpackPlugin({ template: 'src/renderer/index.html', filename: 'update/index.html', chunks: ['update'] }),
        ],
    },
    encrypt: true,
    bytenode: true,
    incremental: true,
});
```

`tests/fixtures/minimal-pack/node_modules/bytenode/package.json`：

```json
{ "name": "bytenode", "main": "index.js" }
```

`tests/fixtures/minimal-pack/node_modules/bytenode/index.js`：

```js
const fs = require('fs');
module.exports = {
    compileFile: ({ filename, output }) => {
        fs.writeFileSync(output, '<FAKE_BYTECODE_OF:' + fs.readFileSync(filename, 'utf8') + '>');
        return output;
    },
};
```

- [ ] **Step 2：写 E2E 测试**

`tests/unit/e2e-pack-enhancements.test.js`：

```js
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const crypto = require('crypto');
const asar = require('@electron/asar');

const fixtureDir = path.join(__dirname, '../fixtures/minimal-pack');

describe('E2E: pack 完整能力（encrypt + bytenode + incremental + 多入口）', () => {
    let oldCwd;
    const KEY = '0123456789abcdef0123456789abcdef';

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

    test('pack 全开：渲染层加密 + bytenode loader + .asax 含 update 入口', async () => {
        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');

        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64' });

        // 1. bytenode 路径 A：main/index.js 删除、index.jsc 与 loader.js 产出
        expect(fs.existsSync(path.join(fixtureDir, 'app/main/index.js'))).toBe(false);
        expect(fs.existsSync(path.join(fixtureDir, 'app/main/index.jsc'))).toBe(true);
        const loader = fs.readFileSync(path.join(fixtureDir, 'app/main/loader.js'), 'utf8');
        expect(loader).toContain(`require('bytenode')`);
        expect(loader).toContain(`require('./index.jsc')`);

        // 2. extraMetadata.main 被 frame 注入
        const builder = require(path.join(fixtureDir, 'node_modules/electron-builder/out/index.js'));
        const lastCall = builder._getLastCall();
        expect(lastCall.config.extraMetadata.main).toBe('main/loader.js');

        // 3. 渲染层加密：renderer/index.js 不再是原内容（用密钥可解回）
        const rendererJsPath = path.join(fixtureDir, 'app/renderer/index.js');
        const rendererBuf = fs.readFileSync(rendererJsPath);
        // 任取一段：原 webpack 产物含 "renderer" 或 webpack runtime 关键字；加密后是二进制随机
        // 验证可解密回非空 UTF-8 文本
        const iv = Buffer.from(KEY.slice(0, 16), 'utf8');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(KEY, 'utf8'), iv);
        const decrypted = Buffer.concat([decipher.update(rendererBuf), decipher.final()]);
        expect(decrypted.length).toBeGreaterThan(0);
        // 解密后内容应是 webpack 编译产物（含某些 JS 关键字）
        expect(decrypted.toString('utf8')).toMatch(/(function|require|module|var|const)/);

        // 4. update 入口也产出且加密
        expect(fs.existsSync(path.join(fixtureDir, 'app/update/index.js'))).toBe(true);
        const updateBuf = fs.readFileSync(path.join(fixtureDir, 'app/update/index.js'));
        const decipher2 = crypto.createDecipheriv('aes-256-cbc', Buffer.from(KEY, 'utf8'), iv);
        Buffer.concat([decipher2.update(updateBuf), decipher2.final()]);   // 解密成功即通过

        // 5. .asax 产出：dist/prod-v1.0.0.asax，含 renderer / update / preload，不含 main
        const asaxPath = path.join(fixtureDir, 'dist/prod-v1.0.0.asax');
        expect(fs.existsSync(asaxPath)).toBe(true);
        const extractDir = path.join(fixtureDir, 'dist/_extract');
        asar.extractAll(asaxPath, extractDir);
        expect(fs.existsSync(path.join(extractDir, 'renderer/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'update/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'preload/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'main'))).toBe(false);

        // 6. .asax 内 package.json 不含 encryptKey
        const pkgDescriptor = JSON.parse(fs.readFileSync(path.join(extractDir, 'package.json'), 'utf8'));
        expect(pkgDescriptor.encryptKey).toBeUndefined();
        expect(pkgDescriptor.encrypted).toBe(true);
    }, 120000);

    test('pack --unpack：不产 .asax', async () => {
        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');

        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64', unpack: true });

        const asaxPath = path.join(fixtureDir, 'dist/prod-v1.0.0.asax');
        expect(fs.existsSync(asaxPath)).toBe(false);
    }, 120000);

    test('bc.config.encrypt: false 时跳过加密 + encryptKey 不进 main bundle', async () => {
        // 临时改 bc.config.js
        const cfgPath = path.join(fixtureDir, 'bc.config.js');
        const original = fs.readFileSync(cfgPath, 'utf8');
        fs.writeFileSync(cfgPath, original.replace('encrypt: true', 'encrypt: false'));
        try {
            const cmd = require('../../src/cli/commands/pack');
            const { runCommand } = require('../../src/cli/index');

            await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64' });

            // renderer/index.js 不被加密 —— 应是原 webpack 文本产物
            const rendererJs = fs.readFileSync(path.join(fixtureDir, 'app/renderer/index.js'), 'utf8');
            expect(rendererJs).toMatch(/function|require|module|var|const/);   // 是有效 JS 文本
        } finally {
            fs.writeFileSync(cfgPath, original);
        }
    }, 120000);
});
```

- [ ] **Step 3：跑 E2E**

```bash
npx jest tests/unit/e2e-pack-enhancements.test.js --runInBand
```

预期：3 个 test PASS（前提：实际 bytenode mock 是简单 fake，加密用真 crypto）。

- [ ] **Step 4：跑全量测试**

```bash
npx jest --runInBand
```

预期：Phase 1~5 全部测试 PASS。

- [ ] **Step 5：commit**

```bash
git add tests/fixtures/minimal-pack/ tests/unit/e2e-pack-enhancements.test.js
git commit -m "test(e2e): pack 完整能力 E2E（encrypt + bytenode 路径 A + .asax + 多渲染入口）"
```

---

## Phase 5 完成态

- 新增 4 个 src/ 文件（pack/encrypt / bytenode / package-descriptor / incremental）
- cli/commands/pack.js 接入三项能力
- 新增 dependencies：@electron/asar；新增 peerDependencies：bytenode
- 新增 4 份 unit 测试 + 1 份 E2E；全部 PASS
- `bc-frame pack` 在 fixture 跑完整流程：加密渲染层 + bytenode 主进程 + .asax 增量包 + electron-builder 出 win nsis 安装包（mock）

## 下一 Phase 衔接点

Phase 6（installer + child）会复用：

- `src/pack/package-descriptor.js`（child .asar 根 package.json 派生）
- `src/pack/encrypt.js`（child 命令也加密渲染层）
- `src/config/builder-config.js`、`src/electron/{resolve-electron-builder, build-targets}`、`src/pack/icon`、`src/pack/shell`（installer 命令使用阶段 A 子集）

Phase 6 新增：

- `src/pack/frame-state.js`（readFrameState / writeFrameState）
- `src/pack/child-asar.js`（@electron/asar 打包整个 app/ → dist/child-*.asar）
- `src/cli/commands/installer.js`
- `src/cli/commands/child.js`
- `src/cli/commands/pack.js` 末尾追加：`--unpack` 完成时写状态文件
- cli/index 注册 installer 与 child
