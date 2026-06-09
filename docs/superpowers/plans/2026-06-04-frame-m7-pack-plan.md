# Frame M7 Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `base-client pack --platform <p> --arch <a> [--unpack] [--sign] [--pack-config <path>]`：(1) 解析 `electron-builder.config.js` 并与 `getPackPreset` 合并（用户 ctx 透传 isDev/isProd + replace 工具）；(2) **清空 `mergedConfig.directories.output`**（默认 `dist/`，与 M6 build 整体清空 `app/` 配对）；(3) 调 M6 `runProductionBuild(ctx)` 完成三进程生产构建；(4) 调用 electron-builder programmatic API 按 `buildTargets` 产出安装包（或免安装目录）。

**Architecture:** 拆 4 类纯/半纯组件 + 1 个编排 action：(1) `customMerge` + `replace` Symbol（实现"数组追加默认 + 显式整组替换"两栖语义）；(2) `getPackPreset`（A 产物布局 + B pkgJson 派生 + C 架构参数化）；(3) `resolvePackConfig(ctx)`（loadPackUserConfig + 调用 ctx 透传 + customMerge 串联；**收 ctx 整体**）；(4) `buildTargets` + `resolveElectronBuilder`（cliOptions → electron-builder CliOptions / 从用户项目解析）；(5) pack action 编排五步流水线（解析 config → 清空 output → runProductionBuild → electron-builder），**user config 解析在 build 之前**以保证快速失败。

**Tech Stack:** Node 20+ / Jest 30 / webpack-merge 6（mergeWithCustomize）/ fs-extra / CommonJS

> **Spec 参考**：`docs/superpowers/specs/2026-06-03-frame-m7-pack-design.md`

> **依赖前置**：M1 / M2 / M3 / M4 全部 plan 完成；M5 plan 完成（pack 不直接 require M5 工具）；**M6 plan 完成**（pack action 调用 `runProductionBuild(ctx)`，并复用了 M6 的 `fse.emptyDirSync`）。

> **electron-builder 由用户项目自带**：frame **不**在 dependencies / devDependencies 里声明 `electron-builder`。pack 命令运行时从用户项目 `node_modules` 解析；单测用"假包"工厂 `writeFakePackage`（M5 plan Task 1 已建立的 helper）模拟。

---

## File Structure

**Create:**
- `src/config/pack.js` — `resolvePackConfig` + `customMerge` + `replace` + `REPLACE` Symbol
- `src/config/presets/pack.js` — `getPackPreset`
- `src/cli/utils/electron-builder.js` — `resolveElectronBuilder` + `buildTargets`
- `src/cli/commands/pack.js` — pack 命令模板
- `tests/unit/config-pack-merge.test.js` — customMerge + replace
- `tests/unit/config-pack-preset.test.js` — getPackPreset
- `tests/unit/config-pack-resolve.test.js` — resolvePackConfig 端到端
- `tests/unit/utils-buildTargets.test.js`
- `tests/unit/utils-electron-builder-resolve.test.js`
- `tests/unit/cli-commands-pack.test.js`

**Modify:**
- `src/cli/commands/index.js`：取消 `require('./pack')` 的注释

无新增依赖（`webpack-merge` 已在 M2 plan 装到 devDependencies；electron-builder 不装）。

---

## Task 0：依赖核对

- [ ] **Step 0.1：跑既有测试确认基线**

Run: `npm test`
Expected：M3 + M4 + M2 + M1 + M5 + M6 共 ≥ 101 个 case 全绿。

无需 commit。

---

## Task 1：customMerge + replace + REPLACE Symbol

**Files:**
- Create: `src/config/pack.js`（仅本 task 涉及的 customMerge / replace / REPLACE 三项；resolvePackConfig 留到 Task 3）
- Test: `tests/unit/config-pack-merge.test.js`

### 接口契约

```js
const REPLACE = Symbol('$replace');     // 内部，不导出（仅 `replace` / `customMerge` 用）

replace(arr: Array): Array               // 把 REPLACE 标记挂在数组的不可枚举 Symbol 键上，返回值仍是数组
customMerge(preset: object, user: object): object
```
- `customMerge` 默认行为：标量覆盖、对象深合并、数组**追加**（与 M2 `webpack-merge` 默认行为一致）
- 当用户数组带 `REPLACE` 标记 → 整组替换（不与预设数组拼接）

### TDD

- [ ] **Step 1.1：写"replace 返回带标记的数组"测试**

```js
// tests/unit/config-pack-merge.test.js
const { customMerge, replace } = require('../../src/config/pack');

describe('replace', () => {
  test('返回值仍是数组', () => {
    const tagged = replace(['a', 'b']);
    expect(Array.isArray(tagged)).toBe(true);
    expect(tagged).toEqual(['a', 'b']);
  });

  test('对原数组无影响（浅拷贝）', () => {
    const src = ['a', 'b'];
    const tagged = replace(src);
    expect(tagged).not.toBe(src);
    expect(src).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 1.2：跑测试确认失败**

Run: `npx jest tests/unit/config-pack-merge.test.js`
Expected：FAIL，`Cannot find module '../../src/config/pack'`。

- [ ] **Step 1.3：写最小实现**

```js
// src/config/pack.js
const { mergeWithCustomize } = require('webpack-merge');

const REPLACE = Symbol('$replace');

function replace(arr) {
  const tagged = Array.from(arr);
  tagged[REPLACE] = true;
  return tagged;
}

function customMerge(preset, user) {
  return mergeWithCustomize({
    customizeArray: (presetArr, userArr) => {
      if (userArr && userArr[REPLACE]) return Array.from(userArr);
      return [...(presetArr || []), ...(userArr || [])];
    },
  })(preset || {}, user || {});
}

module.exports = { customMerge, replace, REPLACE };
```

- [ ] **Step 1.4：跑测试确认通过**

Run: `npx jest tests/unit/config-pack-merge.test.js`
Expected：PASS。

- [ ] **Step 1.5：补 customMerge 的默认合并行为测试**

```js
describe('customMerge 默认行为', () => {
  test('标量：user 覆盖 preset', () => {
    const r = customMerge({ appId: 'p', productName: 'P' }, { appId: 'user' });
    expect(r).toEqual({ appId: 'user', productName: 'P' });
  });

  test('对象：深合并', () => {
    const r = customMerge(
      { win: { icon: 'a.ico', requestedExecutionLevel: 'asInvoker' } },
      { win: { icon: 'b.ico' } }
    );
    expect(r.win).toEqual({ icon: 'b.ico', requestedExecutionLevel: 'asInvoker' });
  });

  test('数组：默认追加（preset + user）', () => {
    const r = customMerge(
      { extraResources: [{ from: 'a', to: 'a' }] },
      { extraResources: [{ from: 'b', to: 'b' }] }
    );
    expect(r.extraResources).toEqual([
      { from: 'a', to: 'a' },
      { from: 'b', to: 'b' },
    ]);
  });
});
```

- [ ] **Step 1.6：补 replace 整组替换 + 不泄漏标记测试**

```js
describe('customMerge + replace 整组替换', () => {
  test('user 用 replace 标记 → 替换预设的数组（不追加）', () => {
    const r = customMerge(
      { files: ['preset/a', 'preset/b'] },
      { files: replace(['user/x', '!**/node_modules/**']) }
    );
    expect(r.files).toEqual(['user/x', '!**/node_modules/**']);
  });

  test('REPLACE 标记不出现在最终输出对象上（不泄漏给 electron-builder）', () => {
    const r = customMerge(
      { files: ['preset/a'] },
      { files: replace(['user/x']) }
    );
    // 最终数组没有 REPLACE 标记
    const REPLACE = Object.getOwnPropertySymbols(r.files).find(
      (s) => s.toString().includes('replace')
    );
    expect(REPLACE).toBeUndefined();
  });

  test('user 未用 replace → 走默认追加路径，行为不变', () => {
    const r = customMerge(
      { files: ['preset/a'] },
      { files: ['user/x'] }
    );
    expect(r.files).toEqual(['preset/a', 'user/x']);
  });
});
```

- [ ] **Step 1.7：跑全部 customMerge 测试**

Run: `npx jest tests/unit/config-pack-merge.test.js`
Expected：8 passed（2 replace + 3 默认 + 3 replace 整组替换）。

- [ ] **Step 1.8：提交 Task 1**

```bash
git add src/config/pack.js tests/unit/config-pack-merge.test.js
git commit -m "feat(M7): customMerge + replace — 数组追加默认 / Symbol 标记整组替换"
```

---

## Task 2：getPackPreset

**Files:**
- Create: `src/config/presets/pack.js`
- Test: `tests/unit/config-pack-preset.test.js`

### 接口契约

```js
getPackPreset({ rootDir, env, mode, cliOptions, pkgJson }): electronBuilderConfig
```

返回对象包含：
- **A 产物布局**（强约定）：`directories.output: 'dist'`、`files: [{ from: 'app', to: '.' }, 'package.json', '!**/node_modules/**']`、`extraMetadata.main: 'main/index.js'`
- **B pkgJson 派生**（user 可覆盖）：`productName: pkgJson.productName ?? pkgJson.name`、`copyright: \`Copyright © ${year} ${author}\``、`artifactName: '${productName}_${os}_${arch}_${env.BC_ENV}_v${version}.${ext}'`
- **C 架构参数化**：仅 `cliOptions.arch === 'loong64'` 时注入 `electronDownload` + `electronVersion`
- **`appId` 不在预设**（M7 spec §三 已改为必填，由 electron-builder 自身校验）

### TDD

- [ ] **Step 2.1：写"基础字段（A 产物布局）"测试**

```js
// tests/unit/config-pack-preset.test.js
const { getPackPreset } = require('../../src/config/presets/pack');

const PKG = { name: 'demo', author: 'Alice' };

describe('getPackPreset', () => {
  test('A 产物布局：directories.output / files / extraMetadata.main', () => {
    const p = getPackPreset({
      rootDir: '/tmp/proj', env: {}, mode: 'production', cliOptions: {}, pkgJson: PKG,
    });
    expect(p.directories).toEqual({ output: 'dist' });
    expect(p.files).toEqual([
      { from: 'app', to: '.' },
      'package.json',
      '!**/node_modules/**',
    ]);
    expect(p.extraMetadata).toEqual({ main: 'main/index.js' });
  });
});
```

- [ ] **Step 2.2：跑测试确认失败**

Run: `npx jest tests/unit/config-pack-preset.test.js`
Expected：FAIL，模块不存在。

- [ ] **Step 2.3：写实现**

```js
// src/config/presets/pack.js
function getPackPreset({ rootDir, env, mode, cliOptions, pkgJson }) {
  const year = new Date().getFullYear();
  const author = pkgJson.author ?? '';

  const base = {
    // A 产物布局（与 build 产物结构对齐）
    directories: { output: 'dist' },
    files: [
      { from: 'app', to: '.' },
      'package.json',
      '!**/node_modules/**',
    ],
    extraMetadata: { main: 'main/index.js' },

    // B pkgJson 派生
    productName: pkgJson.productName ?? pkgJson.name,
    copyright: `Copyright © ${year} ${author}`,
    artifactName: '${productName}_${os}_${arch}_${env.BC_ENV}_v${version}.${ext}',
  };

  // C 架构参数化：loong64 mirror
  if (cliOptions.arch === 'loong64') {
    base.electronDownload = {
      version: '22.3.27',
      mirror: 'http://ftp.loongnix.cn/electron/LoongArch/',
      customDir: 'v22.3.27',
      platform: 'linux',
      arch: 'loong64',
    };
    base.electronVersion = '22.3.27';
  }

  return base;
}

module.exports = { getPackPreset };
```

- [ ] **Step 2.4：跑测试确认通过**

Run: `npx jest tests/unit/config-pack-preset.test.js`
Expected：PASS。

- [ ] **Step 2.5：补"B pkgJson 派生 + appId 不在预设"测试**

```js
test('B 派生：productName / copyright / artifactName', () => {
  const year = new Date().getFullYear();
  const p = getPackPreset({
    rootDir: '/tmp', env: {}, mode: 'production', cliOptions: {},
    pkgJson: { name: 'demo', author: 'Alice' },
  });
  expect(p.productName).toBe('demo');
  expect(p.copyright).toBe(`Copyright © ${year} Alice`);
  expect(p.artifactName).toBe('${productName}_${os}_${arch}_${env.BC_ENV}_v${version}.${ext}');
});

test('B 派生：pkgJson.productName 优先于 name', () => {
  const p = getPackPreset({
    rootDir: '/tmp', env: {}, mode: 'production', cliOptions: {},
    pkgJson: { name: 'internal-id', productName: 'Pretty Name' },
  });
  expect(p.productName).toBe('Pretty Name');
});

test('appId 不在预设里（必填项，user 必须自行声明）', () => {
  const p = getPackPreset({
    rootDir: '/tmp', env: {}, mode: 'production', cliOptions: {},
    pkgJson: { name: 'demo' },
  });
  expect(p).not.toHaveProperty('appId');
});
```

- [ ] **Step 2.6：补 C 架构参数化测试**

```js
test('C loong64 → 注入 electronDownload + electronVersion', () => {
  const p = getPackPreset({
    rootDir: '/tmp', env: {}, mode: 'production',
    cliOptions: { arch: 'loong64' }, pkgJson: { name: 'demo' },
  });
  expect(p.electronVersion).toBe('22.3.27');
  expect(p.electronDownload).toEqual({
    version: '22.3.27',
    mirror: 'http://ftp.loongnix.cn/electron/LoongArch/',
    customDir: 'v22.3.27',
    platform: 'linux',
    arch: 'loong64',
  });
});

test('C 非 loong64 → 不注入 electronDownload / electronVersion', () => {
  for (const arch of ['x64', 'arm64', 'ia32', 'armv7l', 'universal']) {
    const p = getPackPreset({
      rootDir: '/tmp', env: {}, mode: 'production',
      cliOptions: { arch }, pkgJson: { name: 'demo' },
    });
    expect(p).not.toHaveProperty('electronDownload');
    expect(p).not.toHaveProperty('electronVersion');
  }
});
```

- [ ] **Step 2.7：跑全部 getPackPreset 测试**

Run: `npx jest tests/unit/config-pack-preset.test.js`
Expected：6 passed。

- [ ] **Step 2.8：提交 Task 2**

```bash
git add src/config/presets/pack.js tests/unit/config-pack-preset.test.js
git commit -m "feat(M7): getPackPreset — A 产物布局 / B pkgJson 派生 / C loong64 镜像"
```

---

## Task 3：resolvePackConfig（loadPackUserConfig + 编排）

**Files:**
- Modify: `src/config/pack.js`（追加 `resolvePackConfig` 与 `loadPackUserConfig` 与 `probePackConfigFromCwd`）
- Test: `tests/unit/config-pack-resolve.test.js`

### 接口契约

```js
resolvePackConfig(ctx): electronBuilderConfig
```
- 入参 `ctx` 来自 M1 派发器：`{ cliOptions, env, mode, command, isDev, isProd }`（**收 ctx 整体**，与 M1 §五 / M2 §五 一致）
- 内部从 ctx 解构出 `{ env, mode, cliOptions }`，用 `ctx.command` 透传给用户函数（保持 `'pack'`）
- 步骤：
  1. 读 `<cwd>/package.json`
  2. `loadPackUserConfig(rootDir, cliOptions.packConfig)` 拿到用户配置函数
  3. 调用 `userFn({ ...ctx, replace })`（**整体透传 ctx + 注入 replace 工具**；ctx 上原有的 `isDev/isProd` 等字段自动可见）
  4. `getPackPreset({ rootDir, env, mode, cliOptions, pkgJson })` 拿到预设
  5. `customMerge(preset, userConfig)` 返回最终配置

`loadPackUserConfig(rootDir, packConfigPath?)`：
- 若传 `packConfigPath` → 以 `rootDir` 为根 resolve
- 否则按 `electron-builder.config.{js,cjs}` 顺序探测；`.mjs` 命中则抛"暂不支持"
- 找不到 → 抛错 `未找到 electron-builder.config.js`
- 加载后必须是 function，否则抛错

### TDD

- [ ] **Step 3.1：写"端到端：cwd 有 electron-builder.config.js → 合并出含 appId 的最终配置"测试**

```js
// tests/unit/config-pack-resolve.test.js
const fs = require('fs');
const path = require('path');
const { withTempCwd } = require('./_helpers');
const { resolvePackConfig } = require('../../src/config/pack');

function writePack(dir, body) {
  fs.writeFileSync(path.join(dir, 'electron-builder.config.js'), body);
}
function writePkg(dir, json) {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(json));
}

describe('resolvePackConfig', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('合并 preset + user → 含用户的 appId / win 配置 + 预设的 files / directories', () => {
    writePkg(tmp.dir, { name: 'demo', author: 'Alice' });
    writePack(
      tmp.dir,
      `module.exports = ({ command, mode, env, cliOptions, isDev, isProd, replace }) => ({
         appId: 'com.foo.bar',
         win: { icon: 'a.ico' },
       });`
    );
    const ctx = {
      cliOptions: { platform: 'win', arch: 'x64' },
      env: { BC_ENV: 'prod' },
      mode: 'production',
      command: 'pack',
      isDev: false,
      isProd: true,
    };
    const merged = resolvePackConfig(ctx);
    // user 字段
    expect(merged.appId).toBe('com.foo.bar');
    expect(merged.win).toEqual({ icon: 'a.ico' });
    // 预设字段保留
    expect(merged.directories).toEqual({ output: 'dist' });
    expect(merged.files).toEqual([
      { from: 'app', to: '.' },
      'package.json',
      '!**/node_modules/**',
    ]);
    expect(merged.productName).toBe('demo');
  });
});
```

- [ ] **Step 3.2：跑测试确认失败**

Run: `npx jest tests/unit/config-pack-resolve.test.js`
Expected：FAIL，`resolvePackConfig is not a function`。

- [ ] **Step 3.3：扩充 src/config/pack.js**

把 `src/config/pack.js` 改为：
```js
// src/config/pack.js
const fs = require('fs');
const path = require('path');
const { mergeWithCustomize } = require('webpack-merge');
const { getPackPreset } = require('./presets/pack');

const REPLACE = Symbol('$replace');

function replace(arr) {
  const tagged = Array.from(arr);
  tagged[REPLACE] = true;
  return tagged;
}

function customMerge(preset, user) {
  return mergeWithCustomize({
    customizeArray: (presetArr, userArr) => {
      if (userArr && userArr[REPLACE]) return Array.from(userArr);
      return [...(presetArr || []), ...(userArr || [])];
    },
  })(preset || {}, user || {});
}

const SUPPORTED_EXTS = ['.js', '.cjs'];
const UNSUPPORTED_EXTS_WITH_HINT = ['.mjs'];

function probePackConfigFromCwd(rootDir) {
  for (const ext of [...SUPPORTED_EXTS, ...UNSUPPORTED_EXTS_WITH_HINT]) {
    const p = path.resolve(rootDir, `electron-builder.config${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadPackUserConfig(rootDir, packConfigPath) {
  const resolvedPath = packConfigPath
    ? path.resolve(rootDir, packConfigPath)
    : probePackConfigFromCwd(rootDir);

  if (!resolvedPath) {
    throw new Error(`未找到 electron-builder.config.js（在 ${rootDir}）`);
  }

  const ext = path.extname(resolvedPath);
  if (UNSUPPORTED_EXTS_WITH_HINT.includes(ext)) {
    throw new Error(
      `${path.basename(resolvedPath)} 暂不支持，请改用 .js / .cjs`
    );
  }

  delete require.cache[resolvedPath];
  const mod = require(resolvedPath);
  const fn = mod && mod.__esModule ? mod.default : mod;
  if (typeof fn !== 'function') {
    throw new Error('electron-builder.config.js 必须导出函数 (ctx) => config');
  }
  return fn;
}

function resolvePackConfig(ctx) {
  const { env, mode, cliOptions } = ctx;
  const rootDir = process.cwd();
  const pkgJsonPath = path.resolve(rootDir, 'package.json');
  delete require.cache[pkgJsonPath];
  const pkgJson = require(pkgJsonPath);

  const userFn = loadPackUserConfig(rootDir, cliOptions && cliOptions.packConfig);
  // ctx 整体透传 + 注入 replace 工具（ctx 上原有 isDev/isProd 等字段自动可见）
  const userConfig = userFn({ ...ctx, replace }) || {};

  const preset = getPackPreset({ rootDir, env, mode, cliOptions, pkgJson });
  return customMerge(preset, userConfig);
}

module.exports = {
  customMerge,
  replace,
  resolvePackConfig,
  REPLACE,
};
```

- [ ] **Step 3.4：跑测试确认通过**

Run: `npx jest tests/unit/config-pack-resolve.test.js`
Expected：PASS。

- [ ] **Step 3.5：补"ctx 完整透传（含 replace）"测试**

```js
test('ctx 完整透传给用户函数（含 isDev/isProd + replace）', () => {
  writePkg(tmp.dir, { name: 'demo' });
  writePack(
    tmp.dir,
    `module.exports = (ctx) => ({
       win: { __ctxKeys: Object.keys(ctx).sort().join(','), __replaceIsFn: typeof ctx.replace === 'function' }
     });`
  );
  const ctx = {
    cliOptions: { platform: 'mac', arch: 'arm64', sign: true },
    env: { BC_ENV: 'dev' },
    mode: 'production',
    command: 'pack',
    isDev: false,
    isProd: true,
  };
  const merged = resolvePackConfig(ctx);
  // keys 含 cliOptions/command/env/isDev/isProd/mode/replace（顺序按 spread 后插入）
  expect(merged.win.__ctxKeys.split(',')).toEqual(
    expect.arrayContaining(['cliOptions', 'command', 'env', 'isDev', 'isProd', 'mode', 'replace'])
  );
  expect(merged.win.__replaceIsFn).toBe(true);
});
```

- [ ] **Step 3.6：补"用户 replace 整组替换 files"测试**

```js
test('用户 replace(files) → 整组替换预设 files', () => {
  writePkg(tmp.dir, { name: 'demo' });
  writePack(
    tmp.dir,
    `module.exports = ({ replace }) => ({
       appId: 'com.foo.bar',
       files: replace(['package.json', '!**/node_modules/**']),
     });`
  );
  const merged = resolvePackConfig({
    env: {}, mode: 'production', command: 'pack',
    cliOptions: { platform: 'win', arch: 'x64' },
  });
  expect(merged.files).toEqual(['package.json', '!**/node_modules/**']);
  // 预设的 { from: 'app', to: '.' } 不再出现
  expect(merged.files).not.toContainEqual({ from: 'app', to: '.' });
});
```

- [ ] **Step 3.7：补"配置文件缺失 → 抛错"测试**

```js
test('cwd 无 electron-builder.config.* 且未传 --pack-config → 抛错', () => {
  writePkg(tmp.dir, { name: 'demo' });
  // 不建任何 electron-builder.config.*
  expect(() => resolvePackConfig({
    env: {}, mode: 'production', command: 'pack',
    cliOptions: { platform: 'win', arch: 'x64' },
  })).toThrow(/未找到 electron-builder\.config/);
});

test('--pack-config 路径优先于 cwd 探测', () => {
  writePkg(tmp.dir, { name: 'demo' });
  // cwd 里**也**放一份（不该被选中）
  writePack(tmp.dir, `module.exports = () => ({ appId: 'com.cwd' });`);
  // 子目录的"指定路径"
  fs.mkdirSync(path.join(tmp.dir, 'configs'));
  fs.writeFileSync(
    path.join(tmp.dir, 'configs', 'pack.js'),
    `module.exports = () => ({ appId: 'com.custom' });`
  );
  const merged = resolvePackConfig({
    env: {}, mode: 'production', command: 'pack',
    cliOptions: { platform: 'win', arch: 'x64', packConfig: 'configs/pack.js' },
  });
  expect(merged.appId).toBe('com.custom');
});

test('electron-builder.config.mjs 命中 → 抛"暂不支持"', () => {
  writePkg(tmp.dir, { name: 'demo' });
  fs.writeFileSync(
    path.join(tmp.dir, 'electron-builder.config.mjs'),
    'export default () => ({})\n'
  );
  expect(() => resolvePackConfig({
    env: {}, mode: 'production', command: 'pack',
    cliOptions: { platform: 'win', arch: 'x64' },
  })).toThrow(/electron-builder\.config\.mjs 暂不支持/);
});

test('user 配置非函数 → 抛错', () => {
  writePkg(tmp.dir, { name: 'demo' });
  fs.writeFileSync(
    path.join(tmp.dir, 'electron-builder.config.js'),
    'module.exports = { appId: "com.foo" };'   // 直接对象，非函数
  );
  expect(() => resolvePackConfig({
    env: {}, mode: 'production', command: 'pack',
    cliOptions: { platform: 'win', arch: 'x64' },
  })).toThrow(/必须导出函数/);
});
```

- [ ] **Step 3.8：跑全部 resolvePackConfig 测试**

Run: `npx jest tests/unit/config-pack-resolve.test.js`
Expected：6 passed（1 端到端 + 1 ctx + 1 replace + 4 错误路径中至少 4 个）。注：实际加起来是 7 个，根据上面 step 数。

- [ ] **Step 3.9：提交 Task 3**

```bash
git add src/config/pack.js tests/unit/config-pack-resolve.test.js
git commit -m "feat(M7): resolvePackConfig — 加载 electron-builder.config + 调用 ctx + customMerge"
```

---

## Task 4：buildTargets + resolveElectronBuilder

**Files:**
- Create: `src/cli/utils/electron-builder.js`
- Test: `tests/unit/utils-buildTargets.test.js`
- Test: `tests/unit/utils-electron-builder-resolve.test.js`

### 接口契约

```js
buildTargets({ platform, arch, unpack }): electronBuilderCliOptions
// 例：{ platform:'win', arch:'x64', unpack:false } → { win: ['nsis'], x64: true }
//     unpack:true → { win: ['dir'], x64: true }

resolveElectronBuilder(rootDir: string): string   // electron-builder 模块入口路径
```

平台映射：`{ win: ['nsis'], mac: ['dmg'], linux: ['deb'] }`
架构白名单：`['ia32', 'x64', 'armv7l', 'arm64', 'universal', 'loong64']`

### TDD（buildTargets）

- [ ] **Step 4.1：写"必填校验"测试**

```js
// tests/unit/utils-buildTargets.test.js
const { buildTargets } = require('../../src/cli/utils/electron-builder');

describe('buildTargets', () => {
  test('缺 --platform → 抛错', () => {
    expect(() => buildTargets({ arch: 'x64' })).toThrow(/--platform/);
  });
  test('缺 --arch → 抛错', () => {
    expect(() => buildTargets({ platform: 'win' })).toThrow(/--arch/);
  });
});
```

- [ ] **Step 4.2：跑测试确认失败**

Run: `npx jest tests/unit/utils-buildTargets.test.js`
Expected：FAIL，模块不存在。

- [ ] **Step 4.3：写实现**

```js
// src/cli/utils/electron-builder.js
const path = require('path');

const platformMap = { win: ['nsis'], mac: ['dmg'], linux: ['deb'] };
const archList = ['ia32', 'x64', 'armv7l', 'arm64', 'universal', 'loong64'];

function buildTargets({ platform, arch, unpack } = {}) {
  if (!platform) throw new Error('缺少 --platform');
  if (!platformMap[platform]) throw new Error(`不支持的平台：${platform}`);
  if (!arch) throw new Error('缺少 --arch');
  if (!archList.includes(arch)) throw new Error(`不支持的架构：${arch}`);

  return {
    [platform]: unpack ? ['dir'] : platformMap[platform],
    [arch]: true,
  };
}

function resolveElectronBuilder(rootDir) {
  try {
    return require.resolve('electron-builder', {
      paths: [path.join(rootDir, 'node_modules')],
    });
  } catch (_) {
    throw new Error('electron-builder 未安装，请在项目中 npm i -D electron-builder');
  }
}

module.exports = { buildTargets, resolveElectronBuilder };
```

- [ ] **Step 4.4：跑测试确认通过**

Run: `npx jest tests/unit/utils-buildTargets.test.js`
Expected：PASS。

- [ ] **Step 4.5：补 buildTargets 的"不支持平台/架构"测试**

```js
test('不支持的 platform → 抛错', () => {
  expect(() => buildTargets({ platform: 'foo', arch: 'x64' }))
    .toThrow(/不支持的平台：foo/);
});

test('不支持的 arch → 抛错', () => {
  expect(() => buildTargets({ platform: 'win', arch: 'bogus' }))
    .toThrow(/不支持的架构：bogus/);
});
```

- [ ] **Step 4.6：补 buildTargets 的"正常输出"测试（含 unpack）**

```js
test('win + x64 → { win: ["nsis"], x64: true }', () => {
  expect(buildTargets({ platform: 'win', arch: 'x64' })).toEqual({
    win: ['nsis'], x64: true,
  });
});

test('mac + arm64 → { mac: ["dmg"], arm64: true }', () => {
  expect(buildTargets({ platform: 'mac', arch: 'arm64' })).toEqual({
    mac: ['dmg'], arm64: true,
  });
});

test('linux + loong64 → { linux: ["deb"], loong64: true }', () => {
  expect(buildTargets({ platform: 'linux', arch: 'loong64' })).toEqual({
    linux: ['deb'], loong64: true,
  });
});

test('unpack:true → 平台 target 改为 ["dir"]，架构不变', () => {
  expect(buildTargets({ platform: 'win', arch: 'x64', unpack: true })).toEqual({
    win: ['dir'], x64: true,
  });
});
```

- [ ] **Step 4.7：跑全部 buildTargets 测试**

Run: `npx jest tests/unit/utils-buildTargets.test.js`
Expected：8 passed。

### TDD（resolveElectronBuilder）

- [ ] **Step 4.8：写"找到 / 找不到" resolveElectronBuilder 测试**

```js
// tests/unit/utils-electron-builder-resolve.test.js
const path = require('path');
const { withTempCwd, writeFakePackage } = require('./_helpers');
const { resolveElectronBuilder } = require('../../src/cli/utils/electron-builder');

describe('resolveElectronBuilder', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('rootDir 下有 electron-builder → 返回入口路径', () => {
    writeFakePackage(tmp.dir, 'electron-builder', 'module.exports = { build: () => {} };');
    const p = resolveElectronBuilder(tmp.dir);
    expect(p).toBe(path.resolve(tmp.dir, 'node_modules', 'electron-builder', 'index.js'));
  });

  test('rootDir 下无 electron-builder → 抛"未安装"错', () => {
    expect(() => resolveElectronBuilder(tmp.dir))
      .toThrow(/electron-builder 未安装/);
  });
});
```

- [ ] **Step 4.9：跑测试确认通过**

Run: `npx jest tests/unit/utils-electron-builder-resolve.test.js`
Expected：2 passed。

- [ ] **Step 4.10：提交 Task 4**

```bash
git add src/cli/utils/electron-builder.js tests/unit/utils-buildTargets.test.js tests/unit/utils-electron-builder-resolve.test.js
git commit -m "feat(M7): buildTargets + resolveElectronBuilder — CliOptions 派生 + 用户项目解析"
```

---

## Task 5：pack 命令 action（编排五步流水线）

**Files:**
- Create: `src/cli/commands/pack.js`
- Test: `tests/unit/cli-commands-pack.test.js`

### 命令模板契约

```js
const { MODES } = require('../../mode');

module.exports = {
  name: 'pack',
  description: '产出指定平台/架构的安装包',
  mode: MODES.PROD,
  options: [
    ['--pack-config <path>', '指定 electron-builder.config.js 路径'],
    ['--platform <p>', '目标平台：win | mac | linux'],
    ['--arch <a>', '目标架构：ia32 | x64 | armv7l | arm64 | universal | loong64'],
    ['--unpack', '产出免安装目录（不打 installer）'],
    ['--sign', '触发签名'],
  ],
  action,
}
```

### action 流水线

1. `mergedConfig = resolvePackConfig(ctx)` —— **在 build 之前**，让 user config 问题快速失败
2. `fse.emptyDirSync(mergedConfig.directories.output)` —— 清空 pack 产物目录（默认 `dist/`），与 M6 build 整体清空 `app/` 配对
3. `await runProductionBuild(ctx)` —— 复用 M6 共享步骤（收 ctx 整体；M6 内部清空 `app/`）
4. `const electronBuilder = require(resolveElectronBuilder(rootDir))`
5. `const targets = buildTargets(cliOptions)`
6. `await electronBuilder.build({ ...targets, config: mergedConfig })`

### TDD（用 jest mock 隔离副作用）

- [ ] **Step 5.1：mock 五个内部依赖、写主流程顺序测试**

```js
// tests/unit/cli-commands-pack.test.js
jest.mock('fs-extra');
jest.mock('../../src/config/pack');
jest.mock('../../src/cli/utils/production-build');
jest.mock('../../src/cli/utils/electron-builder');

const fse = require('fs-extra');
const { resolvePackConfig } = require('../../src/config/pack');
const { runProductionBuild } = require('../../src/cli/utils/production-build');
const {
  buildTargets,
  resolveElectronBuilder,
} = require('../../src/cli/utils/electron-builder');

// 真实 electron-builder 模块入口的 build 函数，需要 jest 让 require 拿到它
const fakeBuilderPath = '/fake/path/electron-builder';
const builderBuild = jest.fn().mockResolvedValue();
jest.mock(
  '/fake/path/electron-builder',
  () => ({ build: builderBuild }),
  { virtual: true }
);

const { MODES } = require('../../src/mode');
const pack = require('../../src/cli/commands/pack');

beforeEach(() => {
  resolvePackConfig.mockReturnValue({
    appId: 'com.foo', files: ['package.json'], directories: { output: 'dist' },
  });
  runProductionBuild.mockResolvedValue();
  resolveElectronBuilder.mockReturnValue(fakeBuilderPath);
  buildTargets.mockReturnValue({ win: ['nsis'], x64: true });
  fse.emptyDirSync.mockReturnValue();
  builderBuild.mockClear();
});

describe('pack 命令', () => {
  test('命令模板字段（mode = MODES.PROD；含 --pack-config 与 5 个选项）', () => {
    expect(pack.name).toBe('pack');
    expect(pack.mode).toBe(MODES.PROD);
    expect(pack.skipEnv).toBeFalsy();
    const flags = (pack.options || []).map(([flag]) => flag);
    expect(flags).toEqual(expect.arrayContaining([
      expect.stringContaining('--pack-config'),
      expect.stringContaining('--platform'),
      expect.stringContaining('--arch'),
      expect.stringContaining('--unpack'),
      expect.stringContaining('--sign'),
    ]));
  });

  test('action 流水线：① resolvePackConfig(ctx) → ② fse.emptyDirSync(output) → ③ runProductionBuild(ctx) → ④ require(builderPath) → ⑤ buildTargets(cliOptions) → ⑥ electronBuilder.build', async () => {
    const ctx = {
      cliOptions: { platform: 'win', arch: 'x64', sign: true },
      env: { BC_ENV: 'prod' },
      mode: 'production',
      command: 'pack',
      isDev: false,
      isProd: true,
    };
    await pack.action(ctx);

    // 顺序：① 在 ③ 之前；③ 在 ⑥ 之前
    const callOrder = [
      resolvePackConfig.mock.invocationCallOrder[0],
      runProductionBuild.mock.invocationCallOrder[0],
      builderBuild.mock.invocationCallOrder[0],
    ];
    expect(callOrder).toEqual([...callOrder].sort((a, b) => a - b));

    expect(resolvePackConfig).toHaveBeenCalledWith(ctx);   // 收 ctx 整体
    expect(fse.emptyDirSync).toHaveBeenCalledWith('dist'); // 清空 mergedConfig.directories.output
    expect(runProductionBuild).toHaveBeenCalledWith(ctx);  // 收 ctx 整体
    expect(buildTargets).toHaveBeenCalledWith(ctx.cliOptions);
    expect(builderBuild).toHaveBeenCalledWith({
      win: ['nsis'], x64: true,
      config: { appId: 'com.foo', files: ['package.json'], directories: { output: 'dist' } },
    });
  });
});
```

- [ ] **Step 5.2：跑测试确认失败**

Run: `npx jest tests/unit/cli-commands-pack.test.js`
Expected：FAIL，模块不存在。

- [ ] **Step 5.3：写实现**

```js
// src/cli/commands/pack.js
const fse = require('fs-extra');
const { MODES } = require('../../mode');
const { resolvePackConfig } = require('../../config/pack');
const { runProductionBuild } = require('../utils/production-build');
const {
  buildTargets,
  resolveElectronBuilder,
} = require('../utils/electron-builder');

async function action(ctx) {
  const { cliOptions } = ctx;
  const rootDir = process.cwd();

  // ① 先解析 pack 配置，让 user config 问题快速失败
  const mergedConfig = resolvePackConfig(ctx);

  // ② 清空 pack 产物目录（默认 dist/），与 M6 build 整体清空 app/ 配对
  fse.emptyDirSync(mergedConfig.directories.output);

  // ③ 跑生产构建（收 ctx 整体）
  await runProductionBuild(ctx);

  // ④ 解析 electron-builder（从用户项目）
  const builderPath = resolveElectronBuilder(rootDir);
  const electronBuilder = require(builderPath);

  // ⑤ 派生 targets
  const targets = buildTargets(cliOptions);

  // ⑥ 调 electron-builder
  await electronBuilder.build({ ...targets, config: mergedConfig });
}

module.exports = {
  name: 'pack',
  description: '产出指定平台/架构的安装包',
  mode: MODES.PROD,
  options: [
    ['--pack-config <path>', '指定 electron-builder.config.js 路径'],
    ['--platform <p>', '目标平台：win | mac | linux'],
    ['--arch <a>', '目标架构：ia32 | x64 | armv7l | arm64 | universal | loong64'],
    ['--unpack', '产出免安装目录（不打 installer）'],
    ['--sign', '触发签名'],
  ],
  action,
};
```

- [ ] **Step 5.4：跑测试确认通过**

Run: `npx jest tests/unit/cli-commands-pack.test.js`
Expected：2 passed。

- [ ] **Step 5.5：补"user config 问题 → 不跑构建（快速失败）"测试**

```js
test('resolvePackConfig 抛错 → 不执行 runProductionBuild / electron-builder.build', async () => {
  resolvePackConfig.mockImplementation(() => {
    throw new Error('未找到 electron-builder.config.js');
  });
  const ctx = {
    cliOptions: { platform: 'win', arch: 'x64' },
    env: {}, mode: 'production', command: 'pack', isDev: false, isProd: true,
  };
  await expect(pack.action(ctx)).rejects.toThrow(/未找到 electron-builder/);
  expect(runProductionBuild).not.toHaveBeenCalled();
  expect(builderBuild).not.toHaveBeenCalled();
});

test('buildTargets 抛错（platform 不支持）→ 不调 electron-builder.build', async () => {
  buildTargets.mockImplementation(() => { throw new Error('不支持的平台：foo'); });
  await expect(pack.action({
    cliOptions: { platform: 'foo', arch: 'x64' },
    env: {}, mode: 'production', command: 'pack', isDev: false, isProd: true,
  })).rejects.toThrow(/不支持的平台：foo/);
  expect(builderBuild).not.toHaveBeenCalled();
});

test('electron-builder.build 抛错 → 透传抛出', async () => {
  builderBuild.mockRejectedValue(new Error('builder error'));
  await expect(pack.action({
    cliOptions: { platform: 'win', arch: 'x64' },
    env: {}, mode: 'production', command: 'pack', isDev: false, isProd: true,
  })).rejects.toThrow(/builder error/);
});
```

- [ ] **Step 5.6：跑全部 pack action 测试**

Run: `npx jest tests/unit/cli-commands-pack.test.js`
Expected：5 passed（命令模板 + 主流程顺序 + 快速失败 + 平台校验 + builder 抛错透传）。

- [ ] **Step 5.7：提交 Task 5**

```bash
git add src/cli/commands/pack.js tests/unit/cli-commands-pack.test.js
git commit -m "feat(M7): pack 命令 — 五步流水线（user config 优先解析以快速失败）"
```

---

## Task 6：接入命令清单 + 整体回归

**Files:**
- Modify: `src/cli/commands/index.js`

- [ ] **Step 6.1：取消注释，接入 pack**

修改 `src/cli/commands/index.js`：
```js
module.exports = [
  require('./dev'),         // M5
  require('./build'),       // M6
  require('./preview'),     // M6
  require('./pack'),        // M7 ✓
];
```

- [ ] **Step 6.2：跑全套测试**

Run: `npm test`
Expected：M3（9）+ M4（26）+ M2（17）+ M1（16）+ M5（20）+ M6（13）+ M7（8 customMerge + 6 preset + 6 resolve + 8 buildTargets + 2 builderResolve + 5 pack action = 35）≈ 136 个 case 全绿。

- [ ] **Step 6.3：CLI help smoke**

Run:
```bash
node -e "const { createCli } = require('./src/cli'); createCli().parse(['node','cli','--help'])"
```
Expected：help 输出含 `dev` / `build` / `preview` / `pack` 四个命令；`pack` 列出 `--pack-config` / `--platform` / `--arch` / `--unpack` / `--sign` 五个选项。

- [ ] **Step 6.4：提交 Task 6**

```bash
git add src/cli/commands/index.js
git commit -m "feat(M7): 注册 pack 命令到清单"
```

---

## Manual Integration Verification

人工执行（与 M5 / M6 用同一个 sample 项目，在其中 `npm i -D electron-builder` 并写一份 `electron-builder.config.js` 至少声明 `appId`）：

1. **基线**：sample 项目已具备 M5/M6 验证用的目录结构；额外：
   - 安装 `electron-builder`：`npm i -D electron-builder`
   - 项目根写 `electron-builder.config.js`：
     ```js
     module.exports = ({ cliOptions }) => ({
       appId: 'com.example.demo',
       win: { target: 'nsis' },
       linux: { target: 'deb' },
     });
     ```
2. **win/x64**：`npx base-client pack --platform win --arch x64 -e prod` → 控制台输出 build 日志（先三进程编译，再 electron-builder），`dist/` 下出 NSIS 安装包，文件名形如 `demo_win_x64_prod_v0.0.1.exe`
3. **mac/arm64**（在 mac 上）：`npx base-client pack --platform mac --arch arm64`
4. **linux/loong64**：注入 loong64 mirror（C 段）；产物在 `dist/`，文件名含 `loong64`
5. **--unpack**：`pack --platform win --arch x64 --unpack` → 不打 installer，输出 `win-unpacked/` 目录
6. **--sign**：电子证书路径与 env.WIN_CODE_SIGN_PWD 已在 `electron-builder.config.js` 内按 `cliOptions.sign` 分支注入；跑 `pack --sign` → 产物经过签名
7. **错误路径**：
   - 删 `electron-builder.config.js` → 抛"未找到 electron-builder.config.js"，**不跑** webpack 构建（快速失败）
   - 把 `appId` 从 user config 删掉 → electron-builder 报"appId is required"
   - 不装 `electron-builder` → 抛"electron-builder 未安装"
   - `--platform foo` → 抛"不支持的平台：foo"
8. **--pack-config**：`pack --pack-config configs/win.js --platform win --arch x64` → 使用 `configs/win.js` 而不是 cwd 的 `electron-builder.config.js`

---

## Self-Review

按 spec 逐项核查：

| Spec 章节 | 要求 | 覆盖在哪 |
|-----------|------|----------|
| §一 定位 | pack 内部 ① 解析 user config ② 跑 build ③ 调 builder | Task 5 |
| §二 用户配置形态 | 函数 `(ctx) => config`，ctx={cliOptions,command,env,isDev,isProd,mode,replace}（整体透传 + 注入 replace） | Task 3 Step 3.5 |
| §二 配置定位 | cwd 探测 `{js,cjs}`、`.mjs` 抛"暂不支持"、`--pack-config` 优先 | Task 3 Step 3.7 |
| §二 必需 | 缺失抛错 | Task 3 Step 3.7 |
| §二 不复用 --config | 独立 --pack-config | Task 5 命令模板 + Task 3 实现 |
| §三 A 产物布局 | directories.output / files / extraMetadata.main | Task 2 Step 2.1 |
| §三 B pkgJson 派生 | productName / copyright / artifactName | Task 2 Step 2.5 |
| §三 C 架构参数化 | 仅 loong64 时注入 electronDownload | Task 2 Step 2.6 |
| §三 不入预设 | platform 特定字段 / appId | Task 2 Step 2.5 验证无 appId |
| §四 默认合并 | 标量覆盖、对象深合并、数组追加 | Task 1 Step 1.5 |
| §四 replace 整组替换 | REPLACE Symbol 标记 + 不泄漏 | Task 1 Step 1.6 |
| §四 customMerge 实现 | webpack-merge mergeWithCustomize | Task 1 Step 1.3 |
| §五 流程 ①-⑥ | resolvePackConfig(ctx) → 清空 output → runProductionBuild(ctx) → resolveElectronBuilder → buildTargets → builder.build | Task 5 Step 5.1（流水线含 fse.emptyDirSync） |
| §五 清空 directories.output | fse.emptyDirSync(mergedConfig.directories.output) | Task 5 Step 5.1 + Step 5.3 实现 |
| §五 ① 在 ③ 之前 | 快速失败 | Task 5 Step 5.5（resolvePackConfig 失败时不跑 build） |
| §五 resolvePackConfig 签名 | `resolvePackConfig(ctx)` 收 ctx 整体，userFn 接 `{...ctx, replace}` | Task 3 Step 3.3 / 3.5 |
| §五 buildTargets 推导 | 必填校验 + 平台/架构白名单 + unpack | Task 4 Step 4.5 / 4.6 |
| §五 resolveElectronBuilder | 从用户项目 node_modules 解析 | Task 4 Step 4.8 |
| §五 失败处理 | 各阶段抛错由 M1 收尾 | Task 5 Step 5.5 |
| §五 命令选项 | --env (M1) / --config (M1) / --pack-config / --platform / --arch / --unpack / --sign | Task 5 命令模板 |
| §六 命令接口 | action(ctx)（收 ctx 整体） | Task 5 |
| §六 M7 自有接口 | resolvePackConfig(ctx) / getPackPreset({rootDir,env,mode,cliOptions,pkgJson}) / customMerge / buildTargets / resolveElectronBuilder | Task 1-5 |
| §六 不负责 | webpack 构建（经 M6） / bc.config（M2） / env（M3）/ CLI（M1）/ Electron 启动（M5/M6） | 实现 require 仅 config/pack / utils/production-build / utils/electron-builder / fs-extra（不 require webpack / dotenv / electron / cac） |
| §七 文件结构 | commands/pack.js / utils/electron-builder.js / config/pack.js / config/presets/pack.js | Task 1-5 |
| M1 §九 mode 抽象 | pack 命令模板 `mode: MODES.PROD` | Task 5 命令模板 |
| M1 §十 + M5 §十 编译反馈 | pack 内部通过 `runProductionBuild(ctx)` 复用 M6 的 spinner + logger 反馈 | Task 5 Step 5.3 调 runProductionBuild |

**Placeholder 扫描**：无 TBD / TODO。

**类型一致性**：
- `customMerge(preset, user) → object`、`replace(arr) → array`、`resolvePackConfig(ctx) → object`、`getPackPreset({rootDir,env,mode,cliOptions,pkgJson}) → object`、`buildTargets({platform,arch,unpack}) → object`、`resolveElectronBuilder(rootDir) → string` —— 跨 task 一致
- `resolvePackConfig(ctx)` 与 M2 `resolveBuildConfig(ctx)` / M6 `runProductionBuild(ctx)` 风格统一：收 ctx 整体、内部按需解构

**模块边界**：
- M7 `require` 的外部模块：`fs-extra`（清空 directories.output）、`path`、`webpack-merge`（customMerge）、`../../mode`（横切：MODES 常量）、`./presets/pack`（自己的）、`../../config/pack`（自己的）、`../utils/production-build`（M6）、`../utils/electron-builder`（自己的）、用户项目的 electron-builder（运行时 require）
- **没有** `require` `webpack`、`webpack-dev-server`、`electron`、M5 的 `utils/electron`、M3 的 `env`、M4 的 `presets`（除非经 M2/M6 间接走）、M1 的 cli
- 与 spec §六 列出的"M7 不负责"完全对齐

---

## 验收

完成本 plan 后：
- `npm test` 全绿（≥ 136 个 case，含 M3-M7 全部）
- `createCli().parse(['node','cli','--help'])` 列出 `dev` / `build` / `preview` / `pack`
- Manual Integration Verification 全部通过
- **frame 全部 7 个模块 plan 已落地**：用户可在 sample 项目里完整跑 `dev` → 编码 → `build` → `preview` → `pack` 流水线
