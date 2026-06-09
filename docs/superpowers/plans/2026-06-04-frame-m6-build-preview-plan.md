# Frame M6 Build & Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `base-client build` 与 `base-client preview`：build 整体清空 `app/`（`fse.emptyDirSync`）后三进程并行生产构建，编译反馈走 M1 §十 的 logger + M5 §十 的 ora spinner；preview 用已构建产物直接 spawn Electron（生产模式、不注入 dev URL）。抽出 `runProductionBuild(ctx)` 共享步骤收 ctx 整体，供 M7 pack 复用。

**Architecture:** 三个文件协作：`src/cli/utils/production-build.js` 是共享步骤"清空 + 三进程并行 webpack + spinner + logger 反馈"（build / pack 共用真相源）；`src/cli/commands/build.js` 命令模板仅调用 `runProductionBuild(ctx)`；`src/cli/commands/preview.js` 复用 M5 共享工具 `resolveElectron` / `resolveMainEntry` 启动产物，命令模板声明 `skipEnv: true` 跳过 env 读取与 `bc.config` 加载。

**Tech Stack:** Node 20+ / Jest 30 / webpack 5 / fs-extra / child_process / CommonJS

> **Spec 参考**：`docs/superpowers/specs/2026-05-29-frame-m6-build-preview-design.md`

> **依赖前置**：M1（命令模板 / runCommand / skipEnv 字段）、M2（resolveBuildConfig）、M3（initEnv）、M4（presets）、M5（src/cli/utils/electron.js 共享工具 + 横切 logger/format/compile-spinner）。本 plan 直接 require 上述模块的公共 API。

> **测试策略**：runProductionBuild 用 mock webpack 隔离编译副作用，但用真实 fs-extra 验证 app/ 清空逻辑（在临时 cwd 里跑，安全）。build / preview 命令模板用 mock 内部依赖测试 action 调用骨架。

---

## File Structure

**Create:**
- `src/cli/utils/production-build.js` — `runProductionBuild(ctx)`（共享：清空 + 三进程并行 + spinner + logger 反馈）
- `src/cli/commands/build.js` — build 命令模板
- `src/cli/commands/preview.js` — preview 命令模板
- `tests/unit/runProductionBuild.test.js`
- `tests/unit/cli-commands-build.test.js`
- `tests/unit/cli-commands-preview.test.js`

**Modify:**
- `src/cli/commands/index.js`：取消 `require('./build')` 与 `require('./preview')` 的注释
- `package.json`：`fs-extra ^11.x` 加到 dependencies（替换/新增 fs-extra）

---

## Task 0：依赖准备

- [ ] **Step 0.1：安装 fs-extra**

Run: `npm i fs-extra@^11.0.0`

`fse.emptyDirSync(appDir)` 用于 build 整体清空 `app/`（目录不存在时也安全），与 `fs.rmSync` 相比更直观、跨 Node 版本行为一致。

- [ ] **Step 0.2：跑既有测试确认基线**

Run: `npm test`
Expected：M3 + M4 + M2 + M1 + M5 共 ≥ 88 个 case 全绿。

- [ ] **Step 0.3：commit**

```bash
git add package.json package-lock.json
git commit -m "chore(M6): 准备 fs-extra dep"
```

---

## Task 1：runProductionBuild（共享生产构建步骤）

**Files:**
- Create: `src/cli/utils/production-build.js`
- Test: `tests/unit/runProductionBuild.test.js`

### 接口契约

```js
runProductionBuild(ctx): Promise<void>
```
- 入参 `ctx` 来自 M1 派发器：`{ cliOptions, env, mode:MODES.PROD, command, isDev:false, isProd:true }`（build / pack 都按此形态传）
- 步骤：
  1. 整体清空 `<cwd>/app/`（使用 `fse.emptyDirSync(appDir)`，目录不存在时也安全）
  2. `resolveBuildConfig(ctx)` 收 ctx 整体（mode 已在 ctx 中为 production）
  3. 启动 ora 编译 spinner（`createCompileSpinner`）
  4. 三进程**并行** webpack 编译（`Promise.all` 包裹三次 `runOne(config, name)`）；每个 runOne 内：`spinner.clear()` → `extractStatsSummary` → `logger.compileSuccess/Failure/Warning`（失败时附 `console.error(stats.toString({colors:true}))`）
  5. `finally { spinner.stop() }`
- 任一进程编译失败（`stats.hasErrors()` 或 `err`）→ 抛错由 M1 `runCommand` 收尾
- `command` 由 ctx 透传：build 命令 ctx.command = `'build'`，M7 pack 命令 ctx.command = `'pack'`

### TDD

- [ ] **Step 1.1：写"清空 app/ → 调 resolveBuildConfig → 调 webpack 三次"测试**

```js
// tests/unit/runProductionBuild.test.js
jest.mock('webpack');
jest.mock('../../src/config');
jest.mock('../../src/logger');
jest.mock('../../src/cli/utils/format');
jest.mock('../../src/cli/utils/compile-spinner');

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const { resolveBuildConfig } = require('../../src/config');
const logger = require('../../src/logger');
const { extractStatsSummary } = require('../../src/cli/utils/format');
const { createCompileSpinner } = require('../../src/cli/utils/compile-spinner');
const { withTempCwd } = require('./_helpers');

const { runProductionBuild } = require('../../src/cli/utils/production-build');

beforeEach(() => {
  // resolveBuildConfig 返回三进程占位配置
  resolveBuildConfig.mockReturnValue({
    main: { name: 'main' },
    preload: { name: 'preload' },
    renderer: { name: 'renderer' },
  });

  // webpack(config, cb)：异步触发 cb(null, success-stats)
  webpack.mockImplementation((config, cb) => {
    setImmediate(() => cb(null, {
      hasErrors: () => false,
      toString: () => `[${config.name}] compiled`,
    }));
  });

  // extractStatsSummary 默认返回 OK 摘要
  extractStatsSummary.mockReturnValue({
    name: 'unknown', ms: 100, totalSize: 2048, errorCount: 0, warningCount: 0,
  });

  // spinner noop
  createCompileSpinner.mockReturnValue({
    start: jest.fn(), stop: jest.fn(), clear: jest.fn(), isActive: () => true,
  });
});

describe('runProductionBuild', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('整体清空 app/ → 调 resolveBuildConfig(ctx 整体) → webpack 调用 3 次', async () => {
    // 预先在 app/ 里塞一个残留文件，确认会被清空
    fs.mkdirSync(path.join(tmp.dir, 'app', 'main'), { recursive: true });
    fs.writeFileSync(path.join(tmp.dir, 'app', 'leftover.txt'), 'old');

    const ctx = {
      cliOptions: { foo: 'bar' },
      env: { BC_API: 'http://x' },
      mode: 'production',
      command: 'build',
      isDev: false,
      isProd: true,
    };

    await runProductionBuild(ctx);

    expect(fs.existsSync(path.join(tmp.dir, 'app', 'leftover.txt'))).toBe(false);

    expect(resolveBuildConfig).toHaveBeenCalledWith(ctx);  // 收 ctx 整体

    expect(webpack).toHaveBeenCalledTimes(3);
    const configsPassedToWebpack = webpack.mock.calls.map(([cfg]) => cfg.name);
    expect(configsPassedToWebpack).toEqual(expect.arrayContaining(['main', 'preload', 'renderer']));
  });
});
```

- [ ] **Step 1.2：跑测试确认失败**

Run: `npx jest tests/unit/runProductionBuild.test.js`
Expected：FAIL，`Cannot find module '../../src/cli/utils/production-build'`。

- [ ] **Step 1.3：写实现**

```js
// src/cli/utils/production-build.js
const fse = require('fs-extra');
const path = require('path');
const webpack = require('webpack');
const { resolveBuildConfig } = require('../../config');
const logger = require('../../logger');
const { extractStatsSummary } = require('./format');
const { createCompileSpinner } = require('./compile-spinner');

function runOne(config, name, spinner) {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) return reject(err);
      const summary = extractStatsSummary(stats, name);
      if (spinner) spinner.clear();
      if (summary.errorCount > 0) {
        logger.compileFailure(summary.name);
        console.error(stats.toString({ colors: true }));
        return reject(new Error(`${summary.name} 编译失败`));
      }
      logger.compileSuccess(summary.name, summary.ms, summary.totalSize);
      logger.compileWarning(summary.name, summary.warningCount);
      resolve();
    });
  });
}

async function runProductionBuild(ctx) {
  const rootDir = process.cwd();

  // ① 清空 app/（fse.emptyDirSync：目录不存在时也安全）
  const appDir = path.resolve(rootDir, 'app');
  fse.emptyDirSync(appDir);

  // ② 取三进程构建配置（收 ctx 整体，mode 已在 ctx 中）
  const { main, preload, renderer } = resolveBuildConfig(ctx);

  // ③ 启 spinner → 并行三进程构建 → finally stop
  const spinner = createCompileSpinner('编译中...');
  spinner.start();
  try {
    await Promise.all([
      runOne(main, 'main', spinner),
      runOne(preload, 'preload', spinner),
      runOne(renderer, 'renderer', spinner),
    ]);
  } finally {
    spinner.stop();
  }
}

module.exports = { runProductionBuild };
```

- [ ] **Step 1.4：跑测试确认通过**

Run: `npx jest tests/unit/runProductionBuild.test.js`
Expected：PASS。

- [ ] **Step 1.5：补"任一进程失败 → 抛错"测试**

```js
test('renderer 编译失败 → logger.compileFailure + console.error(stats) + reject', async () => {
  // 第二次调 extractStatsSummary 时让 renderer 返回 errorCount>0
  let callIndex = 0;
  extractStatsSummary.mockImplementation((stats, fallbackName) => {
    callIndex += 1;
    const isErr = fallbackName === 'renderer';
    return { name: fallbackName, ms: 100, totalSize: 0, errorCount: isErr ? 1 : 0, warningCount: 0 };
  });
  webpack.mockImplementation((config, cb) => {
    setImmediate(() => cb(null, {
      hasErrors: () => config.name === 'renderer',
      toString: () => config.name === 'renderer' ? '[renderer] ERROR detail' : '[ok]',
    }));
  });
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(runProductionBuild({
    cliOptions: {}, env: {}, mode: 'production', command: 'build', isDev: false, isProd: true,
  })).rejects.toThrow(/renderer 编译失败/);

  expect(logger.compileFailure).toHaveBeenCalledWith('renderer');
  expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[renderer] ERROR detail'));
  errSpy.mockRestore();
});

test('webpack 自身 err（不是 stats）→ 也抛错', async () => {
  webpack.mockImplementation((config, cb) => {
    setImmediate(() => cb(new Error('webpack crashed'), null));
  });
  await expect(runProductionBuild({
    cliOptions: {}, env: {}, mode: 'production', command: 'build', isDev: false, isProd: true,
  })).rejects.toThrow(/webpack crashed/);
});
```

- [ ] **Step 1.6：补"app/ 不存在时也安全（fse.emptyDirSync 不报错）"测试**

```js
test('app/ 不存在时清空仍正常（不报错）', async () => {
  // 不预建 app/，cwd 是空的临时目录
  await expect(runProductionBuild({
    cliOptions: {}, env: {}, mode: 'production', command: 'build', isDev: false, isProd: true,
  })).resolves.toBeUndefined();
});
```

- [ ] **Step 1.7：补"command 透传场景：pack"测试（M7 复用证据）**

```js
test('command="pack" 时 ctx 整体透传给 resolveBuildConfig（M7 复用同款步骤）', async () => {
  const ctx = {
    cliOptions: { platform: 'win', arch: 'x64' },
    env: { BC_X: '1' },
    mode: 'production', command: 'pack', isDev: false, isProd: true,
  };
  await runProductionBuild(ctx);
  expect(resolveBuildConfig).toHaveBeenCalledWith(ctx);
});
```

- [ ] **Step 1.8：补"spinner 启停 + logger 反馈"测试**

```js
test('spinner start/stop 配对，三个进程 success 时 logger.compileSuccess 被调 3 次', async () => {
  const spinnerStub = { start: jest.fn(), stop: jest.fn(), clear: jest.fn(), isActive: () => true };
  createCompileSpinner.mockReturnValueOnce(spinnerStub);
  await runProductionBuild({
    cliOptions: {}, env: {}, mode: 'production', command: 'build', isDev: false, isProd: true,
  });
  expect(spinnerStub.start).toHaveBeenCalledTimes(1);
  expect(spinnerStub.stop).toHaveBeenCalledTimes(1);
  expect(logger.compileSuccess).toHaveBeenCalledTimes(3);
  expect(logger.compileFailure).not.toHaveBeenCalled();
});
```

- [ ] **Step 1.9：跑全部 runProductionBuild 测试**

Run: `npx jest tests/unit/runProductionBuild.test.js`
Expected：6 passed。

- [ ] **Step 1.10：提交 Task 1**

```bash
git add src/cli/utils/production-build.js tests/unit/runProductionBuild.test.js
git commit -m "feat(M6): runProductionBuild — 清空 app/ + 三进程并行生产构建（build/pack 共用）"
```

---

## Task 2：build 命令

**Files:**
- Create: `src/cli/commands/build.js`
- Test: `tests/unit/cli-commands-build.test.js`

### 命令模板契约

```js
const { MODES } = require('../../mode');

module.exports = {
  name: 'build',
  description: '三进程生产构建（产物到 app/）',
  mode: MODES.PROD,
  options: [],
  action: async (ctx) => runProductionBuild(ctx),  // 收 ctx 整体
}
```
- 无命令专属选项
- `skipEnv` 缺省（即 false）：build 需要 env 注入到三进程 bundle
- 命令模板 `mode` 字段为 `MODES.PROD`（字面量来源见 M1 §九 mode 抽象）
- action 不解构 ctx，直接透传给 `runProductionBuild(ctx)`，与 M2 / M7 的"收 ctx 整体"风格一致

### TDD

- [ ] **Step 2.1：写命令模板字段 + action 调 runProductionBuild 测试**

```js
// tests/unit/cli-commands-build.test.js
const { MODES } = require('../../src/mode');
jest.mock('../../src/cli/utils/production-build');

const { runProductionBuild } = require('../../src/cli/utils/production-build');
const build = require('../../src/cli/commands/build');

describe('build 命令', () => {
  test('命令模板字段（mode = MODES.PROD）', () => {
    expect(build.name).toBe('build');
    expect(build.mode).toBe(MODES.PROD);
    expect(build.skipEnv).toBeFalsy();
    expect(typeof build.action).toBe('function');
    expect(build.options || []).toEqual([]);   // 无专属选项
  });

  test('action 调 runProductionBuild(ctx)，ctx 整体透传', async () => {
    runProductionBuild.mockResolvedValue();
    const ctx = {
      cliOptions: { config: undefined, debug: false },
      env: { BC_API: 'http://x' },
      mode: MODES.PROD,
      command: 'build',
      isDev: false,
      isProd: true,
    };
    await build.action(ctx);
    expect(runProductionBuild).toHaveBeenCalledWith(ctx);
  });

  test('runProductionBuild 抛错 → action 透传抛出（交 M1 runCommand 收尾）', async () => {
    runProductionBuild.mockRejectedValue(new Error('compile failed'));
    await expect(build.action({
      cliOptions: {}, env: {}, mode: 'production', command: 'build', isDev: false, isProd: true,
    })).rejects.toThrow(/compile failed/);
  });
});
```

- [ ] **Step 2.2：跑测试确认失败**

Run: `npx jest tests/unit/cli-commands-build.test.js`
Expected：FAIL，模块不存在。

- [ ] **Step 2.3：写实现**

```js
// src/cli/commands/build.js
const { MODES } = require('../../mode');
const { runProductionBuild } = require('../utils/production-build');

module.exports = {
  name: 'build',
  description: '三进程生产构建（产物到 app/）',
  mode: MODES.PROD,
  options: [],
  action: async (ctx) => runProductionBuild(ctx),
};
```

- [ ] **Step 2.4：跑测试确认通过**

Run: `npx jest tests/unit/cli-commands-build.test.js`
Expected：3 passed。

- [ ] **Step 2.5：提交 Task 2**

```bash
git add src/cli/commands/build.js tests/unit/cli-commands-build.test.js
git commit -m "feat(M6): build 命令 — 调用 runProductionBuild 编排三进程生产构建"
```

---

## Task 3：preview 命令

**Files:**
- Create: `src/cli/commands/preview.js`
- Test: `tests/unit/cli-commands-preview.test.js`

### 命令模板契约

```js
const { MODES } = require('../../mode');

module.exports = {
  name: 'preview',
  description: '启动已构建产物（生产模式）',
  mode: MODES.PROD,
  skipEnv: true,                 // 不读 .env.*、不调 resolveBuildConfig
  options: [],
  action: async (ctx) => { ... },
}
```
- `mode: MODES.PROD` 与 build 共用字面量来源

### action 流程

1. `resolveElectron(rootDir)` + `resolveMainEntry(rootDir)`（M5 共享工具）
2. `spawn(electron, [mainEntry], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } })`
   - **不**注入 `RENDERER_DEV_URL`（生产场景，user main 走 `loadFile`）
3. `electron.on('close', (code) => process.exit(code ?? 0))`
4. 不引入 killElectron / 不监听 SIGINT —— `stdio: 'inherit'` 下 Ctrl+C 随进程组传给 Electron，Electron 退出后触发 close 收尾

### TDD

- [ ] **Step 3.1：写命令模板字段 + skipEnv 测试**

```js
// tests/unit/cli-commands-preview.test.js
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn(),
}));
jest.mock('../../src/cli/utils/electron');

const { spawn } = require('child_process');
const { resolveElectron, resolveMainEntry } = require('../../src/cli/utils/electron');

const preview = require('../../src/cli/commands/preview');

beforeEach(() => {
  resolveElectron.mockReturnValue('/fake/electron');
  resolveMainEntry.mockReturnValue('/fake/app/main/index.js');
});

describe('preview 命令', () => {
  test('命令模板字段：skipEnv=true / mode=MODES.PROD / 无专属选项', () => {
    const { MODES } = require('../../src/mode');
    expect(preview.name).toBe('preview');
    expect(preview.skipEnv).toBe(true);
    expect(preview.mode).toBe(MODES.PROD);
    expect(preview.options || []).toEqual([]);
    expect(typeof preview.action).toBe('function');
  });
});
```

- [ ] **Step 3.2：跑测试确认失败**

Run: `npx jest tests/unit/cli-commands-preview.test.js`
Expected：FAIL，模块不存在。

- [ ] **Step 3.3：写实现**

```js
// src/cli/commands/preview.js
const { spawn } = require('child_process');
const { MODES } = require('../../mode');
const { resolveElectron, resolveMainEntry } = require('../utils/electron');

async function action() {
  const rootDir = process.cwd();
  const electronBin = resolveElectron(rootDir);
  const mainEntry = resolveMainEntry(rootDir);

  const child = spawn(electronBin, [mainEntry], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });

  return new Promise(() => {
    child.on('close', (code) => process.exit(code ?? 0));
  });
}

module.exports = {
  name: 'preview',
  description: '启动已构建产物（生产模式）',
  mode: MODES.PROD,
  skipEnv: true,
  options: [],
  action,
};
```

- [ ] **Step 3.4：跑测试确认通过**

Run: `npx jest tests/unit/cli-commands-preview.test.js -t "命令模板字段"`
Expected：PASS。

- [ ] **Step 3.5：补"spawn 注入 NODE_ENV=production，不注入 RENDERER_DEV_URL"测试**

```js
test('spawn 注入 NODE_ENV=production，不注入 RENDERER_DEV_URL', async () => {
  spawn.mockImplementation(() => {
    const child = {
      pid: 1,
      on: jest.fn((evt, cb) => { if (evt === 'close') setImmediate(() => cb(0)); }),
    };
    return child;
  });
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`__EXIT__:${code}`);
  });

  await expect(preview.action({
    cliOptions: {}, env: undefined, mode: 'production', command: 'preview', isDev: false, isProd: true,
  })).rejects.toThrow('__EXIT__:0');

  expect(spawn).toHaveBeenCalledWith(
    '/fake/electron',
    ['/fake/app/main/index.js'],
    expect.objectContaining({
      stdio: 'inherit',
      env: expect.objectContaining({ NODE_ENV: 'production' }),
    })
  );
  // RENDERER_DEV_URL 必须不存在（preview 不注入）
  const spawnedEnv = spawn.mock.calls[0][2].env;
  expect(spawnedEnv).not.toHaveProperty('RENDERER_DEV_URL');

  exitSpy.mockRestore();
});
```

- [ ] **Step 3.6：补"Electron close → process.exit(code)"测试**

```js
test('Electron close code=137 → process.exit(137)', async () => {
  spawn.mockImplementation(() => ({
    pid: 1,
    on: jest.fn((evt, cb) => { if (evt === 'close') setImmediate(() => cb(137)); }),
  }));
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`__EXIT__:${code}`);
  });

  await expect(preview.action({
    cliOptions: {}, env: undefined, mode: 'production', command: 'preview', isDev: false, isProd: true,
  })).rejects.toThrow('__EXIT__:137');

  exitSpy.mockRestore();
});

test('Electron close code=null → process.exit(0)', async () => {
  spawn.mockImplementation(() => ({
    pid: 1,
    on: jest.fn((evt, cb) => { if (evt === 'close') setImmediate(() => cb(null)); }),
  }));
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`__EXIT__:${code}`);
  });

  await expect(preview.action({
    cliOptions: {}, env: undefined, mode: 'production', command: 'preview', isDev: false, isProd: true,
  })).rejects.toThrow('__EXIT__:0');

  exitSpy.mockRestore();
});
```

- [ ] **Step 3.7：补"未构建场景：resolveMainEntry 抛错 → action 抛错"测试**

```js
test('未构建产物 → resolveMainEntry 抛错 → action 抛错（交 M1 runCommand 收尾）', async () => {
  resolveMainEntry.mockImplementation(() => {
    throw new Error('主进程入口不存在：/fake/app/main/index.js（请先构建...）');
  });
  await expect(preview.action({
    cliOptions: {}, env: undefined, mode: 'production', command: 'preview',
  })).rejects.toThrow(/主进程入口不存在/);

  // spawn 没被调
  expect(spawn).not.toHaveBeenCalled();
});
```

- [ ] **Step 3.8：跑全部 preview 测试**

Run: `npx jest tests/unit/cli-commands-preview.test.js`
Expected：5 passed。

- [ ] **Step 3.9：提交 Task 3**

```bash
git add src/cli/commands/preview.js tests/unit/cli-commands-preview.test.js
git commit -m "feat(M6): preview 命令 — spawn Electron 加载产物（skipEnv、不注入 dev URL）"
```

---

## Task 4：接入命令清单 + 整体回归

**Files:**
- Modify: `src/cli/commands/index.js`

- [ ] **Step 4.1：取消注释，接入 build / preview**

修改 `src/cli/commands/index.js`：
```js
module.exports = [
  require('./dev'),         // M5
  require('./build'),       // M6 ✓
  require('./preview'),     // M6 ✓
  // require('./pack'),     // M7 接入
];
```

- [ ] **Step 4.2：跑全套测试**

Run: `npm test`
Expected：M3（9）+ M4（26）+ M2（17）+ M1（16）+ M5（20）+ M6（5 runProductionBuild + 3 build + 5 preview = 13）≈ 101 个 case 全绿。

- [ ] **Step 4.3：CLI help smoke**

Run:
```bash
node -e "const { createCli } = require('./src/cli'); createCli().parse(['node','cli','--help'])"
```
Expected：help 输出含 `dev` / `build` / `preview` 三个命令；`build` 与 `preview` 无专属选项。

- [ ] **Step 4.4：提交 Task 4**

```bash
git add src/cli/commands/index.js
git commit -m "feat(M6): 注册 build / preview 命令到清单"
```

---

## Manual Integration Verification

人工执行（与 M5 类似的 sample 项目）：

1. **基线**：sample 项目已具备 M5 验证用的目录结构（`src/main` / `src/preload` / `src/renderer` / `bc.config.js` / `.env.prod` / `package.json.main = "app/main/index.js"`）
2. **build**：
   - `npx base-client build -e prod` → 输出三进程编译日志，无错误，`app/main/index.js` / `app/preload/index.js` / `app/renderer/index.html` / `app/renderer/index.js` 均存在
   - 先 `mkdir -p app/stale && touch app/stale/x` 制造残留，再跑 `build` → 残留被清空
3. **preview（紧跟 build 之后）**：
   - `npx base-client preview` → 启动 Electron 加载产物；user main 内 `loadFile(app/renderer/index.html)` 成立、窗口正常
   - 退出 Electron → preview 进程随之退出
   - **不**带 `--env`、项目里没有 `.env.prod` → preview 仍能跑（skipEnv 已生效）
4. **错误路径**：
   - 删掉 `app/main/index.js` → `preview` 报"主进程入口不存在"
   - 故意构造 build 时 renderer 编译错（如 `src/renderer/index.js` 引用不存在模块）→ build 抛错、`app/` 已被清空但产物不完整
5. **dev 后直接 preview**（spec §三 提到的"坑"）：
   - 跑 `npx base-client dev`，退出
   - 跑 `npx base-client preview` → 因 `app/main` 是 development 产物（`NODE_ENV` 焊为 development），可能白屏；按 M6 spec §三 "请先 build" 的约定，**这不是 bug**
   - 跑 `npx base-client build && npx base-client preview` → 正常

---

## Self-Review

按 spec 逐项核查：

| Spec 章节 | 要求 | 覆盖在哪 |
|-----------|------|----------|
| §一 定位 | build / preview 均不起 dev-server、不 watch | Task 1 未引入 dev-server；Task 3 未引入 dev-server / watch |
| §二 build 流程 | build 命令调 `runProductionBuild(ctx)` 编排 | Task 2 |
| §二 runProductionBuild 签名 | `runProductionBuild(ctx)` 收 ctx 整体（含 isDev/isProd），与 M2 / M7 一致 | Task 1 Step 1.3 / 1.5 / 1.7 |
| §二 runProductionBuild 步骤 | ① `fse.emptyDirSync(app)` ② `resolveBuildConfig(ctx)` ③ 启 spinner → 并行三进程 → logger 反馈 → finally stop | Task 1 Step 1.3 |
| §二 command 透传 | ctx.command 透传；build 传 `'build'`、pack 传 `'pack'` | Task 1 Step 1.7 |
| §二 输出清理 | 整体清空 app/（`fse.emptyDirSync`，目录不存在也安全） | Task 1 Step 1.6 |
| §二 dev 不参与清理 | dev plan 也未调 runProductionBuild ✓ | M5 plan 验证 |
| §二 失败处理 | `logger.compileFailure` + `console.error(stats.toString({colors:true}))` + reject → 交 M1 收尾 | Task 1 Step 1.5 |
| §二 命令选项 | 无 | Task 2 命令模板 `options: []` |
| §三 preview 流程 | spawn Electron + NODE_ENV=production，不注 dev URL | Task 3 Step 3.5 |
| §三 契约 | preview 在 build 之后；未构建 resolveMainEntry 抛错 | M5 resolveMainEntry 已实现校验 |
| §三 preview 不读 bc.config | skipEnv: true + 实现内不调 resolveBuildConfig | Task 3 命令模板 + 实现仅 require electron 工具 |
| §三 SIGINT 退出 | stdio:inherit 让 Ctrl+C 经进程组传给 Electron；preview 不引入 killElectron | Task 3 实现内 child 不在 SIGINT 监听内 |
| §三 命令选项 | 无 | Task 3 命令模板 `options: []` |
| §四 产物目录约定 | app/ 是纯产物目录 | Task 1 实现内只清空 app/，没动 src/ |
| §五 共享工具 | resolveElectron + resolveMainEntry（preview 用，build 不用） | Task 3 require；Task 2 不 require |
| §五 killElectron | preview 不用 ✓ | Task 3 实现内未 require killElectron |
| §六 模块边界 | M6 不实现 merge / 预设 / env 读取 / 安装包构建 | Task 1/2/3 实现仅 require config / mode / logger / format / compile-spinner / electron 工具 / fse / webpack / child_process |
| §七 文件结构 | `commands/build.js` + `commands/preview.js` + `utils/production-build.js` | Task 1/2/3 |
| M1 §九 mode 抽象 | build / preview 命令模板 `mode: MODES.PROD` | Task 2 / Task 3 命令模板 |
| M1 §十 logger 契约 + M5 §十 spinner | runProductionBuild 启 spinner + 逐进程 logger.compileSuccess/Failure/Warning | Task 1 Step 1.3 / 1.8（断言 logger / spinner 被调） |

**Placeholder 扫描**：无 TBD / TODO。

**类型一致性**：
- `runProductionBuild(ctx) → Promise<void>`：Task 1 定义、build action 透传、M7 plan pack action 也按此签名调用 —— 一致
- build action 入参 `ctx = { cliOptions, env, mode, command, isDev, isProd }`，与 M1 runCommand 派发的 ctx 形态一致
- preview action 实际不用 ctx（skipEnv 让 env=undefined），但参数签名仍是 `(ctx)`，符合 M1 命令模板规范

**模块边界**：
- runProductionBuild `require` 的外部模块：`fs-extra` / `path` / `webpack` / `../../config`（M2 `resolveBuildConfig`）/ `../../logger`（横切：logger 反馈）/ `./format`（横切：`extractStatsSummary`）/ `./compile-spinner`（横切：spinner）
- build.js `require`：`../../mode`（横切：`MODES` 常量）/ `../utils/production-build`
- preview.js `require`：`child_process.spawn` / `../../mode`（横切：`MODES` 常量）/ `../utils/electron`
- **没有** `require` `webpack-dev-server`（生产侧不需要）、`electron-builder`（M7 才用）

---

## 验收

完成本 plan 后：
- `npm test` 全绿（≥ 101 个 case）
- `createCli().parse(['node','cli','--help'])` 列出 `dev` / `build` / `preview`
- `runProductionBuild` 已抽出为独立模块，等待 M7 pack plan 直接 require
- Manual Integration Verification 全部通过
- 生产侧（build + preview）链路打通，可在 sample 项目里 `build → preview` 跑通整轮发布预览
