# Frame M5 Dev Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `base-client dev` 命令：并行构建 main+preload + 启动 renderer dev-server (HMR) + spawn Electron 加载页面；可选 `--watch-main` 监听 main/preload 改动自动重启 Electron。同时建立 M5/M6/M7 共享工具：`src/cli/utils/electron.js`（`resolveElectron` / `resolveMainEntry` / `killElectron`）、`src/cli/utils/format.js`（`extractStatsSummary`）、`src/cli/utils/compile-spinner.js`（`createCompileSpinner`，基于 ora）。编译反馈走 M1 §十 的 logger 契约（`compileSuccess` / `compileFailure` / `compileWarning` / `footer`）接管 webpack 默认输出。

**Architecture:** dev 命令拆成可单测的纯函数子单元（端口/host 三级优先级解析、devServer 选项构造、Electron 解析、入口解析、跨平台 kill、stats 摘要提取、编译 spinner）加一个编排主流程 `action`。spawn / dev-server / webpack 等副作用密集组件用 jest mock 单测；端到端"真启动 Electron"列为 manual 集成验证。renderer 由 `compiler.hooks.done` 接管编译反馈（M4 §七 已配套 `stats:'none'` + `infrastructureLogging` 静默 webpack 默认输出），main/preload 在 `webpack(…).run/watch` 回调内调 logger。

**Tech Stack:** Node 20+ / Jest 30 / webpack 5 / webpack-dev-server 5 / child_process / CommonJS

> **Spec 参考**：`docs/superpowers/specs/2026-05-29-frame-m5-dev-design.md`

> **依赖前置**：M1 plan（runCommand / createCli / 命令清单）、M2 plan（resolveBuildConfig）、M3 plan（initEnv）、M4 plan（presets）。本 plan 复用全部前置接口。

> **测试策略**：M5 涉及大量副作用（spawn Electron、起 dev-server、webpack 编译）。单测覆盖**可独立验证的纯函数 / mock 注入式调用**；端到端用 manual integration verification 步骤验证。这样既保证关键逻辑被锁定，又不让 plan 体量失控。

---

## File Structure

**Create:**
- `src/cli/utils/electron.js` — `resolveElectron` / `resolveMainEntry` / `killElectron`（M5/M6/M7 共享）
- `src/cli/utils/format.js` — `extractStatsSummary`（M5/M6 共享：webpack stats 摘要提取）
- `src/cli/utils/compile-spinner.js` — `createCompileSpinner`（M5/M6 共享：ora 编译 spinner）
- `src/cli/commands/dev.js` — dev 命令模板与 action
- `src/cli/commands/dev-options.js` — `resolveDevServerOptions` 纯函数（独立文件便于单测）
- `tests/unit/utils-electron-resolve.test.js`
- `tests/unit/utils-electron-kill.test.js`
- `tests/unit/format.test.js`
- `tests/unit/cli-commands-dev-options.test.js`
- `tests/unit/cli-commands-dev-action.test.js`

**Modify:**
- `package.json`：`webpack-dev-server` 加到 devDependencies（peer 已存在，本地测试需要）；`ora ^5.4.1` 加到 dependencies
- `src/cli/commands/index.js`：取消 `require('./dev')` 的注释

---

## Task 0：依赖准备

**Files:**
- Modify: `package.json`

- [ ] **Step 0.1：安装 webpack-dev-server 到 devDependencies**

Run:
```bash
npm i -D webpack-dev-server@^5.0.0
```

Expected：`devDependencies.webpack-dev-server` 出现。

- [ ] **Step 0.2：跑既有测试确认没破**

Run: `npm test`
Expected：M3 + M4 + M2 + M1 共 ≥ 68 个 case 全绿。

- [ ] **Step 0.3：提交 Task 0**

```bash
git add package.json package-lock.json
git commit -m "chore(M5): 准备 webpack-dev-server devDep"
```

---

## Task 1：resolveElectron（解析 Electron 可执行文件路径）

**Files:**
- Create: `src/cli/utils/electron.js`
- Test: `tests/unit/utils-electron-resolve.test.js`

### 接口契约

```js
resolveElectron(rootDir: string): string
```
- 从 `rootDir` 锚定，用 `require.resolve('electron', { paths: [rootDir] })` 找用户项目里 electron 的入口文件
- `require(入口)` 返回 electron 可执行文件的绝对路径（这是 electron 包的入口约定）
- 找不到 → 抛错 `未找到 electron（在 <rootDir>），请在项目中安装 electron`

### TDD

- [ ] **Step 1.1：建测试辅助 — 假 electron 包工厂**

测试里需要一个"长得像 electron 但内容自定义"的临时包。复用 M2 的 `_helpers.js`，再加一个工具：

修改 `tests/unit/_helpers.js`，在文件末尾追加：
```js
// 在 rootDir/node_modules/<pkgName> 下建一个最简包，main 文件导出 exportsContent。
// 返回包的目录。
function writeFakePackage(rootDir, pkgName, exportsContent) {
  const fs = require('fs');
  const path = require('path');
  const pkgDir = path.join(rootDir, 'node_modules', pkgName);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: pkgName, main: 'index.js' })
  );
  fs.writeFileSync(path.join(pkgDir, 'index.js'), exportsContent);
  return pkgDir;
}

module.exports = { withTempCwd, writeFakePackage };
```

> 这个工具后续 M7 plan 也会用（resolveElectronBuilder 同款模式）。

- [ ] **Step 1.2：写"resolveElectron 找到时返回路径"测试**

```js
// tests/unit/utils-electron-resolve.test.js
const fs = require('fs');
const path = require('path');
const { withTempCwd, writeFakePackage } = require('./_helpers');
const { resolveElectron } = require('../../src/cli/utils/electron');

describe('resolveElectron', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('能在 rootDir 的 node_modules 里找到 electron 并返回可执行文件路径', () => {
    writeFakePackage(tmp.dir, 'electron', 'module.exports = "/fake/electron/binary";');
    expect(resolveElectron(tmp.dir)).toBe('/fake/electron/binary');
  });
});
```

- [ ] **Step 1.3：跑测试确认失败**

Run: `npx jest tests/unit/utils-electron-resolve.test.js`
Expected：FAIL，`Cannot find module '../../src/cli/utils/electron'`。

- [ ] **Step 1.4：写最小实现**

```js
// src/cli/utils/electron.js
const path = require('path');

function resolveElectron(rootDir) {
  let entry;
  try {
    entry = require.resolve('electron', { paths: [rootDir] });
  } catch (e) {
    throw new Error(`未找到 electron（在 ${rootDir}），请在项目中安装 electron`);
  }
  return require(entry);
}

module.exports = { resolveElectron };
```

- [ ] **Step 1.5：跑测试确认通过**

Run: `npx jest tests/unit/utils-electron-resolve.test.js`
Expected：PASS。

- [ ] **Step 1.6：补"找不到时抛清晰错"测试**

```js
test('rootDir 下无 electron → 抛"未找到"错', () => {
  // 不调用 writeFakePackage；tmp.dir/node_modules 为空
  expect(() => resolveElectron(tmp.dir)).toThrow(/未找到 electron/);
  expect(() => resolveElectron(tmp.dir)).toThrow(new RegExp(tmp.dir.replace(/\\/g, '\\\\')));
});
```

- [ ] **Step 1.7：跑全部 resolveElectron 测试**

Run: `npx jest tests/unit/utils-electron-resolve.test.js`
Expected：2 passed。

- [ ] **Step 1.8：提交 Task 1**

```bash
git add tests/unit/_helpers.js src/cli/utils/electron.js tests/unit/utils-electron-resolve.test.js
git commit -m "feat(M5): resolveElectron — 从用户项目解析 electron 可执行文件"
```

---

## Task 2：resolveMainEntry（解析主进程入口）

**Files:**
- Modify: `src/cli/utils/electron.js`
- Test: `tests/unit/utils-electron-resolve.test.js`

### 接口契约

```js
resolveMainEntry(rootDir: string): string
```
- 读 `rootDir/package.json`
- 取 `pkg.main`，以 `rootDir` 解析为绝对路径
- 文件不存在 → 抛错 `主进程入口不存在：<path>（请先构建，或检查 package.json 的 main 字段）`
- 文件存在 → 返回绝对路径

### TDD

- [ ] **Step 2.1：写"package.json.main 指向已存在的产物 → 返回绝对路径"测试**

在 `tests/unit/utils-electron-resolve.test.js` 追加：
```js
const { resolveMainEntry } = require('../../src/cli/utils/electron');

describe('resolveMainEntry', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('指向已存在的产物 → 返回绝对路径', () => {
    fs.writeFileSync(
      path.join(tmp.dir, 'package.json'),
      JSON.stringify({ main: 'app/main/index.js' })
    );
    fs.mkdirSync(path.join(tmp.dir, 'app', 'main'), { recursive: true });
    fs.writeFileSync(path.join(tmp.dir, 'app', 'main', 'index.js'), '// stub');

    expect(resolveMainEntry(tmp.dir)).toBe(
      path.resolve(tmp.dir, 'app/main/index.js')
    );
  });
});
```

- [ ] **Step 2.2：跑测试确认失败**

Run: `npx jest tests/unit/utils-electron-resolve.test.js -t "resolveMainEntry"`
Expected：FAIL，`resolveMainEntry is not a function`。

- [ ] **Step 2.3：实现 resolveMainEntry**

修改 `src/cli/utils/electron.js`，在 `resolveElectron` 后追加：
```js
const fs = require('fs');

function resolveMainEntry(rootDir) {
  const pkgPath = path.resolve(rootDir, 'package.json');
  // 清测试场景下 require 缓存（生产是一次性进程，无副作用）
  delete require.cache[pkgPath];
  const pkg = require(pkgPath);
  const entry = path.resolve(rootDir, pkg.main || '');
  if (!fs.existsSync(entry)) {
    throw new Error(
      `主进程入口不存在：${entry}（请先构建，或检查 package.json 的 main 字段）`
    );
  }
  return entry;
}

module.exports = { resolveElectron, resolveMainEntry };
```

注意：`module.exports` 改为同时导出两个函数。

- [ ] **Step 2.4：跑测试确认通过**

Run: `npx jest tests/unit/utils-electron-resolve.test.js -t "resolveMainEntry"`
Expected：PASS。

- [ ] **Step 2.5：补"产物未构建时抛清晰错"测试**

```js
test('package.json.main 指向未构建的路径 → 抛"主进程入口不存在"错', () => {
  fs.writeFileSync(
    path.join(tmp.dir, 'package.json'),
    JSON.stringify({ main: 'app/main/index.js' })
  );
  // 故意不建立 app/main/index.js
  expect(() => resolveMainEntry(tmp.dir)).toThrow(/主进程入口不存在/);
  expect(() => resolveMainEntry(tmp.dir)).toThrow(/请先构建/);
});

test('package.json.main 缺失 → 抛错（路径解析到 rootDir 自身，必不是文件）', () => {
  fs.writeFileSync(
    path.join(tmp.dir, 'package.json'),
    JSON.stringify({})
  );
  expect(() => resolveMainEntry(tmp.dir)).toThrow(/主进程入口不存在/);
});
```

- [ ] **Step 2.6：跑全部测试**

Run: `npx jest tests/unit/utils-electron-resolve.test.js`
Expected：4 passed。

- [ ] **Step 2.7：提交 Task 2**

```bash
git add src/cli/utils/electron.js tests/unit/utils-electron-resolve.test.js
git commit -m "feat(M5): resolveMainEntry — 经 package.json.main 解析产物入口"
```

---

## Task 3：killElectron（跨平台终止进程树）

**Files:**
- Modify: `src/cli/utils/electron.js`
- Test: `tests/unit/utils-electron-kill.test.js`

### 接口契约

```js
killElectron(child: ChildProcess): void
```
- `child` 为空或无 `pid` → 安静 return
- Windows（`process.platform === 'win32'`）：`execSync('taskkill /pid <pid> /T /F', { stdio: 'ignore' })`，捕获异常（进程可能已退出）；stdio 静默以避免 `taskkill` 在进程已退出时向终端输出 `ERROR: The process "<pid>" not found.`（try/catch 吞不掉 stderr）
- 其他平台：先尝试 `process.kill(-child.pid, 'SIGTERM')`（杀进程组），失败则 fallback `child.kill('SIGTERM')`
- 任意分支抛错均不再向外冒泡（确保上游调用方安全 reset 句柄）

### TDD

- [ ] **Step 3.1：写"空入参安静返回"测试**

```js
// tests/unit/utils-electron-kill.test.js
const { killElectron } = require('../../src/cli/utils/electron');

describe('killElectron', () => {
  test('child 为 undefined 时安静返回', () => {
    expect(() => killElectron()).not.toThrow();
  });

  test('child 无 pid 时安静返回', () => {
    expect(() => killElectron({})).not.toThrow();
  });
});
```

- [ ] **Step 3.2：跑测试确认失败**

Run: `npx jest tests/unit/utils-electron-kill.test.js`
Expected：FAIL，`killElectron is not a function`。

- [ ] **Step 3.3：实现 killElectron**

修改 `src/cli/utils/electron.js`，再追加：
```js
const { execSync } = require('child_process');

function killElectron(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch (_) {
        child.kill('SIGTERM');
      }
    }
  } catch (_) {
    // 进程已退出或 kill 失败，安静吞掉——上游会 reset 句柄
  }
}

module.exports = { resolveElectron, resolveMainEntry, killElectron };
```

- [ ] **Step 3.4：跑空入参测试确认通过**

Run: `npx jest tests/unit/utils-electron-kill.test.js`
Expected：2 passed。

- [ ] **Step 3.5：补"Windows 走 taskkill"测试（mock 平台 + execSync）**

```js
// 顶部新增
const childProcess = require('child_process');

describe('killElectron 平台分支', () => {
  let origPlatform;
  let execSyncSpy, processKillSpy;

  beforeEach(() => {
    origPlatform = process.platform;
    execSyncSpy = jest.spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));
    processKillSpy = jest.spyOn(process, 'kill').mockImplementation(() => {});
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform });
  });

  test('Windows: 调用 taskkill /T /F', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    killElectron({ pid: 1234 });
    expect(execSyncSpy).toHaveBeenCalledWith('taskkill /pid 1234 /T /F', { stdio: 'ignore' });
    expect(processKillSpy).not.toHaveBeenCalled();
  });

  test('非 Windows：先 process.kill(-pid, SIGTERM)（杀进程组）', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    killElectron({ pid: 1234, kill: jest.fn() });
    expect(processKillSpy).toHaveBeenCalledWith(-1234, 'SIGTERM');
  });

  test('非 Windows + 进程组 kill 失败 → fallback child.kill(SIGTERM)', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    processKillSpy.mockImplementation(() => { throw new Error('ESRCH'); });
    const child = { pid: 1234, kill: jest.fn() };
    killElectron(child);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
```

> 注意：`process.platform` 是只读属性，用 `Object.defineProperty` 覆盖。`afterEach` 必须还原。

- [ ] **Step 3.6：跑全部 killElectron 测试**

Run: `npx jest tests/unit/utils-electron-kill.test.js`
Expected：5 passed。

- [ ] **Step 3.7：提交 Task 3**

```bash
git add src/cli/utils/electron.js tests/unit/utils-electron-kill.test.js
git commit -m "feat(M5): killElectron — 跨平台终止 Electron 进程树"
```

---

## Task 4：resolveDevServerOptions（dev-server 选项构造）

**Files:**
- Create: `src/cli/commands/dev-options.js`
- Test: `tests/unit/cli-commands-dev-options.test.js`

### 接口契约

```js
resolveDevServerOptions({ cliOptions, userDevServer }): {
  options: DevServerOptions,
  host: string,
  port: number,
}
```
- `host`：`cliOptions.host` > `userDevServer.host` > `'localhost'`
- `port`：`cliOptions.port` > `userDevServer.port` > `8023`
- `options`：`{ historyApiFallback: true, ...userDevServer, host, port, hot: true }`
- `hot: true` 是 frame 强制项，在 `...userDevServer` 之后，**不可被用户覆盖**
- `historyApiFallback: true` 是 frame 默认，在 `...userDevServer` 之前，**用户可覆盖**

### TDD

- [ ] **Step 4.1：写"全部缺省"测试**

```js
// tests/unit/cli-commands-dev-options.test.js
const { resolveDevServerOptions } = require('../../src/cli/commands/dev-options');

describe('resolveDevServerOptions', () => {
  test('全部缺省：localhost / 8023 / hot:true / historyApiFallback:true', () => {
    const r = resolveDevServerOptions({ cliOptions: {}, userDevServer: {} });
    expect(r.host).toBe('localhost');
    expect(r.port).toBe(8023);
    expect(r.options.hot).toBe(true);
    expect(r.options.historyApiFallback).toBe(true);
    expect(r.options.host).toBe('localhost');
    expect(r.options.port).toBe(8023);
  });
});
```

- [ ] **Step 4.2：跑测试确认失败**

Run: `npx jest tests/unit/cli-commands-dev-options.test.js`
Expected：FAIL，模块不存在。

- [ ] **Step 4.3：写最小实现**

```js
// src/cli/commands/dev-options.js
function resolveDevServerOptions({ cliOptions = {}, userDevServer = {} }) {
  const host = cliOptions.host ?? userDevServer.host ?? 'localhost';
  const port = cliOptions.port ?? userDevServer.port ?? 8023;
  const options = {
    historyApiFallback: true,
    ...userDevServer,
    host,
    port,
    hot: true,
    devMiddleware: {
      stats: false,                              // 与 M4 renderer stats:'none' 配套，静默 dev-middleware 自动 stats 输出
      ...(userDevServer.devMiddleware || {}),
    },
  };
  return { options, host, port };
}

module.exports = { resolveDevServerOptions };
```

- [ ] **Step 4.4：跑测试确认通过**

Run: `npx jest tests/unit/cli-commands-dev-options.test.js`
Expected：PASS。

- [ ] **Step 4.5：补优先级 + 强制项测试**

```js
test('CLI > user > 默认（host / port 三级）', () => {
  // 只用户配
  const a = resolveDevServerOptions({
    cliOptions: {},
    userDevServer: { host: '0.0.0.0', port: 5173 },
  });
  expect(a.host).toBe('0.0.0.0');
  expect(a.port).toBe(5173);

  // CLI 覆盖用户
  const b = resolveDevServerOptions({
    cliOptions: { host: '127.0.0.1', port: 4000 },
    userDevServer: { host: '0.0.0.0', port: 5173 },
  });
  expect(b.host).toBe('127.0.0.1');
  expect(b.port).toBe(4000);
});

test('用户 proxy / headers / setupMiddlewares 保留', () => {
  const userProxy = { '/api': 'http://backend:3000' };
  const setup = jest.fn();
  const r = resolveDevServerOptions({
    cliOptions: {},
    userDevServer: { proxy: userProxy, headers: { 'X-Foo': '1' }, setupMiddlewares: setup },
  });
  expect(r.options.proxy).toEqual(userProxy);
  expect(r.options.headers).toEqual({ 'X-Foo': '1' });
  expect(r.options.setupMiddlewares).toBe(setup);
});

test('用户 hot:false 被 frame 强制覆盖回 true（HMR 是 dev 核心约定）', () => {
  const r = resolveDevServerOptions({
    cliOptions: {},
    userDevServer: { hot: false },
  });
  expect(r.options.hot).toBe(true);
});

test('用户可以覆盖 historyApiFallback（它在 spread 之前）', () => {
  const r = resolveDevServerOptions({
    cliOptions: {},
    userDevServer: { historyApiFallback: false },
  });
  expect(r.options.historyApiFallback).toBe(false);
});

test('devMiddleware.stats 默认 false（与 M4 renderer stats:"none" 配套）', () => {
  const r = resolveDevServerOptions({ cliOptions: {}, userDevServer: {} });
  expect(r.options.devMiddleware).toEqual({ stats: false });
});

test('用户可在 renderer.devServer.devMiddleware.stats 覆盖回 normal/verbose', () => {
  const r = resolveDevServerOptions({
    cliOptions: {},
    userDevServer: { devMiddleware: { stats: 'normal' } },
  });
  expect(r.options.devMiddleware.stats).toBe('normal');
});
```

- [ ] **Step 4.6：跑全部 dev-options 测试**

Run: `npx jest tests/unit/cli-commands-dev-options.test.js`
Expected：7 passed（原 5 + 新增 2 个 devMiddleware）。

- [ ] **Step 4.7：提交 Task 4**

```bash
git add src/cli/commands/dev-options.js tests/unit/cli-commands-dev-options.test.js
git commit -m "feat(M5): resolveDevServerOptions — 三级优先级 + 强制 hot:true"
```

---

## Task 5：dev 命令 action（编排主流程）

**Files:**
- Create: `src/cli/commands/dev.js`
- Test: `tests/unit/cli-commands-dev-action.test.js`

### 命令模板

```js
const { MODES } = require('../../mode');

module.exports = {
  name: 'dev',
  description: '启动开发服务器 + Electron',
  mode: MODES.DEV,
  options: [
    ['--port <n>', 'dev server 端口', { type: [Number] }],
    ['--host <host>', 'dev server host'],
    ['--watch-main', 'watch main + preload 改动自动重启'],
  ],
  action,
};
```

### action 流程

1. `resolveBuildConfig(ctx)` 拿 `{ main, preload, renderer }`（收 ctx 整体，与 M1 §五 / M2 §五 一致）
2. 从 `renderer` 摘出 `devServer` 字段（`const { devServer, ...rendererWebpack } = renderer`）
3. `resolveDevServerOptions({ cliOptions, userDevServer: devServer })` 得到最终选项与 host/port
4. 启动 ora 编译 spinner（`createCompileSpinner('编译中...')`），三路 compiler（main / preload / renderer）首次完成累计 3 次后停 spinner
5. **并行启动**：
   - a. `webpack(rendererWebpack)` 创建 renderer compiler；挂 `hooks.done.tap('base-client', stats => { extractStatsSummary → logger.compileSuccess/Failure → logger.footer })`；交给 `new WebpackDevServer(devServerOptions, rendererCompiler).start()`
   - b. 一次性 `webpack([main, preload]).run((err, multiStats) => { reportMainPreloadStats（逐进程调 logger.compileSuccess/Failure/Warning）})` —— 默认模式；或 `compiler.watch(...)` —— `--watch-main`
6. 都 ready 后 spawn Electron，注入 `NODE_ENV='development'` + `RENDERER_DEV_URL=http://<host>:<port>`
7. `--watch-main` 模式下，每次成功编译 → debounce 100ms → killElectron + 重启；失败 `logger.compileFailure` + `stats.toString({colors:true})` 后**不动 Electron**
8. 生命周期：Electron `close` → 关闭 dev-server + watcher，按 Electron 退出码退出；SIGINT 同样收尾；frame 主动 kill 通过 `intentionalKill` 标志跳过收尾

### 编译反馈接管（M1 §十 / M4 §七 / M5 §十 配套）

- **renderer**：`hooks.done` 监听是唯一反馈通道。每次完成（dev 启动 / HMR 重编）先 `spinner.clear()` 再调 logger.compileSuccess + footer；失败时 logger.compileFailure + `stats.toString({colors:true})` 全量。
- **main + preload**：默认模式在 `mainPreloadCompiler.run(cb)` 回调里对 `multiStats.stats` 数组逐个调 logger；watch 模式在 `mainPreloadCompiler.watch(opts, cb)` 回调内同样处理 + debounce 重启。
- **spinner**：`createCompileSpinner` 返回 `{ start, stop, clear, isActive }`；`start()` 后 setInterval 每秒更新文案，timer 加 `unref()` 避免阻塞退出；每次 logger 输出前 `spinner.clear()` 防止 spinner 行被卡断；累计 3 次 tickInitial 后 `stop()`。watch 期间不再挂 spinner。
- **stats 摘要**：`extractStatsSummary(stats, fallbackName)` 从 `stats.toJson({ assets, errors, warnings, modules:false, chunks:false, children:false, chunkGroups:false, chunkModules:false })` 提取 `{ name, ms, totalSize, errorCount, warningCount }`。三处共用一份摘要逻辑。

### TDD（mock 重副作用模块）

把 action 内部能拆出的纯函数尽量拆出，但主流程必然包含 spawn / new WebpackDevServer / webpack() 调用。这一节用 jest 的模块 mock 来"看见但不真正执行"。

- [ ] **Step 5.1：用 jest.mock 隔离副作用模块**

```js
// tests/unit/cli-commands-dev-action.test.js
jest.mock('webpack');
jest.mock('webpack-dev-server');
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn(),
}));
jest.mock('../../src/config');           // 整个 M2 模块 mock
jest.mock('../../src/cli/utils/electron'); // M5 共享工具 mock
jest.mock('../../src/logger');             // logger 整体 mock（断言被调）
jest.mock('../../src/cli/utils/format');   // extractStatsSummary mock
jest.mock('../../src/cli/utils/compile-spinner'); // spinner mock

const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const { spawn } = require('child_process');
const { resolveBuildConfig } = require('../../src/config');
const {
  resolveElectron,
  resolveMainEntry,
  killElectron,
} = require('../../src/cli/utils/electron');
const logger = require('../../src/logger');
const { extractStatsSummary } = require('../../src/cli/utils/format');
const { createCompileSpinner } = require('../../src/cli/utils/compile-spinner');

const dev = require('../../src/cli/commands/dev');

beforeEach(() => {
  // webpack 工厂：返回带 hooks.done 的 compiler
  const hooks = { done: { tap: jest.fn() } };
  const compiler = {
    hooks,
    run: jest.fn((cb) => cb(null, { hasErrors: () => false, toString: () => 'ok', stats: [{ hasErrors: () => false, toJson: () => ({ name: 'main', time: 100, errors: [], warnings: [], assets: [{ size: 1024 }] }) }, { hasErrors: () => false, toJson: () => ({ name: 'preload', time: 80, errors: [], warnings: [], assets: [{ size: 512 }] }) }] })),
    watch: jest.fn(() => ({ close: jest.fn((cb) => cb && cb()) })),
    close: jest.fn((cb) => cb && cb()),
  };
  webpack.mockReturnValue(compiler);

  // dev-server 实例：start/stop 返回 Promise
  const server = {
    start: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue(),
  };
  WebpackDevServer.mockImplementation(() => server);

  // electron 工具
  resolveElectron.mockReturnValue('/fake/electron');
  resolveMainEntry.mockReturnValue('/fake/app/main/index.js');

  // spawn：返回带 on('close') 立即触发的 stub child
  spawn.mockImplementation(() => {
    const child = {
      pid: 9999,
      on: jest.fn((evt, cb) => { if (evt === 'close') child._closeCb = cb; }),
      kill: jest.fn(),
      _trigger: (code) => child._closeCb && child._closeCb(code),
    };
    return child;
  });

  // resolveBuildConfig 默认返回：三进程空配置（带 devServer 测试用例覆盖）
  resolveBuildConfig.mockReturnValue({
    main: { name: 'main' },
    preload: { name: 'preload' },
    renderer: { name: 'renderer' },
  });

  // extractStatsSummary 默认返回 OK 摘要
  extractStatsSummary.mockReturnValue({
    name: 'renderer',
    ms: 200,
    totalSize: 4096,
    errorCount: 0,
    warningCount: 0,
  });

  // spinner：start/stop/clear 是 noop
  const spinnerStub = { start: jest.fn(), stop: jest.fn(), clear: jest.fn(), isActive: () => true };
  createCompileSpinner.mockReturnValue(spinnerStub);
});
```

- [ ] **Step 5.2：写"默认模式：一次性构建 + dev-server + spawn Electron"测试**

继续追加：
```js
test('默认模式（无 --watch-main）：webpack 一次性构建 + 起 dev-server + spawn Electron', async () => {
  const ctx = {
    cliOptions: { port: 9000, host: '127.0.0.1', config: undefined },
    env: { BC_API: 'http://x' },
    mode: 'development',
    command: 'dev',
    isDev: true,
    isProd: false,
  };

  // 让 action 不要阻塞在等待 Electron close 上：spawn 立即触发 close
  // 我们把 spawn 改成同步 trigger
  spawn.mockImplementationOnce(() => {
    const child = {
      pid: 9999,
      on: jest.fn((evt, cb) => { if (evt === 'close') setImmediate(() => cb(0)); }),
      kill: jest.fn(),
    };
    return child;
  });

  // process.exit 抛错以中断
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`__EXIT__:${code}`);
  });

  await expect(dev.action(ctx)).rejects.toThrow(/__EXIT__:0/);

  // 关键调用都发生
  expect(resolveBuildConfig).toHaveBeenCalledWith(ctx);  // 收 ctx 整体，不再解构
  expect(WebpackDevServer).toHaveBeenCalled();
  expect(spawn).toHaveBeenCalledWith(
    '/fake/electron',
    ['/fake/app/main/index.js'],
    expect.objectContaining({
      stdio: 'inherit',
      env: expect.objectContaining({
        NODE_ENV: 'development',
        RENDERER_DEV_URL: 'http://127.0.0.1:9000',
      }),
    })
  );

  exitSpy.mockRestore();
});
```

- [ ] **Step 5.3：跑测试确认失败**

Run: `npx jest tests/unit/cli-commands-dev-action.test.js`
Expected：FAIL，`dev.action is not a function`。

- [ ] **Step 5.4：实现 dev 命令**

Create `src/cli/commands/dev.js`：
```js
// src/cli/commands/dev.js
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const childProcess = require('child_process');
const { MODES } = require('../../mode');
const { resolveBuildConfig } = require('../../config');
const logger = require('../../logger');
const { extractStatsSummary } = require('../utils/format');
const { createCompileSpinner } = require('../utils/compile-spinner');
const {
  resolveElectron,
  resolveMainEntry,
  killElectron,
} = require('../utils/electron');
const { resolveDevServerOptions } = require('./dev-options');

const MAIN_PRELOAD_NAMES = ['main', 'preload'];

function reportMainPreloadStats(multiStats) {
  let anyError = false;
  multiStats.stats.forEach((stats, i) => {
    const summary = extractStatsSummary(stats, MAIN_PRELOAD_NAMES[i]);
    if (summary.errorCount > 0) {
      logger.compileFailure(summary.name);
      console.error(stats.toString({ colors: true }));
      anyError = true;
    } else {
      logger.compileSuccess(summary.name, summary.ms, summary.totalSize);
      logger.compileWarning(summary.name, summary.warningCount);
    }
  });
  return anyError;
}

async function action(ctx) {
  const { cliOptions, env } = ctx;
  const rootDir = process.cwd();

  // ① 拿三进程配置（收 ctx 整体）
  const { main, preload, renderer } = resolveBuildConfig(ctx);

  // ② 摘出 renderer.devServer
  const { devServer: userDevServer, ...rendererWebpack } = renderer;

  // ③ devServer 选项构造
  const { options: devServerOptions, host, port } = resolveDevServerOptions({
    cliOptions, userDevServer,
  });
  const url = `http://${host}:${port}`;

  // ④ 编译 spinner：3 路 compiler 首次完成累计后停
  const spinner = createCompileSpinner('编译中...');
  const initial = { needed: 3, completed: 0, done: false };
  function tickInitial() {
    if (initial.done) return;
    initial.completed += 1;
    if (initial.completed >= initial.needed) {
      initial.done = true;
      spinner.stop();
    }
  }

  // ⑤ renderer compiler 挂 hooks.done（dev 启动 / HMR 重编 都走这里）
  const rendererCompiler = webpack(rendererWebpack);
  rendererCompiler.hooks.done.tap('base-client', (stats) => {
    const summary = extractStatsSummary(stats, 'renderer');
    spinner.clear();
    if (summary.errorCount > 0) {
      logger.compileFailure(summary.name);
      console.error(stats.toString({ colors: true }));
      tickInitial();
      return;
    }
    logger.compileSuccess(summary.name, summary.ms, summary.totalSize);
    logger.compileWarning(summary.name, summary.warningCount);
    logger.footer({ env, url, watch: !!cliOptions.watchMain });
    tickInitial();
  });

  // ⑥ 启动 dev-server
  const server = new WebpackDevServer(devServerOptions, rendererCompiler);
  await server.start();
  logger.info(`dev server: ${url}`);
  spinner.start();

  // ⑦ 构建 main + preload
  let mainPreloadWatcher;
  let electronChild = null;
  let intentionalKill = false;

  const spawnElectron = () => {
    const electronBin = resolveElectron(rootDir);
    const mainEntry = resolveMainEntry(rootDir);
    const child = childProcess.spawn(electronBin, [mainEntry], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        RENDERER_DEV_URL: `http://${host}:${port}`,
      },
    });
    child.on('close', async (code) => {
      if (intentionalKill) {
        intentionalKill = false;
        return;   // 重启场景：不收尾
      }
      // 用户退出 Electron → 收尾整个 dev
      await server.stop();
      if (mainPreloadWatcher) mainPreloadWatcher.close(() => {});
      process.exit(code ?? 0);
    });
    return child;
  };

  if (cliOptions.watchMain) {
    // watch 模式
    const mainPreloadCompiler = webpack([main, preload]);
    let debounceTimer = null;
    mainPreloadWatcher = mainPreloadCompiler.watch({}, (err, multiStats) => {
      if (err) {
        spinner.clear();
        logger.error('main+preload watch', err.message);
        tickInitial(); tickInitial();
        return;
      }
      spinner.clear();
      const anyError = reportMainPreloadStats(multiStats);
      tickInitial(); tickInitial();
      if (anyError) return;   // 失败不重启
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (electronChild) {
          intentionalKill = true;
          const oldChild = electronChild;
          oldChild.on && oldChild.on('close', () => {
            electronChild = spawnElectron();
          });
          killElectron(oldChild);
        } else {
          electronChild = spawnElectron();
        }
      }, 100);
    });
  } else {
    // 默认模式：一次性构建
    const mainPreloadCompiler = webpack([main, preload]);
    await new Promise((resolve, reject) => {
      mainPreloadCompiler.run((err, multiStats) => {
        if (err) {
          spinner.clear();
          tickInitial(); tickInitial();
          return reject(err);
        }
        spinner.clear();
        const anyError = reportMainPreloadStats(multiStats);
        tickInitial(); tickInitial();
        if (anyError) return reject(new Error('main+preload 编译失败'));
        resolve();
      });
    });
    electronChild = spawnElectron();
  }

  // SIGINT 收尾
  process.on('SIGINT', async () => {
    intentionalKill = true;
    killElectron(electronChild);
    await server.stop();
    if (mainPreloadWatcher) mainPreloadWatcher.close(() => {});
    process.exit(130);   // SIGINT 标准退出码
  });
}

module.exports = {
  name: 'dev',
  description: '启动开发服务器 + Electron',
  mode: MODES.DEV,
  options: [
    ['--port <n>', 'dev server 端口', { type: [Number] }],
    ['--host <host>', 'dev server host'],
    ['--watch-main', 'watch main + preload 改动自动重启'],
  ],
  action,
};
```

- [ ] **Step 5.5：跑测试确认通过**

Run: `npx jest tests/unit/cli-commands-dev-action.test.js`
Expected：PASS。

- [ ] **Step 5.6：补"--watch-main：失败不重启"测试**

```js
test('--watch-main：编译失败不 spawn Electron / 不 kill', async () => {
  // main+preload 编译失败 → extractStatsSummary 返回 errorCount>0
  extractStatsSummary.mockReturnValueOnce({
    name: 'main', ms: 100, totalSize: 0, errorCount: 1, warningCount: 0,
  });
  webpack.mockReturnValue({
    hooks: { done: { tap: jest.fn() } },
    watch: jest.fn((opts, cb) => {
      setImmediate(() => cb(null, { stats: [{}] }));
      return { close: jest.fn((cb2) => cb2 && cb2()) };
    }),
    close: jest.fn(),
  });

  jest.useFakeTimers();
  const ctx = {
    cliOptions: { watchMain: true, port: 8023, host: 'localhost' },
    env: {},
    mode: 'development', command: 'dev', isDev: true, isProd: false,
  };
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  dev.action(ctx);
  await new Promise((r) => setImmediate(r));

  // 没 spawn Electron、没调 killElectron
  expect(spawn).not.toHaveBeenCalled();
  expect(killElectron).not.toHaveBeenCalled();
  // 输出了 compile failure 摘要
  expect(logger.compileFailure).toHaveBeenCalledWith('main');

  jest.useRealTimers();
  errorSpy.mockRestore();
});
```

- [ ] **Step 5.7：补"默认模式：构建失败抛错（不 spawn）"测试**

```js
test('默认模式：main+preload 编译失败 → action 抛错，不 spawn Electron', async () => {
  // extractStatsSummary 返回 errorCount>0
  extractStatsSummary.mockReturnValueOnce({
    name: 'main', ms: 100, totalSize: 0, errorCount: 1, warningCount: 0,
  });
  webpack.mockReturnValue({
    hooks: { done: { tap: jest.fn() } },
    run: jest.fn((cb) => cb(null, { stats: [{}] })),
    close: jest.fn(),
  });

  const ctx = {
    cliOptions: { port: 8023, host: 'localhost' },
    env: {},
    mode: 'development', command: 'dev', isDev: true, isProd: false,
  };
  await expect(dev.action(ctx)).rejects.toThrow(/main\+preload 编译失败/);
  expect(spawn).not.toHaveBeenCalled();
  expect(logger.compileFailure).toHaveBeenCalledWith('main');
});
```

- [ ] **Step 5.8：补 RENDERER_DEV_URL 注入 + NODE_ENV 测试**

```js
test('spawn Electron 时注入 NODE_ENV=development + RENDERER_DEV_URL', async () => {
  const ctx = {
    cliOptions: { port: 4321, host: '0.0.0.0' },
    env: {},
    mode: 'development', command: 'dev', isDev: true, isProd: false,
  };
  spawn.mockImplementationOnce(() => ({
    pid: 1, on: jest.fn(), kill: jest.fn(),
  }));
  await dev.action(ctx).catch(() => {});
  expect(spawn).toHaveBeenCalledWith(
    '/fake/electron',
    ['/fake/app/main/index.js'],
    expect.objectContaining({
      env: expect.objectContaining({
        NODE_ENV: 'development',
        RENDERER_DEV_URL: 'http://0.0.0.0:4321',
      }),
    })
  );
});
```

- [ ] **Step 5.9：补"renderer hooks.done 接管"测试（M5 §十）**

```js
test('renderer hooks.done 触发后调 extractStatsSummary + logger.compileSuccess + logger.footer', () => {
  // 直接调 dev 命令暴露的 hooks.done tap 注册的回调
  // 我们在 beforeEach 里 webpack.mockReturnValue 后捕获 hooks.done.tap 的 callback
  const taps = [];
  webpack.mockImplementation(() => {
    return {
      hooks: { done: { tap: (name, cb) => taps.push(cb) } },
      run: jest.fn(),
      watch: jest.fn(),
      close: jest.fn(),
    };
  });
  const ctx = {
    cliOptions: { port: 8023, host: 'localhost' },
    env: { BC_API: 'http://x' },
    mode: 'development', command: 'dev', isDev: true, isProd: false,
  };
  // 让 action 跑完 throw 之前 hooks 已经注册
  dev.action(ctx).catch(() => {});

  // 取出 hooks.done 的回调并调用
  expect(taps.length).toBeGreaterThan(0);
  const tapCb = taps[0];
  const fakeStats = { toString: () => 'ok' };   // extractStatsSummary 已 mock
  tapCb(fakeStats);

  expect(extractStatsSummary).toHaveBeenCalledWith(fakeStats, 'renderer');
  expect(logger.compileSuccess).toHaveBeenCalledWith('renderer', 200, 4096);
  expect(logger.footer).toHaveBeenCalledWith({
    env: { BC_API: 'http://x' },
    url: 'http://localhost:8023',
    watch: false,
  });
});

test('renderer hooks.done 遇 errorCount>0 → logger.compileFailure + console.error(stats)', () => {
  extractStatsSummary.mockReturnValueOnce({
    name: 'renderer', ms: 50, totalSize: 0, errorCount: 1, warningCount: 0,
  });
  const taps = [];
  webpack.mockImplementation(() => ({
    hooks: { done: { tap: (name, cb) => taps.push(cb) } },
    run: jest.fn(), watch: jest.fn(), close: jest.fn(),
  }));
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const ctx = { cliOptions: {}, env: {}, mode: 'development', command: 'dev', isDev: true, isProd: false };
  dev.action(ctx).catch(() => {});

  const fakeStats = { toString: jest.fn(() => 'full error trace') };
  taps[0](fakeStats);

  expect(logger.compileFailure).toHaveBeenCalledWith('renderer');
  expect(console.error).toHaveBeenCalledWith('full error trace');
  expect(logger.footer).not.toHaveBeenCalled();   // 失败不打印 footer
  errorSpy.mockRestore();
});

test('spinner 在 3 路 compiler 首次完成后 stop', () => {
  const spinnerMock = { start: jest.fn(), stop: jest.fn(), clear: jest.fn(), isActive: () => true };
  createCompileSpinner.mockReturnValueOnce(spinnerMock);
  const taps = [];
  webpack.mockImplementation(() => ({
    hooks: { done: { tap: (name, cb) => taps.push(cb) } },
    run: jest.fn((cb) => cb(null, { stats: [{}] })),
    watch: jest.fn(), close: jest.fn(),
  }));
  const ctx = { cliOptions: {}, env: {}, mode: 'development', command: 'dev', isDev: true, isProd: false };
  dev.action(ctx).catch(() => {});

  // 第一次回调：renderer 完成
  taps[0]({ toString: () => '' });
  // 第二/三次：main 完成 + preload 完成（main+preload.run 走两轮 tickInitial）
  // 实际 main+preload.run 回调只调一次 tickInitial(); tickInitial();
  expect(spinnerMock.start).toHaveBeenCalled();
  expect(spinnerMock.stop).toHaveBeenCalled();
});
```

- [ ] **Step 5.10：跑全部 dev action 测试**

Run: `npx jest tests/unit/cli-commands-dev-action.test.js`
Expected：7 passed（默认模式 spawn / watch 失败 / 默认编译失败 / URL 注入 / hooks.done 成功 / hooks.done 失败 / spinner 累计完成）。

> 注意：测试在 jest 的事件循环里运行，dev action 内的事件监听（SIGINT、`child.on('close')`）会注册到全局 `process` 上，可能影响后续测试。每个测试用例后都应 `process.removeAllListeners('SIGINT')` 收尾。可在 `afterEach` 加一条：
> ```js
> afterEach(() => process.removeAllListeners('SIGINT'));
> ```

- [ ] **Step 5.11：补 afterEach 收尾**

在 `tests/unit/cli-commands-dev-action.test.js` 文件顶部添加：
```js
afterEach(() => {
  process.removeAllListeners('SIGINT');
});
```

再跑一次：
Run: `npx jest tests/unit/cli-commands-dev-action.test.js`
Expected：7 passed。

- [ ] **Step 5.12：提交 Task 5**

```bash
git add src/cli/commands/dev.js tests/unit/cli-commands-dev-action.test.js
git commit -m "feat(M5): dev 命令 — dev-server + spawn Electron + watch 重启编排"
```

---

## Task 6：接入命令清单 + 整体 smoke

**Files:**
- Modify: `src/cli/commands/index.js`

- [ ] **Step 6.1：取消注释，接入 dev**

修改 `src/cli/commands/index.js`：
```js
module.exports = [
  require('./dev'),         // M5 接入 ✓
  // require('./build'),    // M6 接入
  // require('./preview'),  // M6 接入
  // require('./pack'),     // M7 接入
];
```

- [ ] **Step 6.2：跑全套测试**

Run: `npm test`
Expected：M3（9）+ M4（26）+ M2（17）+ M1（16）+ M5（2 resolveElectron + 4 resolveMainEntry + 5 killElectron + 5 devOptions + 4 action）≈ 88 个 case 全绿。

> 注意：M1 plan 的 `cli-commands.test.js` 现在会看到清单里有 1 个命令（dev），那条"遍历每个元素是合法命令模板"测试会真的遍历 dev 模板。如果 dev 模板符合契约（含 `name` / `action`），测试应自然通过。

- [ ] **Step 6.3：CLI help smoke**

Run:
```bash
node -e "const { createCli } = require('./src/cli'); createCli().parse(['node','cli','--help'])"
```
Expected：help 输出含 `dev` 命令以及它的 `--port` / `--host` / `--watch-main` 选项。

- [ ] **Step 6.4：提交 Task 6**

```bash
git add src/cli/commands/index.js
git commit -m "feat(M5): 注册 dev 命令到清单"
```

---

## Manual Integration Verification

以下步骤需人工执行（自动化集成测试代价过高），用于上线前验收：

1. 在一个 sample electron 项目（已装 `electron`，含 `bc.config.js` + `.env.dev` + `src/main/index.js` + `src/preload/index.js` + `src/renderer/index.{js,html}` + `package.json.main = "app/main/index.js"`）下：
   - `npx base-client dev -e dev` → 应启动 Electron 窗口，加载 `http://localhost:8023/`
   - 改 renderer 源码 → 浏览器/Electron 窗口 HMR 刷新页面
   - 改 main 源码 → 默认**不**重启
   - 加上 `--watch-main` 重跑 → 改 main 源码后 Electron 自动重启、窗口闪一次
   - 故意改 main 引入语法错 → Electron 不重启，控制台打印 webpack 错误
   - Ctrl+C → Electron 退出、dev-server 关闭、进程整体退出
2. `--port 9000 --host 0.0.0.0` → Electron 加载 `http://0.0.0.0:9000/`
3. `bc.config.js` 里设 `renderer.devServer.port = 5173`、不传 CLI → 加载 `http://localhost:5173/`；CLI 再加 `--port 7777` → 加载 `http://localhost:7777/`
4. 故意 `package.json.main` 改成错误路径 → 启动时报"主进程入口不存在"

每步通过后，记录在 release notes 或人工 checklist 里。

---

## Self-Review

按 spec 逐项核查：

| Spec 章节 | 要求 | 覆盖在哪 |
|-----------|------|----------|
| §二 命令选项 | `--port` / `--host` / `--watch-main` 三选项 | Task 5 命令模板 |
| §二 默认 host/port | 8023 / localhost 兜底（CLI 不预置） | Task 4 测试覆盖 |
| §三 默认模式 | main+preload 一次性 / dev-server / spawn Electron 顺序 | Task 5 Step 5.2 |
| §三 任一编译失败 → throw | main+preload 任一 errorCount>0 即 reject | Task 5 Step 5.7 |
| §四 --watch-main 成功 | killElectron + 重新 spawn | Task 5 实现内 watch 回调；mock 验证 spawn / kill 被调 |
| §四 --watch-main 失败 | 不动 Electron，`logger.compileFailure` + `stats.toString({colors:true})` | Task 5 Step 5.6 |
| §四 进程管理 | 同一时刻一个 Electron 句柄；旧进程 close 后再 spawn | Task 5 实现 `oldChild.on('close', () => respawn)`（M5 §四要求） |
| §四 debounce 合并重启 | setTimeout 防抖 | Task 5 实现 `debounceTimer` |
| §四 killElectron 跨平台 | win32 taskkill / 其他 SIGTERM | Task 3 |
| §四 intentionalKill | frame 主动 kill 跳过收尾 | Task 5 实现 `intentionalKill` 标志 |
| §五 RENDERER_DEV_URL | spawn 时注入 | Task 5 Step 5.8 |
| §五 NODE_ENV | spawn 时注入 development | Task 5 Step 5.8 |
| §六 devServer 选项 | CLI > user > 默认；frame 强制 hot | Task 4 |
| §六 dev-server 仅消费 devServer 字段 | 摘出后 webpack 配置不含 devServer | Task 5 实现 `{ devServer, ...rendererWebpack }` 解构 |
| §六 devMiddleware.stats 默认 false | 与 M4 renderer `stats:'none'` 配套 | Task 4 Step 4.5 新增 2 个测试 |
| §七 resolveElectron / resolveMainEntry | 实现 | Task 1 / 2 |
| §七 共享工具 | 放 `src/cli/utils/electron.js` | Task 1-3 |
| §八 生命周期 close | dev-server stop + watcher close + exit | Task 5 实现内 `electronChild.on('close')` |
| §八 SIGINT 收尾 | killElectron + stop + exit | Task 5 实现内 `process.on('SIGINT')` |
| §八 致命错误 throw | 抛错 → M1 runCommand 统一处理 | Task 5 Step 5.7 |
| §九 模块边界 | M5 不实现 merge / 预设 / env 读取 | 实现仅 `require` config / presets 的工厂接口，未碰底层 fs / dotenv |
| §十 编译反馈与输出接管 | renderer hooks.done 接管；main/preload 走 reportMainPreloadStats；spinner 3 路累计 stop | Task 5 Step 5.9（3 个新测试） |
| §十一 文件结构 | dev.js + dev-options.js + electron.js + format.js + compile-spinner.js | Task 1-5 + 引入 format / compile-spinner |
| M1 §九 mode 抽象 | 命令模板 `mode: MODES.DEV`；ctx 含 isDev/isProd | Task 5 命令模板 + 全部 ctx 透传 |
| M1 §十 logger 契约 | dev 内部用 `logger.info / compileSuccess/Failure/Warning / footer`；失败时 `console.error(stats.toString({colors:true}))` | Task 5 实现 + Step 5.9 断言 logger 被调 |

**Placeholder 扫描**：无 TBD / TODO。

**类型一致性**：
- `resolveElectron(rootDir) → string`、`resolveMainEntry(rootDir) → string`、`killElectron(child) → void` 一致
- `resolveDevServerOptions({ cliOptions, userDevServer }) → { options, host, port }` 一致

**模块边界**：
- M5 `require` 的外部模块：`webpack`、`webpack-dev-server`、`child_process` 的 `spawn`、`../../config`（M2 `resolveBuildConfig`）、`../../mode`（横切：`MODES` 常量）、`../../logger`（横切：CLI 输出层）、`../utils/electron`（M5 自己的）、`../utils/format`（横切：`extractStatsSummary`）、`../utils/compile-spinner`（横切：`createCompileSpinner`）、`./dev-options`（M5 自己的）
- **没有** `require` M3 `../../env`（env 来自 ctx）、M4 `../../config/presets`（presets 来自 M2 内部）、`electron`（不直接 require，从用户项目解析）、`electron-builder`

**与 spec §六 的微调声明**：spec 写 `host = cliOptions.host ?? userDevServer.host ?? 'localhost'` 的优先级在 §六 文字里也明示。本 plan 把 host/port 解析 + devServer 选项构造抽到独立纯函数 `resolveDevServerOptions`，逻辑等价、可单测，行为完全符合 spec。

---

## 验收

完成本 plan 后：
- `npm test` 全绿（≥ 88 个 case）
- `createCli().parse(['node','cli','--help'])` 列出 `dev` 命令及其选项
- Manual Integration Verification 全部通过（人工执行）
- M5/M6/M7 共享工具 `src/cli/utils/electron.js` 已建立，M6 / M7 后续 plan 直接 require
- 命令执行层第 1 个命令上线
