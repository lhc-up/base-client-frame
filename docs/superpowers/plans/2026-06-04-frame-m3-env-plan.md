# Frame M3 Env Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `src/env/index.js`，提供 `initEnv(envName)` 纯函数：合并 `.env` 与 `.env.<name>`，返回完整变量对象；不写 `process.env`；`.env.<name>` 缺失抛错。同时建立全项目的测试基线（M0）。

**Architecture:** 一个目录 `src/env/`、两个函数 `readEnvFile` 与 `initEnv`，全部 CJS。`readEnvFile` 不存在返回 `null`，由 `initEnv` 决定可选 vs 必需。`dotenv.parse` 解析、原生对象 spread 合并、不触碰 `process.env`。

**Tech Stack:** Node 20+ / Jest 30 / dotenv 17 / CommonJS

> **Spec 参考**：`docs/superpowers/specs/2026-05-28-frame-m3-env-design.md`

---

## File Structure

**Create:**
- `jest.config.js`（M0 测试基线）
- `src/env/index.js`（M3 主模块）
- `tests/unit/env.test.js`（M3 单测）

**Modify:**
- `package.json`：新增 jest devDependency；把 dotenv 从 peerDependencies 移到 dependencies；新增 `test` script

---

## Task 0：M0 工程基线（仅在本 plan 执行；后续 plan 假定已建立）

**Files:**
- Create: `jest.config.js`
- Modify: `package.json`

- [ ] **Step 0.1：安装 Jest 与 dotenv**

Run:
```bash
npm i -D jest@^30.0.0
npm i dotenv@^17.4.2          # 从 peerDependencies 迁到 dependencies
npm uninstall dotenv --save-peer 2>/dev/null || true
```

Expected：`package.json` 中 `devDependencies.jest` 出现、`dependencies.dotenv` 出现，`peerDependencies.dotenv` 不再出现。

- [ ] **Step 0.2：手动核对 package.json**

打开 `package.json`，确认 `peerDependencies` 中已无 `dotenv`，`dependencies` 含 `dotenv@^17.4.2`，`devDependencies` 含 `jest@^30.x`。若 `npm uninstall --save-peer` 未生效，手动从 `peerDependencies` 删 `dotenv` 这一行。

- [ ] **Step 0.3：写 jest.config.js**

```js
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  rootDir: '.',
  clearMocks: true,
  restoreMocks: true,
};
```

- [ ] **Step 0.4：写 package.json 的 test script**

在 `package.json` 的 `scripts` 中加入：
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 0.5：写一条空测试验证 Jest 跑通**

Create `tests/unit/_bootstrap.test.js`：
```js
test('bootstrap: jest is wired up', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 0.6：跑空测试**

Run: `npm test`
Expected：1 passed, 0 failed。

- [ ] **Step 0.7：删除 bootstrap 测试**

Run: `rm tests/unit/_bootstrap.test.js`

- [ ] **Step 0.8：M0 提交**

```bash
git add jest.config.js package.json package-lock.json
git commit -m "chore: 建立 Jest 测试基线 + dotenv 改为 dependency"
```

---

## Task 1：readEnvFile（文件读取与解析）

**Files:**
- Create: `src/env/index.js`
- Test: `tests/unit/env.test.js`

### 接口契约

```js
readEnvFile(file: string): object | null
```
- 路径以 `process.cwd()` 为根解析
- 文件不存在 → 返回 `null`（由调用方决定可选/必需）
- 文件存在 → 用 `dotenv.parse` 解析为对象、不写 `process.env`

### TDD

- [ ] **Step 1.1：写 readEnvFile 的"文件不存在返回 null"测试**

```js
// tests/unit/env.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const { readEnvFile, initEnv } = require('../../src/env');

/** 把当前 cwd 切到一个干净的临时目录，返回该路径与还原函数。 */
function withTempCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-env-'));
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

describe('readEnvFile', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('文件不存在时返回 null', () => {
    expect(readEnvFile('.env')).toBeNull();
  });
});
```

- [ ] **Step 1.2：跑测试确认失败**

Run: `npx jest tests/unit/env.test.js -t "文件不存在"`
Expected：FAIL，`Cannot find module '../../src/env'`。

- [ ] **Step 1.3：写最小实现**

```js
// src/env/index.js
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function readEnvFile(file) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return null;
  return dotenv.parse(fs.readFileSync(p));
}

module.exports = { readEnvFile };
```

- [ ] **Step 1.4：跑测试确认通过**

Run: `npx jest tests/unit/env.test.js -t "文件不存在"`
Expected：PASS。

- [ ] **Step 1.5：补"文件存在时解析为对象"测试**

在 `describe('readEnvFile', ...)` 内追加：
```js
test('文件存在时解析为对象', () => {
  fs.writeFileSync(path.join(tmp.dir, '.env'), 'FOO=bar\nBC_API=http://a\n');
  expect(readEnvFile('.env')).toEqual({ FOO: 'bar', BC_API: 'http://a' });
});

test('不污染 process.env', () => {
  fs.writeFileSync(path.join(tmp.dir, '.env'), 'FRAME_TEST_VAR=secret\n');
  delete process.env.FRAME_TEST_VAR;
  readEnvFile('.env');
  expect(process.env.FRAME_TEST_VAR).toBeUndefined();
});
```

- [ ] **Step 1.6：跑全部 readEnvFile 测试**

Run: `npx jest tests/unit/env.test.js -t "readEnvFile"`
Expected：3 passed。

- [ ] **Step 1.7：提交 Task 1**

```bash
git add src/env/index.js tests/unit/env.test.js
git commit -m "feat(M3): readEnvFile — 解析 .env 文件、不污染 process.env"
```

---

## Task 2：initEnv（合并与必需校验）

**Files:**
- Modify: `src/env/index.js`
- Modify: `tests/unit/env.test.js`

### 接口契约

```js
initEnv(envName?: string = 'prod'): object
```
- 读 `.env`（可选，缺失返回 `{}`）+ `.env.<envName>`（必需，缺失抛错 `.env.<envName> not found`）
- 合并：`.env.<name>` 覆盖 `.env`
- 不写 `process.env`

### TDD

- [ ] **Step 2.1：写"`.env.<name>` 缺失抛错"测试**

在 `tests/unit/env.test.js` 追加：
```js
describe('initEnv', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('.env.<name> 不存在时抛错', () => {
    expect(() => initEnv('prod')).toThrow(/\.env\.prod/);
  });
});
```

- [ ] **Step 2.2：跑测试确认失败**

Run: `npx jest tests/unit/env.test.js -t "initEnv"`
Expected：FAIL，`initEnv is not a function`。

- [ ] **Step 2.3：实现 initEnv 与导出**

```js
// 在 src/env/index.js 追加
function initEnv(envName = 'prod') {
  const base = readEnvFile('.env') || {};
  const specific = readEnvFile(`.env.${envName}`);
  if (specific === null) {
    throw new Error(`.env.${envName} not found in ${process.cwd()}`);
  }
  return { ...base, ...specific };
}

module.exports = { readEnvFile, initEnv };
```

- [ ] **Step 2.4：跑测试确认通过**

Run: `npx jest tests/unit/env.test.js -t "不存在时抛错"`
Expected：PASS。

- [ ] **Step 2.5：补"合并语义"测试**

继续在 `describe('initEnv', ...)` 追加：
```js
test('只有 .env.<name>，返回 specific', () => {
  fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'BC_API=https://prod\n');
  expect(initEnv('prod')).toEqual({ BC_API: 'https://prod' });
});

test('.env 与 .env.<name> 合并；specific 覆盖 base', () => {
  fs.writeFileSync(
    path.join(tmp.dir, '.env'),
    'SHARED=common\nBC_API=base\n'
  );
  fs.writeFileSync(
    path.join(tmp.dir, '.env.prod'),
    'BC_API=prod-only\nBC_VERSION=1.0\n'
  );
  expect(initEnv('prod')).toEqual({
    SHARED: 'common',
    BC_API: 'prod-only',          // specific 覆盖 base
    BC_VERSION: '1.0',
  });
});

test('默认 envName = prod', () => {
  fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'X=1\n');
  expect(initEnv()).toEqual({ X: '1' });
});

test('支持非 prod 的环境名（dev/test/custom）', () => {
  fs.writeFileSync(path.join(tmp.dir, '.env.staging'), 'X=staging\n');
  expect(initEnv('staging')).toEqual({ X: 'staging' });
});

test('initEnv 也不污染 process.env', () => {
  fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'FRAME_INIT_VAR=leaked\n');
  delete process.env.FRAME_INIT_VAR;
  initEnv('prod');
  expect(process.env.FRAME_INIT_VAR).toBeUndefined();
});
```

- [ ] **Step 2.6：跑全部 initEnv 测试**

Run: `npx jest tests/unit/env.test.js`
Expected：8 passed（3 readEnvFile + 5 initEnv），共 8 个。

- [ ] **Step 2.7：提交 Task 2**

```bash
git add src/env/index.js tests/unit/env.test.js
git commit -m "feat(M3): initEnv — 合并 .env 与 .env.<name>，缺失抛错"
```

---

## Task 3：全模块 smoke run

确认 M3 模块整体可被 `require`、API 表面与 spec 一致。

**Files:**
- Test: `tests/unit/env.test.js`

- [ ] **Step 3.1：补 API 表面测试**

在文件顶端 `describe` 之前追加：
```js
test('模块导出 readEnvFile 与 initEnv', () => {
  const mod = require('../../src/env');
  expect(typeof mod.readEnvFile).toBe('function');
  expect(typeof mod.initEnv).toBe('function');
});
```

- [ ] **Step 3.2：跑全套测试**

Run: `npm test`
Expected：9 passed（含 1 API 表面）。

- [ ] **Step 3.3：提交 Task 3**

```bash
git add tests/unit/env.test.js
git commit -m "test(M3): 补 API 表面 smoke test"
```

---

## Self-Review

按 spec 逐项核查：

| Spec 章节 | 要求 | 覆盖在哪 |
|-----------|------|----------|
| §二 文件分层 | 读 `.env` 共享、`.env.<name>` 必需，按 cwd | Task 1 + Task 2 |
| §二 文件分层 | 不读 frame 内置文件、不读 `process.env` | "不污染 process.env" 测试覆盖反向；frame 代码也没读 `process.env` |
| §三 initEnv | 纯函数：`dotenv.parse` + 手动合并 + 不写 `process.env` | Task 2 实现 + 测试 |
| §三 initEnv | 默认 `envName='prod'` | Task 2 "默认 envName" 测试 |
| §四 存在校验 | `.env.<name>` 缺失抛错 | Task 2 "不存在时抛错" 测试 |
| §四 存在校验 | `.env` 缺失跳过 | Task 2 "只有 .env.<name>" 测试 |
| §五 可见性 | M3 不实施注入（注入由 M4 做） | 本 plan 不涉及 DefinePlugin，与 spec 一致 |
| §八 模块边界 | M3 不调 webpack、不操作 process.env | 实现仅依赖 `fs/path/dotenv`，符合 |

**Placeholder 扫描**：无 TBD / TODO。

**类型一致**：`initEnv(envName?: string) → object`、`readEnvFile(file: string) → object | null`，前后任务一致。

**已知遗漏**：M3 §五 提到"注入子集 = `BC_` 前缀"的契约由 M4 实施，本 plan 不覆盖，留给 `2026-06-04-frame-m4-presets-plan.md` 的 `defineEnvPlugin` 任务。

---

## 验收

完成本 plan 后：
- `npm test` 全绿（≥ 9 个 case）
- `node -e "console.log(require('./src/env').initEnv('prod'))"` 在带 `.env.prod` 的目录里能输出对象（用临时目录验证）
- M0 工程基线（Jest）已建立，供后续 M2/M4 等 plan 直接使用
