# Frame M2 User Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `src/config/index.js`，提供 `loadUserConfig(configPath?)` 与 `resolveBuildConfig(ctx)`：定位 / 加载 `bc.config.js`，调用其函数形态拿到用户覆盖，用 `webpack-merge` 与 M4 预设深合并，输出三进程 webpack 配置。

**Architecture:** 两个互补的函数：`loadUserConfig` 负责"找到并加载"（cwd 探测 + `--config` 优先），返回**用户配置函数**（spec 要求统一函数形态）；`resolveBuildConfig` 负责"调用 + 合并"，**收 ctx 整体**（含 `cliOptions / env / mode / command / isDev / isProd`，与 M1 §五"上下文容器"约定一致），把整个 ctx 透传给用户函数，将返回值与 M4 三 getter 的预设逐进程 `webpack-merge`。

**Tech Stack:** Node 20+ / Jest 30 / webpack-merge 6 / CommonJS

> **Spec 参考**：`docs/superpowers/specs/2026-05-28-frame-m2-user-config-design.md`

> **依赖前置**：M3 plan 的 M0 工程基线已完成；M4 plan 全部完成（本 plan 直接 `require('./presets')`）。

> **关于 `.mjs` 加载**：spec §四 列出支持 `{js,mjs,cjs}`，但未指定 `.mjs` 的加载机制。CJS 项目里 `require('.mjs')` 会失败、必须 `import()`（异步），而 `resolveBuildConfig` 在 spec 的伪代码里是同步形态。本 plan 的折中：**只实现 `.js` / `.cjs` 同步加载**，`.mjs` 检测到则抛**清晰错误**"`.mjs` 暂不支持，请改为 `.js` / `.cjs`"。这与 spec 的 95% 兼容、留出未来切到 async 链路的口子。如需启用 `.mjs`，未来单开一个 plan。

---

## File Structure

**Create:**
- `src/config/index.js` — `loadUserConfig` + `resolveBuildConfig`
- `tests/unit/config-load.test.js` — `loadUserConfig` 单测
- `tests/unit/config-resolve.test.js` — `resolveBuildConfig` 单测
- `tests/fixtures/m2/` — 单测 fixture 目录（按需，每个 case 一份）

**Modify:**
- `package.json`：`webpack-merge` 加到 devDependencies（peer 已存在，本地测试需要）

---

## Task 0：依赖准备

**Files:**
- Modify: `package.json`

- [ ] **Step 0.1：安装 webpack-merge（devDependency）**

Run:
```bash
npm i -D webpack-merge@^6.0.0
```

Expected：`devDependencies.webpack-merge` 出现；`peerDependencies.webpack-merge` 保持不动。

- [ ] **Step 0.2：核对 package.json**

确认 `devDependencies` 同时含 `jest` / `webpack` / `webpack-merge`；`peerDependencies` 仍含 `webpack` / `webpack-dev-server` / `webpack-merge` / `dotenv`（注：M3 plan 已把 dotenv 从 peer 移到 dependency，不应再出现于 peer）。

- [ ] **Step 0.3：跑既有测试确认没破**

Run: `npm test`
Expected：M3 + M4 既有用例全绿（≥ 35）。

- [ ] **Step 0.4：提交 Task 0**

```bash
git add package.json package-lock.json
git commit -m "chore(M2): 准备 webpack-merge devDep"
```

---

## Task 1：loadUserConfig（定位 + 加载）

**Files:**
- Create: `src/config/index.js`
- Test: `tests/unit/config-load.test.js`

### 接口契约

```js
loadUserConfig(configPath?: string): Function
```
- 若传 `configPath` → 用绝对/相对 cwd 解析后的路径加载（不再探测）
- 否则在 `process.cwd()` 按 `bc.config.js` → `bc.config.cjs` 顺序探测
- 都找不到 → 抛错 `未找到 bc.config.js`
- 找到但是 `.mjs` → 抛错 `bc.config.mjs 暂不支持，请改用 .js / .cjs`
- 加载结果必须是 **function**（spec §二 函数形态）；不是则抛错 `bc.config.js 必须导出函数 (ctx) => config`

### TDD 测试基础设施

测试需要在临时 cwd 里建 `bc.config.js`。沿用 M3 plan 的 `withTempCwd` helper 思路。

- [ ] **Step 1.1：建测试 fixture helper**

Create `tests/unit/_helpers.js`：
```js
// tests/unit/_helpers.js
// 临时 cwd 工具：每个 case 用全新目录，规避 require 缓存与文件残留。
const fs = require('fs');
const os = require('os');
const path = require('path');

function withTempCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-m2-'));
  const originalCwd = process.cwd();
  process.chdir(dir);
  return {
    dir,
    cleanup() {
      process.chdir(originalCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

module.exports = { withTempCwd };
```

- [ ] **Step 1.2：写"找不到时抛错"测试**

```js
// tests/unit/config-load.test.js
const fs = require('fs');
const path = require('path');
const { withTempCwd } = require('./_helpers');
const { loadUserConfig } = require('../../src/config');

describe('loadUserConfig', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('cwd 无 bc.config.* 时抛错', () => {
    expect(() => loadUserConfig()).toThrow(/未找到 bc.config/);
  });
});
```

- [ ] **Step 1.3：跑测试确认失败**

Run: `npx jest tests/unit/config-load.test.js`
Expected：FAIL，`Cannot find module '../../src/config'`。

- [ ] **Step 1.4：写最小实现（仅探测 .js）**

```js
// src/config/index.js
const fs = require('fs');
const path = require('path');

const SUPPORTED_EXTS = ['.js', '.cjs'];
const UNSUPPORTED_EXTS_WITH_HINT = ['.mjs'];

function loadUserConfig(configPath) {
  const resolvedPath = configPath
    ? path.resolve(process.cwd(), configPath)
    : probeFromCwd();

  if (!resolvedPath) {
    throw new Error('未找到 bc.config.js（在 ' + process.cwd() + '）');
  }

  const ext = path.extname(resolvedPath);
  if (UNSUPPORTED_EXTS_WITH_HINT.includes(ext)) {
    throw new Error(
      `${path.basename(resolvedPath)} 暂不支持，请改用 .js / .cjs`
    );
  }

  // 清掉测试场景的 require 缓存（生产是一次性进程，cache 无害）。
  delete require.cache[resolvedPath];
  const mod = require(resolvedPath);
  const fn = mod && mod.__esModule ? mod.default : mod;

  if (typeof fn !== 'function') {
    throw new Error('bc.config.js 必须导出函数 (ctx) => config');
  }
  return fn;
}

function probeFromCwd() {
  for (const ext of [...SUPPORTED_EXTS, ...UNSUPPORTED_EXTS_WITH_HINT]) {
    const p = path.resolve(process.cwd(), `bc.config${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = { loadUserConfig };
```

> 说明：`probeFromCwd` 把 `.mjs` 也纳入探测，**目的是命中后给出"暂不支持"的友好错误**，而不是当作"未找到"。

- [ ] **Step 1.5：跑测试确认通过**

Run: `npx jest tests/unit/config-load.test.js`
Expected：PASS。

- [ ] **Step 1.6：补"找到 .js 时返回函数"测试**

```js
test('cwd 有 bc.config.js → 返回函数', () => {
  fs.writeFileSync(
    path.join(tmp.dir, 'bc.config.js'),
    'module.exports = (ctx) => ({ main: { devtool: false } });\n'
  );
  const fn = loadUserConfig();
  expect(typeof fn).toBe('function');
  expect(fn({})).toEqual({ main: { devtool: false } });
});

test('cwd 有 bc.config.cjs → 也能加载', () => {
  fs.writeFileSync(
    path.join(tmp.dir, 'bc.config.cjs'),
    'module.exports = () => ({ main: { mode: "production" } });\n'
  );
  expect(loadUserConfig()).toBeInstanceOf(Function);
});

test('.js 优先于 .cjs（同时存在时取 .js）', () => {
  fs.writeFileSync(
    path.join(tmp.dir, 'bc.config.js'),
    'module.exports = () => ({ tag: "js" });\n'
  );
  fs.writeFileSync(
    path.join(tmp.dir, 'bc.config.cjs'),
    'module.exports = () => ({ tag: "cjs" });\n'
  );
  expect(loadUserConfig()({}).tag).toBe('js');
});
```

- [ ] **Step 1.7：补".mjs 抛清晰错"测试**

```js
test('cwd 仅有 bc.config.mjs → 抛"暂不支持"错', () => {
  fs.writeFileSync(
    path.join(tmp.dir, 'bc.config.mjs'),
    'export default () => ({});\n'
  );
  expect(() => loadUserConfig()).toThrow(/bc\.config\.mjs 暂不支持/);
});
```

- [ ] **Step 1.8：补"导出非函数时抛错"测试**

```js
test('bc.config.js 导出对象（非函数）→ 抛错', () => {
  fs.writeFileSync(
    path.join(tmp.dir, 'bc.config.js'),
    'module.exports = { main: {} };\n'
  );
  expect(() => loadUserConfig()).toThrow(/必须导出函数/);
});
```

- [ ] **Step 1.9：补"--config 路径优先于 cwd 探测"测试**

```js
test('显式传 configPath（相对 cwd）→ 不走探测', () => {
  // cwd 里有一个 bc.config.js（不该被选中）
  fs.writeFileSync(
    path.join(tmp.dir, 'bc.config.js'),
    'module.exports = () => ({ tag: "cwd" });\n'
  );
  // 子目录里有显式指定的文件
  fs.mkdirSync(path.join(tmp.dir, 'configs'));
  fs.writeFileSync(
    path.join(tmp.dir, 'configs', 'custom.js'),
    'module.exports = () => ({ tag: "custom" });\n'
  );
  const fn = loadUserConfig('configs/custom.js');
  expect(fn({}).tag).toBe('custom');
});

test('显式 configPath 不存在 → 抛 Node 原生 MODULE_NOT_FOUND 错', () => {
  // 我们不需要自定义这种错误，让 require 自己报即可；测试只确认有抛错。
  expect(() => loadUserConfig('configs/missing.js')).toThrow();
});
```

- [ ] **Step 1.10：跑全部 loadUserConfig 测试**

Run: `npx jest tests/unit/config-load.test.js`
Expected：8 passed。

- [ ] **Step 1.11：提交 Task 1**

```bash
git add src/config/index.js tests/unit/_helpers.js tests/unit/config-load.test.js
git commit -m "feat(M2): loadUserConfig — cwd 探测 / --config 路径 / 函数形态校验"
```

---

## Task 2：resolveBuildConfig（调用 + 合并）

**Files:**
- Modify: `src/config/index.js`
- Test: `tests/unit/config-resolve.test.js`

### 接口契约

```js
resolveBuildConfig(ctx): {
  main:     webpackConfig,
  preload:  webpackConfig,
  renderer: webpackConfig,
}
```
- 入参 `ctx` 来自 M1 派发器：`{ cliOptions, env, mode, command, isDev, isProd }`
- 内部：解构出 `env / mode / cliOptions`；`loadUserConfig(cliOptions.config)` 得到用户函数
- 调用用户函数，**把整个 ctx 透传**（含 `isDev / isProd`）；ctx 新增字段自动可见，无需改本函数
- 用户函数返回 `{ main?, preload?, renderer? }` 三个进程的覆盖（任意缺省）
- 用 `webpack-merge` 把 M4 预设与对应进程的用户覆盖逐进程合并
- 返回最终三进程 webpack 配置对象

### TDD

- [ ] **Step 2.1：写"返回三进程对象 + ctx 透传给用户函数"测试**

```js
// tests/unit/config-resolve.test.js
const fs = require('fs');
const path = require('path');
const { withTempCwd } = require('./_helpers');
const { resolveBuildConfig } = require('../../src/config');

function writeUserConfig(dir, body) {
  fs.writeFileSync(path.join(dir, 'bc.config.js'), body);
}

describe('resolveBuildConfig', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('返回包含 main / preload / renderer 三个键的对象', () => {
    writeUserConfig(tmp.dir, 'module.exports = () => ({});');
    const cfg = resolveBuildConfig({
      cliOptions: {},
      env: { BC_X: '1' },
      mode: 'production',
      command: 'build',
      isDev: false,
      isProd: true,
    });
    expect(cfg).toHaveProperty('main');
    expect(cfg).toHaveProperty('preload');
    expect(cfg).toHaveProperty('renderer');
  });

  test('ctx 完整透传给用户函数（含 isDev/isProd）', () => {
    writeUserConfig(
      tmp.dir,
      `module.exports = (ctx) => {
         // 把 ctx 序列化到 main.output.path 上，供断言读
         return { main: { output: { __ctx: JSON.stringify(ctx) } } };
       };`
    );
    const cfg = resolveBuildConfig({
      cliOptions: { port: 9000, debug: true },
      env: { BC_API: 'http://x' },
      mode: 'development',
      command: 'dev',
      isDev: true,
      isProd: false,
    });
    const passedCtx = JSON.parse(cfg.main.output.__ctx);
    expect(passedCtx).toEqual({
      cliOptions: { port: 9000, debug: true },
      env: { BC_API: 'http://x' },
      mode: 'development',
      command: 'dev',
      isDev: true,
      isProd: false,
    });
  });
});
```

- [ ] **Step 2.2：跑测试确认失败**

Run: `npx jest tests/unit/config-resolve.test.js`
Expected：FAIL，`resolveBuildConfig is not a function`。

- [ ] **Step 2.3：实现 resolveBuildConfig**

把 `src/config/index.js` 在文件末尾追加（保持 `loadUserConfig` 不变）：

```js
// src/config/index.js（追加）
const { merge } = require('webpack-merge');
const {
  getMainPreset,
  getPreloadPreset,
  getRendererPreset,
} = require('./presets');

function resolveBuildConfig(ctx) {
  const { env, mode, cliOptions } = ctx;
  const rootDir = process.cwd();
  const userFn = loadUserConfig(cliOptions && cliOptions.config);
  const userConfig = userFn(ctx) || {};   // 整体透传 ctx（含 isDev/isProd），不解构-重组

  return {
    main: merge(
      getMainPreset({ rootDir, env, mode }),
      userConfig.main || {}
    ),
    preload: merge(
      getPreloadPreset({ rootDir, env, mode }),
      userConfig.preload || {}
    ),
    renderer: merge(
      getRendererPreset({ rootDir, env, mode }),
      userConfig.renderer || {}
    ),
  };
}

module.exports = { loadUserConfig, resolveBuildConfig };
```

注意：将 `module.exports = { loadUserConfig }` 改为同时导出两者。

- [ ] **Step 2.4：跑测试确认通过**

Run: `npx jest tests/unit/config-resolve.test.js`
Expected：2 passed。

- [ ] **Step 2.5：补"用户覆盖作用到对应进程"测试**

```js
test('用户覆盖 main.devtool 生效（标量覆盖）', () => {
  writeUserConfig(
    tmp.dir,
    `module.exports = () => ({ main: { devtool: 'eval-source-map' } });`
  );
  const cfg = resolveBuildConfig({
    env: {},
    mode: 'production',
    command: 'build',
    cliOptions: {},
  });
  // 预设 production 给的是 false；user 覆盖为 'eval-source-map'
  expect(cfg.main.devtool).toBe('eval-source-map');
  // preload / renderer 不受影响
  expect(cfg.preload.devtool).toBe(false);
  expect(cfg.renderer.devtool).toBe(false);
});
```

- [ ] **Step 2.6：补"数组追加语义（plugins / module.rules）"测试**

webpack-merge 默认数组拼接：preset 数组 + user 数组。

```js
test('user 追加的 plugins 拼接到预设之后（不替换）', () => {
  writeUserConfig(
    tmp.dir,
    `class Marker {}; module.exports = () => ({ main: { plugins: [new Marker()] } });`
  );
  const cfg = resolveBuildConfig({
    env: { BC_API: 'http://x' },
    mode: 'production',
    command: 'build',
    cliOptions: {},
  });
  // 预设至少有 1 个 plugin（DefinePlugin），user 追加 1 个 → 至少 2 个
  expect(cfg.main.plugins.length).toBeGreaterThanOrEqual(2);
  // 最后一个是 user 的 Marker
  expect(cfg.main.plugins[cfg.main.plugins.length - 1].constructor.name).toBe('Marker');
});

test('user 追加的 module.rules 拼接到预设之后', () => {
  writeUserConfig(
    tmp.dir,
    `module.exports = () => ({
       main: {
         module: { rules: [{ test: /\\.js$/, use: 'babel-loader' }] }
       }
     });`
  );
  const cfg = resolveBuildConfig({
    env: {},
    mode: 'production',
    command: 'build',
    cliOptions: {},
  });
  // 预设 3 条 Asset Modules + user 1 条 = 4 条
  expect(cfg.main.module.rules).toHaveLength(4);
  // 最后一条是 user 的
  expect(cfg.main.module.rules[3].use).toBe('babel-loader');
});
```

- [ ] **Step 2.7：补"对象深合并"测试**

```js
test('user 在 output 下追加字段（深合并）', () => {
  writeUserConfig(
    tmp.dir,
    `module.exports = () => ({
       main: { output: { sourcePrefix: '\\t' } }
     });`
  );
  const cfg = resolveBuildConfig({
    env: {},
    mode: 'production',
    command: 'build',
    cliOptions: {},
  });
  // 预设的 filename / libraryTarget 保留
  expect(cfg.main.output.filename).toBe('index.js');
  expect(cfg.main.output.libraryTarget).toBe('commonjs2');
  // user 追加的 sourcePrefix 也存在
  expect(cfg.main.output.sourcePrefix).toBe('\t');
});
```

- [ ] **Step 2.8：补"renderer.devServer 字段保留（M2 不摘除）"测试**

```js
test('renderer.devServer 字段经合并后保留在 renderer 配置里', () => {
  writeUserConfig(
    tmp.dir,
    `module.exports = () => ({
       renderer: {
         devServer: { port: 9000, proxy: { '/api': 'http://localhost:3000' } }
       }
     });`
  );
  const cfg = resolveBuildConfig({
    env: {},
    mode: 'development',
    command: 'dev',
    cliOptions: {},
  });
  expect(cfg.renderer.devServer).toEqual({
    port: 9000,
    proxy: { '/api': 'http://localhost:3000' },
  });
  // 其他 renderer 字段（target 等）也保留
  expect(cfg.renderer.target).toBe('web');
});
```

> M5 自己摘 `devServer` 字段，M2 只是透传——这是 spec §三 的明确分工。

- [ ] **Step 2.9：补"user 未写某个进程时不影响预设"测试**

```js
test('user 只写 renderer 时，main / preload 仍是纯预设', () => {
  writeUserConfig(
    tmp.dir,
    `module.exports = () => ({
       renderer: { devServer: { port: 8081 } }
     });`
  );
  const cfg = resolveBuildConfig({
    env: {},
    mode: 'production',
    command: 'build',
    cliOptions: {},
  });
  expect(cfg.main.target).toBe('electron-main');
  expect(cfg.preload.target).toBe('electron-preload');
  expect(cfg.renderer.devServer.port).toBe(8081);
});
```

- [ ] **Step 2.10：补"--config 透传给 loadUserConfig"测试**

```js
test('cliOptions.config 被 loadUserConfig 接收', () => {
  // 在子目录放配置文件
  fs.mkdirSync(path.join(tmp.dir, 'configs'));
  fs.writeFileSync(
    path.join(tmp.dir, 'configs', 'custom.js'),
    `module.exports = () => ({ main: { name: 'custom' } });`
  );
  // cwd 里**也**放一份，确认 --config 优先于 cwd 探测
  writeUserConfig(tmp.dir, `module.exports = () => ({ main: { name: 'cwd' } });`);

  const cfg = resolveBuildConfig({
    env: {},
    mode: 'production',
    command: 'build',
    cliOptions: { config: 'configs/custom.js' },
  });
  expect(cfg.main.name).toBe('custom');
});
```

- [ ] **Step 2.11：跑全部 resolveBuildConfig 测试**

Run: `npx jest tests/unit/config-resolve.test.js`
Expected：8 passed。

- [ ] **Step 2.12：提交 Task 2**

```bash
git add src/config/index.js tests/unit/config-resolve.test.js
git commit -m "feat(M2): resolveBuildConfig — ctx 透传 + webpack-merge 合并三进程"
```

---

## Task 3：API 表面 + 全套回归

**Files:**
- Create: `tests/unit/config-index.test.js`

- [ ] **Step 3.1：写 API 表面 smoke test**

```js
// tests/unit/config-index.test.js
describe('M2 config 模块 API 表面', () => {
  test('导出 loadUserConfig 与 resolveBuildConfig', () => {
    const mod = require('../../src/config');
    expect(typeof mod.loadUserConfig).toBe('function');
    expect(typeof mod.resolveBuildConfig).toBe('function');
  });
});
```

- [ ] **Step 3.2：跑全套测试**

Run: `npm test`
Expected：M3（9）+ M4（26）+ M2（8 load + 8 resolve + 1 surface = 17）= 52 个 case 全绿。

- [ ] **Step 3.3：提交 Task 3**

```bash
git add tests/unit/config-index.test.js
git commit -m "test(M2): 补 API 表面 smoke test 与全套回归"
```

---

## Self-Review

按 spec 逐项核查：

| Spec 章节 | 要求 | 覆盖在哪 |
|-----------|------|----------|
| §二 配置形态 | 统一函数形态 `(ctx) => config`，非函数抛错 | Task 1 Step 1.8 |
| §二 ctx 字段 | `{ cliOptions, env, mode, command, isDev, isProd }` 六项（含 M1 派生） | Task 2 Step 2.1（ctx 透传含 isDev/isProd） |
| §三 协议结构 | 顶层 `main / preload / renderer` | Task 2 Step 2.1 |
| §三 renderer.devServer | 字段保留、由 dev 命令消费 | Task 2 Step 2.8 |
| §四 定位 | cwd 探测 `{js,cjs}`；`.mjs` 抛"暂不支持" | Task 1 Step 1.6 / 1.7 |
| §四 按需必需 | dev / build / pack 调到 → 缺失抛错 | Task 1 Step 1.2 |
| §四 按需必需 | preview 不读 → 不在 M2 内做（preview 由 M1 派发器跳过 initEnv 与 resolveBuildConfig） | M1 plan 覆盖；本 plan 已保留"调到即必需"语义 |
| §四 不支持 TS | 加载链路简，仅 `require` | Task 1 实现仅用 `require` |
| §五 加载与合并 | `loadUserConfig(cliOptions.config)` → 函数；ctx 整体透传给 userFn（不解构-重组） | Task 1 + Task 2 Step 2.3 |
| §五 函数签名 | `resolveBuildConfig(ctx)`（收 ctx 整体，与 M1 §五对齐） | Task 2 Step 2.3 |
| §五 合并语义 | 用 `webpack-merge` 的 `merge`：数组追加、对象深合并 | Task 2 Step 2.6 / 2.7 |
| §五 用户进程缺省 | `userConfig?.main \|\| {}` | Task 2 Step 2.9 |
| §六 优先级 | CLI > 命令 > bc.config > 预设 — bc.config 用 webpack-merge 覆盖预设 | Task 2 Step 2.5（标量覆盖）/ 2.6（数组追加） |
| §七 模块边界 | M2 仅依赖 M4 的三 getter；不读 env 文件、不起 devServer / electron | 实现仅 require `./presets` 与 `webpack-merge`；devServer 字段透传不消费 |
| §八 不校验 | 配置结构不做白名单 | 本 plan 不实现结构校验 |

**Placeholder 扫描**：无 TBD / TODO。所有 step 的代码块完整。

**类型一致**：
- `loadUserConfig(configPath?: string) → Function`：Task 1 定义、Task 2 内部调用、Task 3 表面测试一致。
- `resolveBuildConfig(ctx) → { main, preload, renderer }`：Task 2 定义、内部 require M4 三 getter、Task 3 表面测试一致（ctx 整体透传，含 isDev/isProd）。
- `loadUserConfig` 抛错文本（"未找到 bc.config" / "暂不支持" / "必须导出函数"）跨 step 一致。

**模块边界**：M2 `require` 的外部模块仅 `fs` / `path` / `webpack-merge` / `./presets`（M4）；**没有** `require('webpack')`、`require('webpack-dev-server')`、`require('../env')`、`require('child_process')`。

**与 spec 的微调声明**：本 plan 实现 `.js / .cjs` 同步加载；`.mjs` 探测命中后抛"暂不支持"。这与 spec §四 列出的 `{js,mjs,cjs}` 有 5% 偏差，已在卷首声明。未来如启用 `.mjs`，需单独 plan 把整条调用链改 async。

---

## 验收

完成本 plan 后：
- `npm test` 全绿（≥ 52 个 case）
- 在带 `bc.config.js` 的临时目录里：
  ```bash
  node -e "console.log(JSON.stringify(require('./src/config').resolveBuildConfig({
    env: { BC_API: 'http://x' }, mode: 'production', command: 'build', cliOptions: {}
  }).main, null, 2))"
  ```
  输出合法的、包含预设字段（target / output / externals / plugins）+ 用户覆盖的 main webpack 配置。
- API 表面：`{ loadUserConfig, resolveBuildConfig }`
- 配置约定层（M3 + M4 + M2）完整闭合：输入 `{ env, mode, command, cliOptions }` → 输出三进程 webpack 配置
