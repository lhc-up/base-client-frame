# Frame Phase 1：Foundation + `dev:web` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 frame 的横切契约（mode / target / ctx / env / build-info / logger）、cli 派发器、web 预设、webpack 运行器，跑通 `bc-frame dev`（≡ `dev:web`）命令，在浏览器中开发 SPA。

**Architecture:** 自底向上 TDD 推进——先核心层（无依赖、可独立测试）→ 配置层（presets + 用户配置加载）→ 运行器层（webpack 编排 + spinner）→ 命令层（dev:web 编排）→ CLI 派发器。最后一个 E2E 任务以 fixture project 验证全链路。

**Tech Stack:** Node.js, CommonJS, cac（CLI 解析）, dotenv（.env 解析）, webpack 5（peer）, webpack-dev-server（peer）, webpack-merge（合并）, picocolors（上色）, ora（spinner）, fs-extra（文件操作）, jest 30（测试）

**Phase 范围**：仅 `dev:web`（默认 `dev` 即此）。后续 phase 增量加 build / dev:app / pack / installer / child。

**对应 spec 章节**：[2026-06-24-frame-design.md](../specs/2026-06-24-frame-design.md) § 1 / § 2 / § 3 / § 4 / § 5（仅 web）/ § 6（仅 getWebPreset 与共享工具）/ § 7.2 / § 12 / § 13。

---

## 文件结构（Phase 1 落地）

```
src/
├── core/
│   ├── mode.js                          # MODES + deriveMode
│   ├── target.js                        # TARGETS + deriveTarget
│   ├── logger.js                        # frame 输出唯一通道
│   ├── env.js                           # loadEnv(envName) → env 对象
│   ├── build-info.js                    # deriveBuildInfo(ctx, pkgJson) → __BC_BUILD__
│   └── ctx.js                           # buildCtx(cmd, cliOptions, env)
├── config/
│   ├── bc-config.js                     # loadUserConfig + resolveBuildConfig（web 分支）
│   └── presets/
│       ├── web.js                       # getWebPreset
│       ├── build-info-plugin.js         # buildInfoPlugin
│       └── user-env-plugin.js           # userEnvPlugin
├── webpack-runner/
│   ├── format-stats.js                  # extractStatsSummary
│   ├── compile-spinner.js               # createCompileSpinner
│   └── run-dev-server.js                # 启动 webpack-dev-server + done hook 接管反馈
├── cli/
│   ├── index.js                         # cac 注册 + runCommand 派发器
│   └── commands/
│       └── dev-web.js                   # dev:web 命令模板（dev 为 alias）
└── index.js                             # 包入口

tests/unit/
├── core/
│   ├── mode.test.js
│   ├── target.test.js
│   ├── logger.test.js
│   ├── env.test.js
│   ├── build-info.test.js
│   └── ctx.test.js
├── config/
│   ├── presets-web.test.js
│   ├── presets-build-info-plugin.test.js
│   ├── presets-user-env-plugin.test.js
│   └── bc-config.test.js
├── webpack-runner/
│   ├── format-stats.test.js
│   └── compile-spinner.test.js
└── cli/
    ├── index.test.js
    └── commands-dev-web.test.js

tests/fixtures/
├── minimal-web/                         # 最小 web 工程（含 src/renderer/index.js + bc.config.js + .env.prod + index.html）
└── README.md
```

---

## Tasks

### Task 1：归零旧 src/ 与 tests/

**Files:**
- Delete contents of: `src/`（保留目录）
- Delete contents of: `tests/unit/`（保留目录）

- [ ] **Step 1：移除 v1 源码与测试**

```bash
git rm -rf src/* tests/unit/*
```

预期输出：列出删除的旧文件。

- [ ] **Step 2：建空目录占位（git 忽略空目录，可跳过）**

可不放占位；下一步开始就会写入新文件。

- [ ] **Step 3：commit**

```bash
git commit -m "chore: 归零 v1 src/ 与 tests/unit/，准备 Phase 1 重写"
```

---

### Task 2：`src/core/mode.js` + 测试

**Files:**
- Create: `src/core/mode.js`
- Create: `tests/unit/core/mode.test.js`

- [ ] **Step 1：写测试**

`tests/unit/core/mode.test.js`：

```js
const { MODES, deriveMode } = require('../../../src/core/mode');

describe('core/mode', () => {
    test('MODES 是冻结对象，值为 development / production', () => {
        expect(MODES.DEV).toBe('development');
        expect(MODES.PROD).toBe('production');
        expect(Object.isFrozen(MODES)).toBe(true);
    });

    test('deriveMode(development) 返回 isDev=true / isProd=false', () => {
        expect(deriveMode(MODES.DEV)).toEqual({ isDev: true, isProd: false });
    });

    test('deriveMode(production) 返回 isDev=false / isProd=true', () => {
        expect(deriveMode(MODES.PROD)).toEqual({ isDev: false, isProd: true });
    });

    test('deriveMode 收到非法值 fail-fast 抛错', () => {
        expect(() => deriveMode('staging')).toThrow(/mode 必须是/);
        expect(() => deriveMode(undefined)).toThrow(/mode 必须是/);
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/core/mode.test.js
```

预期：`Cannot find module '../../../src/core/mode'`。

- [ ] **Step 3：写实现**

`src/core/mode.js`：

```js
const MODES = Object.freeze({
    DEV: 'development',
    PROD: 'production',
});

const VALID_MODES = new Set(Object.values(MODES));

function deriveMode(mode) {
    if (!VALID_MODES.has(mode)) {
        throw new Error(`[base-client] mode 必须是 ${MODES.DEV} 或 ${MODES.PROD}，收到: ${mode}`);
    }
    return { isDev: mode === MODES.DEV, isProd: mode === MODES.PROD };
}

module.exports = { MODES, deriveMode };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/core/mode.test.js
```

预期：4 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/core/mode.js tests/unit/core/mode.test.js
git commit -m "feat(core): 加 mode 抽象（MODES + deriveMode）"
```

---

### Task 3：`src/core/target.js` + 测试

**Files:**
- Create: `src/core/target.js`
- Create: `tests/unit/core/target.test.js`

- [ ] **Step 1：写测试**

`tests/unit/core/target.test.js`：

```js
const { TARGETS, deriveTarget } = require('../../../src/core/target');

describe('core/target', () => {
    test('TARGETS 是冻结对象，值为 app / web', () => {
        expect(TARGETS.APP).toBe('app');
        expect(TARGETS.WEB).toBe('web');
        expect(Object.isFrozen(TARGETS)).toBe(true);
    });

    test('deriveTarget(app) 返回 isApp=true / isWeb=false', () => {
        expect(deriveTarget(TARGETS.APP)).toEqual({ isApp: true, isWeb: false });
    });

    test('deriveTarget(web) 返回 isApp=false / isWeb=true', () => {
        expect(deriveTarget(TARGETS.WEB)).toEqual({ isApp: false, isWeb: true });
    });

    test('deriveTarget 收到非法值 fail-fast 抛错', () => {
        expect(() => deriveTarget('mobile')).toThrow(/target 必须是/);
        expect(() => deriveTarget(null)).toThrow(/target 必须是/);
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/core/target.test.js
```

预期：`Cannot find module`。

- [ ] **Step 3：写实现**

`src/core/target.js`：

```js
const TARGETS = Object.freeze({
    APP: 'app',
    WEB: 'web',
});

const VALID_TARGETS = new Set(Object.values(TARGETS));

function deriveTarget(target) {
    if (!VALID_TARGETS.has(target)) {
        throw new Error(`[base-client] target 必须是 ${TARGETS.APP} 或 ${TARGETS.WEB}，收到: ${target}`);
    }
    return { isApp: target === TARGETS.APP, isWeb: target === TARGETS.WEB };
}

module.exports = { TARGETS, deriveTarget };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/core/target.test.js
```

预期：4 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/core/target.js tests/unit/core/target.test.js
git commit -m "feat(core): 加 target 抽象（TARGETS + deriveTarget）"
```

---

### Task 4：`src/core/logger.js` + 测试

**Files:**
- Create: `src/core/logger.js`
- Create: `tests/unit/core/logger.test.js`

- [ ] **Step 1：写测试**

`tests/unit/core/logger.test.js`：

```js
const logger = require('../../../src/core/logger');

describe('core/logger', () => {
    let logSpy, errSpy;
    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    test('info 输出 [base-client] 前缀', () => {
        logger.info('hello');
        const out = logSpy.mock.calls[0][0];
        expect(out).toContain('[base-client]');
        expect(out).toContain('hello');
    });

    test('success 含 ✓', () => {
        logger.success('done');
        expect(logSpy.mock.calls[0][0]).toContain('✓');
    });

    test('warn 含 ⚠', () => {
        logger.warn('careful');
        expect(logSpy.mock.calls[0][0]).toContain('⚠');
    });

    test('error 调用 console.error，含 scope 与 msg', () => {
        logger.error('dev:web', 'boom');
        const out = errSpy.mock.calls[0].join(' ');
        expect(out).toContain('dev:web');
        expect(out).toContain('boom');
    });

    test('banner 输出含 command / target / env / mode', () => {
        logger.banner({ command: 'dev:web', target: 'web', mode: 'development', env: { BC_ENV: 'prod' } });
        const out = logSpy.mock.calls[0][0];
        expect(out).toContain('dev:web');
        expect(out).toContain('web');
        expect(out).toContain('prod');
        expect(out).toContain('development');
    });

    test('footer 输出含 url 与 target', () => {
        logger.footer({ env: { BC_ENV: 'prod' }, url: 'http://localhost:9000', target: 'web' });
        const out = logSpy.mock.calls[0][0];
        expect(out).toContain('http://localhost:9000');
        expect(out).toContain('web');
    });

    test('compileSuccess 输出 name / ms / size', () => {
        logger.compileSuccess('web', 1234, 50000);
        const out = logSpy.mock.calls[0][0];
        expect(out).toContain('✓');
        expect(out).toContain('web');
        expect(out).toMatch(/1\.2 ?s|1234 ?ms/);
    });

    test('compileFailure 输出 name 与 ✗', () => {
        logger.compileFailure('web');
        const out = logSpy.mock.calls[0][0];
        expect(out).toContain('✗');
        expect(out).toContain('web');
    });

    test('compileWarning 0 个时不输出', () => {
        logger.compileWarning('web', 0);
        expect(logSpy).not.toHaveBeenCalled();
    });

    test('compileWarning > 0 时输出 N warnings', () => {
        logger.compileWarning('web', 3);
        const out = logSpy.mock.calls[0][0];
        expect(out).toContain('3');
        expect(out).toContain('warning');
    });

    test('formatBytes 1024 → "1.0 KB"', () => {
        expect(logger.formatBytes(1024)).toMatch(/1\.0 ?KB/);
    });

    test('formatMs 1500 → "1.5 s"', () => {
        expect(logger.formatMs(1500)).toMatch(/1\.5 ?s/);
    });

    test('formatMs 500 → "500 ms"', () => {
        expect(logger.formatMs(500)).toMatch(/500 ?ms/);
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/core/logger.test.js
```

- [ ] **Step 3：写实现**

`src/core/logger.js`：

```js
const pc = require('picocolors');
const { version } = require('../../package.json');

const PREFIX = pc.cyan('[base-client]');

function info(msg) {
    console.log(`${PREFIX} ${msg}`);
}

function success(msg) {
    console.log(`${PREFIX} ${pc.green('✓')} ${msg}`);
}

function warn(msg) {
    console.log(`${PREFIX} ${pc.yellow('⚠')} ${msg}`);
}

function error(scope, msg) {
    console.error(`${pc.red('[base-client]')} ${pc.bold(scope)} ${msg}`);
}

function banner({ command, target, mode, env }) {
    const bcEnv = env?.BC_ENV ?? '?';
    console.log(`${PREFIX} v${version}  ${pc.bold(command)} | target=${target} | env=${bcEnv} | mode=${mode}`);
}

function footer({ env, url, target }) {
    const bcEnv = env?.BC_ENV ?? '?';
    console.log(`${PREFIX} env=${bcEnv} | ${pc.cyan(url)} | target=${target}`);
}

function compileSuccess(name, ms, sizeBytes) {
    console.log(`${PREFIX} ${pc.green('✓')} ${name} 编译完成 (${formatMs(ms)} | ${formatBytes(sizeBytes)})`);
}

function compileFailure(name) {
    console.log(`${PREFIX} ${pc.red('✗')} ${name} 编译失败`);
}

function compileWarning(name, count) {
    if (!count) return;
    console.log(`${PREFIX} ${pc.yellow('⚠')} ${name} ${count} warnings`);
}

function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatMs(n) {
    if (n < 1000) return `${n} ms`;
    return `${(n / 1000).toFixed(1)} s`;
}

module.exports = {
    info, success, warn, error,
    banner, footer,
    compileSuccess, compileFailure, compileWarning,
    formatBytes, formatMs,
};
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/core/logger.test.js
```

预期：13 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/core/logger.js tests/unit/core/logger.test.js
git commit -m "feat(core): 加 logger（统一 [base-client] 前缀 + banner/footer/compile* + 格式化 helper）"
```

---

### Task 5：`src/core/env.js` + 测试

**Files:**
- Create: `src/core/env.js`
- Create: `tests/unit/core/env.test.js`
- Create: `tests/fixtures/env-cases/.env`
- Create: `tests/fixtures/env-cases/.env.prod`

- [ ] **Step 1：建 fixture**

`tests/fixtures/env-cases/.env`：

```
BC_API_BASE=https://api.shared.example
SHARED_TOKEN=top-secret
```

`tests/fixtures/env-cases/.env.prod`：

```
BC_ENV=prod
BC_API_BASE=https://api.prod.example
WIN_CODE_SIGN_PWD=cert-pwd
```

- [ ] **Step 2：写测试**

`tests/unit/core/env.test.js`：

```js
const path = require('path');
const { loadEnv } = require('../../../src/core/env');

const fixtureDir = path.join(__dirname, '../../fixtures/env-cases');

describe('core/env', () => {
    test('loadEnv 合并 .env 与 .env.<name>，后者覆盖', () => {
        const env = loadEnv('prod', { cwd: fixtureDir });
        expect(env.BC_ENV).toBe('prod');
        expect(env.BC_API_BASE).toBe('https://api.prod.example');     // .env.prod 覆盖 .env
        expect(env.SHARED_TOKEN).toBe('top-secret');                   // 来自 .env
        expect(env.WIN_CODE_SIGN_PWD).toBe('cert-pwd');                // 仅 .env.prod
    });

    test('loadEnv .env 不存在时不报错，仅取 .env.<name>', () => {
        const fixtureOnly = path.join(__dirname, '../../fixtures/env-only-specific');
        // 此 fixture 由测试运行时临时创建
        const fs = require('fs');
        fs.mkdirSync(fixtureOnly, { recursive: true });
        fs.writeFileSync(path.join(fixtureOnly, '.env.dev'), 'BC_ENV=dev\n');
        try {
            const env = loadEnv('dev', { cwd: fixtureOnly });
            expect(env.BC_ENV).toBe('dev');
        } finally {
            fs.rmSync(fixtureOnly, { recursive: true, force: true });
        }
    });

    test('loadEnv .env.<name> 不存在时抛错', () => {
        expect(() => loadEnv('nope', { cwd: fixtureDir })).toThrow(/未找到 .env\.nope/);
    });

    test('loadEnv 不修改 process.env', () => {
        const before = process.env.BC_API_BASE;
        loadEnv('prod', { cwd: fixtureDir });
        expect(process.env.BC_API_BASE).toBe(before);
    });
});
```

- [ ] **Step 3：跑测试确认失败**

```bash
npx jest tests/unit/core/env.test.js
```

- [ ] **Step 4：写实现**

`src/core/env.js`：

```js
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function readEnvFile(file) {
    if (!fs.existsSync(file)) return null;
    return dotenv.parse(fs.readFileSync(file));
}

/**
 * 读 .env 与 .env.<envName> 合并，返回完整 env 对象。
 * 纯函数，不写 process.env。
 */
function loadEnv(envName, { cwd = process.cwd() } = {}) {
    const base = readEnvFile(path.join(cwd, '.env')) || {};
    const specificPath = path.join(cwd, `.env.${envName}`);
    const specific = readEnvFile(specificPath);
    if (!specific) {
        throw new Error(`[base-client] 未找到 .env.${envName}（cwd=${cwd}）`);
    }
    return { ...base, ...specific };
}

module.exports = { loadEnv };
```

- [ ] **Step 5：跑测试确认通过**

```bash
npx jest tests/unit/core/env.test.js
```

预期：4 个 test PASS。

- [ ] **Step 6：commit**

```bash
git add src/core/env.js tests/unit/core/env.test.js tests/fixtures/env-cases/
git commit -m "feat(core): 加 env 加载（合并 .env + .env.<name>，纯函数不写 process.env）"
```

---

### Task 6：`src/core/build-info.js` + 测试

**Files:**
- Create: `src/core/build-info.js`
- Create: `tests/unit/core/build-info.test.js`

- [ ] **Step 1：写测试**

`tests/unit/core/build-info.test.js`：

```js
const { deriveBuildInfo } = require('../../../src/core/build-info');

const pkgJson = { name: 'demo', productName: 'Demo App', version: '1.2.3' };
const baseCtx = (over = {}) => ({
    target: 'web',
    command: 'dev:web',
    cliOptions: {},
    env: { BC_ENV: 'prod' },
    ...over,
});

describe('core/build-info', () => {
    test('web 命令派生：app-only 字段取缺省值', () => {
        const info = deriveBuildInfo(baseCtx(), pkgJson);
        expect(info.target).toBe('web');
        expect(info.name).toBe('demo');
        expect(info.productName).toBe('Demo App');
        expect(info.version).toBe('1.2.3');
        expect(info.env).toBe('prod');
        expect(info.envName).toBeUndefined();
        expect(typeof info.buildTime).toBe('number');
        expect(info.platform).toBeUndefined();
        expect(info.arch).toBeUndefined();
        expect(info.unpack).toBe(false);
        expect(info.sign).toBe(false);
        expect(info.child).toBe(false);
        expect(info.encrypted).toBe(false);
        expect(info.encryptKey).toBeUndefined();
    });

    test('productName 缺失时回退 name', () => {
        const info = deriveBuildInfo(baseCtx(), { name: 'demo', version: '1.0.0' });
        expect(info.productName).toBe('demo');
    });

    test('envName 来自 BC_ENV_NAME', () => {
        const info = deriveBuildInfo(baseCtx({ env: { BC_ENV: 'prod', BC_ENV_NAME: '生产' } }), pkgJson);
        expect(info.envName).toBe('生产');
    });

    test('pack 命令派生：app-only 字段从 cliOptions 取', () => {
        const info = deriveBuildInfo(
            baseCtx({
                target: 'app',
                command: 'pack',
                cliOptions: { platform: 'win', arch: 'x64', unpack: true, sign: true },
            }),
            pkgJson,
        );
        expect(info.target).toBe('app');
        expect(info.platform).toBe('win');
        expect(info.arch).toBe('x64');
        expect(info.unpack).toBe(true);
        expect(info.sign).toBe(true);
        expect(info.child).toBe(false);
    });

    test('child 命令派生：child=true，platform/arch=undefined，unpack/sign=false', () => {
        const info = deriveBuildInfo(
            baseCtx({ target: 'app', command: 'child', cliOptions: {} }),
            pkgJson,
        );
        expect(info.child).toBe(true);
        expect(info.platform).toBeUndefined();
        expect(info.arch).toBeUndefined();
        expect(info.unpack).toBe(false);
        expect(info.sign).toBe(false);
    });

    test('encrypted/encryptKey 由外部传入（来自 bc.config + build/encrypt.key）', () => {
        const info = deriveBuildInfo(
            baseCtx({ target: 'app', command: 'pack' }),
            pkgJson,
            { encrypted: true, encryptKey: '0123456789abcdef0123456789abcdef' },
        );
        expect(info.encrypted).toBe(true);
        expect(info.encryptKey).toBe('0123456789abcdef0123456789abcdef');
    });

    test('encrypted=false 时 encryptKey 不出现于结果（即使被传入）', () => {
        const info = deriveBuildInfo(
            baseCtx({ target: 'app', command: 'pack' }),
            pkgJson,
            { encrypted: false, encryptKey: 'shouldBeIgnored' },
        );
        expect(info.encrypted).toBe(false);
        expect(info.encryptKey).toBeUndefined();
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/core/build-info.test.js
```

- [ ] **Step 3：写实现**

`src/core/build-info.js`：

```js
/**
 * 派生 __BC_BUILD__ 对象（14 字段）。
 *
 * @param {object} ctx - { target, command, cliOptions, env, ... }
 * @param {object} pkgJson - 用户项目 package.json
 * @param {object} cryptoState - { encrypted, encryptKey }（由 pack 流程传入；其余命令默认 {encrypted: false}）
 * @returns {object} __BC_BUILD__ 对象
 */
function deriveBuildInfo(ctx, pkgJson, cryptoState = {}) {
    const { target, command, cliOptions = {}, env = {} } = ctx;
    const { encrypted = false, encryptKey } = cryptoState;

    const isApp = target === 'app';
    const isPack = command === 'pack';
    const isChild = command === 'child';

    return {
        target,
        name: pkgJson.name,
        productName: pkgJson.productName ?? pkgJson.name,
        version: pkgJson.version,
        env: env.BC_ENV,
        envName: env.BC_ENV_NAME,
        buildTime: Date.now(),
        platform: isPack ? cliOptions.platform : undefined,
        arch: isPack ? cliOptions.arch : undefined,
        unpack: isPack ? !!cliOptions.unpack : false,
        sign: isPack ? !!cliOptions.sign : false,
        child: isChild,
        encrypted: isApp ? !!encrypted : false,
        encryptKey: (isApp && encrypted) ? encryptKey : undefined,
    };
}

module.exports = { deriveBuildInfo };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/core/build-info.test.js
```

预期：7 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/core/build-info.js tests/unit/core/build-info.test.js
git commit -m "feat(core): 加 build-info 派生器（__BC_BUILD__ 14 字段，含 encrypted/encryptKey 最小暴露面）"
```

---

### Task 7：`src/core/ctx.js` + 测试

**Files:**
- Create: `src/core/ctx.js`
- Create: `tests/unit/core/ctx.test.js`

- [ ] **Step 1：写测试**

`tests/unit/core/ctx.test.js`：

```js
const { buildCtx } = require('../../../src/core/ctx');
const { MODES } = require('../../../src/core/mode');
const { TARGETS } = require('../../../src/core/target');

const cmd = (over = {}) => ({
    name: 'dev:web',
    target: TARGETS.WEB,
    mode: MODES.DEV,
    ...over,
});

describe('core/ctx', () => {
    test('buildCtx 派生 isDev/isProd/isApp/isWeb', () => {
        const ctx = buildCtx(cmd(), { port: 9000 }, { BC_ENV: 'prod' });
        expect(ctx.command).toBe('dev:web');
        expect(ctx.target).toBe('web');
        expect(ctx.mode).toBe('development');
        expect(ctx.isDev).toBe(true);
        expect(ctx.isProd).toBe(false);
        expect(ctx.isWeb).toBe(true);
        expect(ctx.isApp).toBe(false);
        expect(ctx.cliOptions).toEqual({ port: 9000 });
        expect(ctx.env).toEqual({ BC_ENV: 'prod' });
    });

    test('buildCtx 对 app/prod 命令派生正确', () => {
        const ctx = buildCtx(cmd({ name: 'pack', target: TARGETS.APP, mode: MODES.PROD }), {}, {});
        expect(ctx.isApp).toBe(true);
        expect(ctx.isWeb).toBe(false);
        expect(ctx.isProd).toBe(true);
        expect(ctx.isDev).toBe(false);
    });

    test('buildCtx 非法 mode/target 抛错', () => {
        expect(() => buildCtx(cmd({ mode: 'staging' }), {}, {})).toThrow(/mode 必须是/);
        expect(() => buildCtx(cmd({ target: 'mobile' }), {}, {})).toThrow(/target 必须是/);
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/core/ctx.test.js
```

- [ ] **Step 3：写实现**

`src/core/ctx.js`：

```js
const { deriveMode } = require('./mode');
const { deriveTarget } = require('./target');

/**
 * 装配 ctx。所有下游函数收 ctx 整体。
 *
 * @param {object} cmd - 命令文件模块（name / target / mode / ...）
 * @param {object} cliOptions - cac 解析后的 CLI options
 * @param {object} env - .env + .env.<name> 合并对象
 */
function buildCtx(cmd, cliOptions, env) {
    return {
        command: cmd.name,
        cliOptions,
        env,
        target: cmd.target,
        mode: cmd.mode,
        ...deriveTarget(cmd.target),
        ...deriveMode(cmd.mode),
    };
}

module.exports = { buildCtx };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/core/ctx.test.js
```

预期：3 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/core/ctx.js tests/unit/core/ctx.test.js
git commit -m "feat(core): 加 ctx 装配器（一次性派生 isDev/isProd/isApp/isWeb）"
```

---

### Task 8：`src/config/presets/build-info-plugin.js` + 测试

**Files:**
- Create: `src/config/presets/build-info-plugin.js`
- Create: `tests/unit/config/presets-build-info-plugin.test.js`

- [ ] **Step 1：写测试**

`tests/unit/config/presets-build-info-plugin.test.js`：

```js
const webpack = require('webpack');
const { buildInfoPlugin } = require('../../../src/config/presets/build-info-plugin');

describe('config/presets/build-info-plugin', () => {
    test('返回 DefinePlugin 实例', () => {
        const plugin = buildInfoPlugin({ target: 'web', version: '1.0.0' });
        expect(plugin).toBeInstanceOf(webpack.DefinePlugin);
    });

    test('注入字段以 __BC_BUILD__.<key> 为 key，值为 JSON 字面量', () => {
        const plugin = buildInfoPlugin({ target: 'web', version: '1.0.0', encrypted: false });
        const defs = plugin.definitions;
        expect(defs['__BC_BUILD__.target']).toBe('"web"');
        expect(defs['__BC_BUILD__.version']).toBe('"1.0.0"');
        expect(defs['__BC_BUILD__.encrypted']).toBe('false');
    });

    test('默认不注入 encryptKey 字段', () => {
        const plugin = buildInfoPlugin({ target: 'app', encryptKey: 'secret' });
        expect(plugin.definitions['__BC_BUILD__.encryptKey']).toBeUndefined();
    });

    test('includeEncryptKey:true 时注入 encryptKey', () => {
        const plugin = buildInfoPlugin({ target: 'app', encryptKey: 'secret' }, { includeEncryptKey: true });
        expect(plugin.definitions['__BC_BUILD__.encryptKey']).toBe('"secret"');
    });

    test('undefined 字段被序列化为 undefined（webpack 行为）', () => {
        const plugin = buildInfoPlugin({ target: 'web', platform: undefined });
        // JSON.stringify(undefined) → undefined（不是字符串 "undefined"），DefinePlugin 接收 undefined 即抛错——故策略：跳过 undefined 字段
        expect(plugin.definitions['__BC_BUILD__.platform']).toBeUndefined();
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/config/presets-build-info-plugin.test.js
```

- [ ] **Step 3：写实现**

`src/config/presets/build-info-plugin.js`：

```js
const webpack = require('webpack');

/**
 * 产 DefinePlugin，将 __BC_BUILD__.<key> 替换为对应字面量。
 *
 * 设计：
 *  - 注入颗粒度按属性路径，支撑 webpack DCE（__BC_BUILD__.target === 'app' 可被静态判定）
 *  - undefined 字段跳过（DefinePlugin 不接受 undefined；省略相当于该字段在 bundle 中读到 undefined）
 *  - encryptKey 仅当 includeEncryptKey: true 时注入（最小暴露面：仅 main preset 调用）
 *
 * @param {object} buildInfo - __BC_BUILD__ 字段对象
 * @param {object} [opts]
 * @param {boolean} [opts.includeEncryptKey=false]
 */
function buildInfoPlugin(buildInfo, { includeEncryptKey = false } = {}) {
    const defs = {};
    for (const [k, v] of Object.entries(buildInfo)) {
        if (k === 'encryptKey' && !includeEncryptKey) continue;
        if (v === undefined) continue;
        defs[`__BC_BUILD__.${k}`] = JSON.stringify(v);
    }
    return new webpack.DefinePlugin(defs);
}

module.exports = { buildInfoPlugin };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/config/presets-build-info-plugin.test.js
```

预期：5 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/config/presets/build-info-plugin.js tests/unit/config/presets-build-info-plugin.test.js
git commit -m "feat(presets): 加 buildInfoPlugin（__BC_BUILD__ 逐字段字面量注入，跳过 undefined / encryptKey 受控）"
```

---

### Task 9：`src/config/presets/user-env-plugin.js` + 测试

**Files:**
- Create: `src/config/presets/user-env-plugin.js`
- Create: `tests/unit/config/presets-user-env-plugin.test.js`

- [ ] **Step 1：写测试**

`tests/unit/config/presets-user-env-plugin.test.js`：

```js
const webpack = require('webpack');
const { userEnvPlugin } = require('../../../src/config/presets/user-env-plugin');

describe('config/presets/user-env-plugin', () => {
    test('返回 DefinePlugin 实例', () => {
        const plugin = userEnvPlugin({ BC_ENV: 'prod' });
        expect(plugin).toBeInstanceOf(webpack.DefinePlugin);
    });

    test('仅注入 BC_ 前缀键，非 BC_ 跳过', () => {
        const plugin = userEnvPlugin({
            BC_ENV: 'prod',
            BC_API_BASE: 'https://api',
            WIN_CODE_SIGN_PWD: 'secret',
            HOME: '/home/user',
        });
        const defs = plugin.definitions;
        expect(defs['process.env.BC_ENV']).toBe('"prod"');
        expect(defs['process.env.BC_API_BASE']).toBe('"https://api"');
        expect(defs['process.env.WIN_CODE_SIGN_PWD']).toBeUndefined();
        expect(defs['process.env.HOME']).toBeUndefined();
    });

    test('env 为 undefined / 空对象时返回空 DefinePlugin', () => {
        const plugin = userEnvPlugin(undefined);
        expect(plugin.definitions).toEqual({});
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/config/presets-user-env-plugin.test.js
```

- [ ] **Step 3：写实现**

`src/config/presets/user-env-plugin.js`：

```js
const webpack = require('webpack');

/**
 * 产 DefinePlugin，将 process.env.BC_XXX 替换为字面量。
 * 仅注入 BC_ 前缀键；非 BC_ 键不进入应用 bundle（敏感密钥保护）。
 */
function userEnvPlugin(env) {
    const defs = {};
    for (const k of Object.keys(env || {})) {
        if (k.startsWith('BC_')) defs[`process.env.${k}`] = JSON.stringify(env[k]);
    }
    return new webpack.DefinePlugin(defs);
}

module.exports = { userEnvPlugin };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/config/presets-user-env-plugin.test.js
```

预期：3 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/config/presets/user-env-plugin.js tests/unit/config/presets-user-env-plugin.test.js
git commit -m "feat(presets): 加 userEnvPlugin（process.env.BC_* 字面量注入，非 BC_ 不进 bundle）"
```

---

### Task 10：`src/config/presets/web.js` + 测试

**Files:**
- Create: `src/config/presets/web.js`
- Create: `tests/unit/config/presets-web.test.js`

- [ ] **Step 1：写测试**

`tests/unit/config/presets-web.test.js`：

```js
const path = require('path');
const webpack = require('webpack');
const { getWebPreset } = require('../../../src/config/presets/web');

const baseCtx = (over = {}) => ({
    target: 'web',
    command: 'dev:web',
    mode: 'development',
    isDev: true, isProd: false,
    isApp: false, isWeb: true,
    cliOptions: {},
    env: { BC_ENV: 'prod' },
    ...over,
});

const pkgJson = { name: 'demo', version: '1.0.0' };
const buildInfo = { target: 'web', name: 'demo', version: '1.0.0', env: 'prod', encrypted: false };

describe('config/presets/web', () => {
    test('返回对象含 target/entry/output/publicPath/plugins/module', () => {
        const preset = getWebPreset(baseCtx(), pkgJson, buildInfo);
        expect(preset.target).toBe('web');
        expect(preset.mode).toBe('development');
        expect(preset.entry).toContain('src/renderer/index.js');
        expect(preset.output.path).toContain('dist');
        expect(preset.output.filename).toBe('index.js');
    });

    test('publicPath dev=/ prod=./', () => {
        expect(getWebPreset(baseCtx({ mode: 'development', isDev: true, isProd: false }), pkgJson, buildInfo).output.publicPath).toBe('/');
        expect(getWebPreset(baseCtx({ mode: 'production', isDev: false, isProd: true }), pkgJson, buildInfo).output.publicPath).toBe('./');
    });

    test('devtool dev=source-map prod=false', () => {
        expect(getWebPreset(baseCtx({ isDev: true, isProd: false, mode: 'development' }), pkgJson, buildInfo).devtool).toBe('source-map');
        expect(getWebPreset(baseCtx({ isDev: false, isProd: true, mode: 'production' }), pkgJson, buildInfo).devtool).toBe(false);
    });

    test('plugins 含 buildInfoPlugin 与 userEnvPlugin', () => {
        const preset = getWebPreset(baseCtx(), pkgJson, buildInfo);
        const definePlugins = preset.plugins.filter(p => p instanceof webpack.DefinePlugin);
        expect(definePlugins.length).toBe(2);
        // 至少有一个含 __BC_BUILD__.target
        const hasBuildInfo = definePlugins.some(p => '__BC_BUILD__.target' in p.definitions);
        expect(hasBuildInfo).toBe(true);
        // 至少有一个含 process.env.BC_ENV
        const hasUserEnv = definePlugins.some(p => 'process.env.BC_ENV' in p.definitions);
        expect(hasUserEnv).toBe(true);
    });

    test('module.rules 含 Asset Modules（图片/字体/媒体）', () => {
        const preset = getWebPreset(baseCtx(), pkgJson, buildInfo);
        const rules = preset.module.rules;
        const imgRule = rules.find(r => r.test.test('foo.png'));
        const fontRule = rules.find(r => r.test.test('foo.woff2'));
        expect(imgRule.type).toBe('asset/resource');
        expect(fontRule.type).toBe('asset/resource');
    });

    test('output.assetModuleFilename 走 assets/[name].[hash:8][ext][query] 模板', () => {
        const preset = getWebPreset(baseCtx(), pkgJson, buildInfo);
        expect(preset.output.assetModuleFilename).toBe('assets/[name].[hash:8][ext][query]');
    });

    test('stats 静默 + infrastructureLogging level=warn', () => {
        const preset = getWebPreset(baseCtx(), pkgJson, buildInfo);
        expect(preset.stats).toBe('none');
        expect(preset.infrastructureLogging.level).toBe('warn');
    });

    test('resolve.extensions 含 .js .mjs .cjs .json', () => {
        const preset = getWebPreset(baseCtx(), pkgJson, buildInfo);
        expect(preset.resolve.extensions).toEqual(expect.arrayContaining(['.js', '.mjs', '.cjs', '.json']));
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/config/presets-web.test.js
```

- [ ] **Step 3：写实现**

`src/config/presets/web.js`：

```js
const path = require('path');
const { buildInfoPlugin } = require('./build-info-plugin');
const { userEnvPlugin } = require('./user-env-plugin');

/**
 * 产 web target webpack 预设。
 *
 * @param {object} ctx - { mode, isDev, isProd, env, ... }
 * @param {object} pkgJson - 用户 package.json
 * @param {object} buildInfo - __BC_BUILD__ 字段对象
 */
function getWebPreset(ctx, pkgJson, buildInfo) {
    const { mode, isDev, env } = ctx;
    const rootDir = process.cwd();

    return {
        target: 'web',
        mode,
        entry: path.resolve(rootDir, 'src/renderer/index.js'),
        output: {
            path: path.resolve(rootDir, 'dist'),
            filename: 'index.js',
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
            buildInfoPlugin(buildInfo),                           // includeEncryptKey 默认 false
            userEnvPlugin(env),
        ],
        stats: 'none',
        infrastructureLogging: { level: 'warn' },
    };
}

module.exports = { getWebPreset };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/config/presets-web.test.js
```

预期：8 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/config/presets/web.js tests/unit/config/presets-web.test.js
git commit -m "feat(presets): 加 getWebPreset（web target webpack 预设：entry/output/publicPath/Asset Modules/DefinePlugin/stats 静默）"
```

---

### Task 11：`src/config/bc-config.js` + 测试（仅 web 分支）

**Files:**
- Create: `src/config/bc-config.js`
- Create: `tests/unit/config/bc-config.test.js`
- Create: `tests/fixtures/bc-config-web/bc.config.js`
- Create: `tests/fixtures/bc-config-web/.env.prod`

- [ ] **Step 1：建 fixture**

`tests/fixtures/bc-config-web/bc.config.js`：

```js
module.exports = (ctx) => ({
    web: {
        entry: 'src/renderer/index.js',
        plugins: [],
        devServer: { port: 9876 },
    },
});
```

`tests/fixtures/bc-config-web/.env.prod`：

```
BC_ENV=prod
```

- [ ] **Step 2：写测试**

`tests/unit/config/bc-config.test.js`：

```js
const path = require('path');
const { resolveBuildConfig } = require('../../../src/config/bc-config');

const fixtureDir = path.join(__dirname, '../../fixtures/bc-config-web');
const pkgJson = { name: 'demo', version: '1.0.0' };
const baseCtx = (over = {}) => ({
    command: 'dev:web',
    target: 'web',
    mode: 'development',
    isDev: true, isProd: false, isApp: false, isWeb: true,
    cliOptions: { config: path.join(fixtureDir, 'bc.config.js') },
    env: { BC_ENV: 'prod' },
    ...over,
});

describe('config/bc-config', () => {
    test('resolveBuildConfig 返回 { web } 当 target=web', () => {
        const { web } = resolveBuildConfig(baseCtx(), pkgJson, { target: 'web', encrypted: false });
        expect(web).toBeDefined();
        expect(web.target).toBe('web');
        expect(web.output.path).toContain('dist');
    });

    test('用户 web.devServer 透传至 web 配置', () => {
        const { web } = resolveBuildConfig(baseCtx(), pkgJson, { target: 'web' });
        expect(web.devServer).toEqual({ port: 9876 });
    });

    test('用户 plugins 与预设 plugins 合并（追加）', () => {
        const userPlugin = { apply: () => {} };
        const userConfigPath = path.join(__dirname, '../../fixtures/bc-config-web-with-plugin/bc.config.js');
        const fs = require('fs');
        fs.mkdirSync(path.dirname(userConfigPath), { recursive: true });
        fs.writeFileSync(userConfigPath, `module.exports = () => ({ web: { plugins: [{ apply: () => {} }] } });`);
        try {
            const { web } = resolveBuildConfig(
                baseCtx({ cliOptions: { config: userConfigPath } }),
                pkgJson,
                { target: 'web' },
            );
            // 预设有 2 个 DefinePlugin + 用户的 1 个 = 3 个
            expect(web.plugins.length).toBe(3);
        } finally {
            fs.rmSync(path.dirname(userConfigPath), { recursive: true, force: true });
        }
    });

    test('--config 路径不存在时抛错', () => {
        expect(() => resolveBuildConfig(
            baseCtx({ cliOptions: { config: '/nonexistent/bc.config.js' } }),
            pkgJson,
            { target: 'web' },
        )).toThrow(/未找到 bc\.config/);
    });

    test('--config 缺省且 cwd 无 bc.config.* 时抛错', () => {
        const emptyDir = path.join(__dirname, '../../fixtures/bc-config-empty');
        const fs = require('fs');
        fs.mkdirSync(emptyDir, { recursive: true });
        const oldCwd = process.cwd();
        try {
            process.chdir(emptyDir);
            expect(() => resolveBuildConfig(
                baseCtx({ cliOptions: {} }),
                pkgJson,
                { target: 'web' },
            )).toThrow(/未找到 bc\.config/);
        } finally {
            process.chdir(oldCwd);
            fs.rmSync(emptyDir, { recursive: true, force: true });
        }
    });
});
```

- [ ] **Step 3：跑测试确认失败**

```bash
npx jest tests/unit/config/bc-config.test.js
```

- [ ] **Step 4：写实现**

`src/config/bc-config.js`：

```js
const path = require('path');
const fs = require('fs');
const { merge: webpackMerge } = require('webpack-merge');
const { getWebPreset } = require('./presets/web');

const CONFIG_NAMES = ['bc.config.js', 'bc.config.cjs', 'bc.config.mjs'];

function locateBcConfig(cwd, explicit) {
    if (explicit) {
        if (!fs.existsSync(explicit)) {
            throw new Error(`[base-client] 未找到 bc.config（--config 指定的路径不存在）：${explicit}`);
        }
        return explicit;
    }
    for (const name of CONFIG_NAMES) {
        const p = path.join(cwd, name);
        if (fs.existsSync(p)) return p;
    }
    throw new Error(`[base-client] 未找到 bc.config.js（cwd=${cwd}）`);
}

function loadUserConfig(configPath, ctx) {
    const loaded = require(configPath);
    const fn = loaded.default ?? loaded;
    if (typeof fn !== 'function') {
        throw new Error(`[base-client] bc.config 必须导出函数 (ctx) => config，收到：${typeof fn}`);
    }
    return fn(ctx) || {};
}

/**
 * 加载 bc.config + 取对应 target 的预设 + 合并用户配置。
 *
 * @param {object} ctx - 含 cliOptions.config 等
 * @param {object} pkgJson
 * @param {object} buildInfo
 * @returns {object} - { web } 或 { main, preload, renderer }（取决于 target）
 */
function resolveBuildConfig(ctx, pkgJson, buildInfo) {
    const cwd = process.cwd();
    const configPath = locateBcConfig(cwd, ctx.cliOptions.config);
    const userConfig = loadUserConfig(configPath, ctx);

    if (ctx.target === 'web') {
        const preset = getWebPreset(ctx, pkgJson, buildInfo);
        const userWeb = userConfig.web || {};
        return { web: webpackMerge(preset, userWeb) };
    }

    // Phase 1 仅实现 web；其余 target 由后续 phase 接入
    throw new Error(`[base-client] target=${ctx.target} 暂未实现（Phase 1 仅支持 web）`);
}

module.exports = { resolveBuildConfig, locateBcConfig, loadUserConfig };
```

- [ ] **Step 5：跑测试确认通过**

```bash
npx jest tests/unit/config/bc-config.test.js
```

预期：5 个 test PASS。

- [ ] **Step 6：commit**

```bash
git add src/config/bc-config.js tests/unit/config/bc-config.test.js tests/fixtures/bc-config-web/
git commit -m "feat(config): 加 bc-config 加载与合并（web target；webpack-merge 默认追加）"
```

---

### Task 12：`src/webpack-runner/format-stats.js` + 测试

**Files:**
- Create: `src/webpack-runner/format-stats.js`
- Create: `tests/unit/webpack-runner/format-stats.test.js`

- [ ] **Step 1：写测试**

`tests/unit/webpack-runner/format-stats.test.js`：

```js
const { extractStatsSummary } = require('../../../src/webpack-runner/format-stats');

function mockStats({ name = 'web', time = 1200, assets = [], errors = [], warnings = [] } = {}) {
    return {
        toJson: () => ({ name, time, assets, errors, warnings }),
    };
}

describe('webpack-runner/format-stats', () => {
    test('提取 name/ms/totalSize/errorCount/warningCount', () => {
        const stats = mockStats({
            assets: [{ size: 1000 }, { size: 2000 }, { size: 500 }],
            errors: [{ message: 'oh no' }],
            warnings: [{ message: 'careful' }, { message: 'careful again' }],
        });
        const sum = extractStatsSummary(stats, 'fallback');
        expect(sum.name).toBe('web');
        expect(sum.ms).toBe(1200);
        expect(sum.totalSize).toBe(3500);
        expect(sum.errorCount).toBe(1);
        expect(sum.warningCount).toBe(2);
    });

    test('name 缺失时用 fallbackName', () => {
        const stats = { toJson: () => ({ time: 100, assets: [] }) };
        const sum = extractStatsSummary(stats, 'fallback-name');
        expect(sum.name).toBe('fallback-name');
    });

    test('assets/errors/warnings 缺失时归零', () => {
        const stats = { toJson: () => ({ name: 'web', time: 100 }) };
        const sum = extractStatsSummary(stats, 'web');
        expect(sum.totalSize).toBe(0);
        expect(sum.errorCount).toBe(0);
        expect(sum.warningCount).toBe(0);
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/webpack-runner/format-stats.test.js
```

- [ ] **Step 3：写实现**

`src/webpack-runner/format-stats.js`：

```js
/**
 * 提取 webpack Stats 的摘要字段。
 * @param {webpack.Stats} stats
 * @param {string} fallbackName
 */
function extractStatsSummary(stats, fallbackName) {
    const j = stats.toJson({
        assets: true,
        errors: true,
        warnings: true,
        modules: false,
        chunks: false,
        children: false,
    });
    const assets = j.assets || [];
    const errors = j.errors || [];
    const warnings = j.warnings || [];
    return {
        name: j.name || fallbackName,
        ms: j.time || 0,
        totalSize: assets.reduce((s, a) => s + (a.size || 0), 0),
        errorCount: errors.length,
        warningCount: warnings.length,
    };
}

module.exports = { extractStatsSummary };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/webpack-runner/format-stats.test.js
```

预期：3 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/webpack-runner/format-stats.js tests/unit/webpack-runner/format-stats.test.js
git commit -m "feat(webpack-runner): 加 extractStatsSummary（webpack Stats → 摘要纯函数）"
```

---

### Task 13：`src/webpack-runner/compile-spinner.js` + 测试

**Files:**
- Create: `src/webpack-runner/compile-spinner.js`
- Create: `tests/unit/webpack-runner/compile-spinner.test.js`

- [ ] **Step 1：写测试**

`tests/unit/webpack-runner/compile-spinner.test.js`：

```js
const { createCompileSpinner } = require('../../../src/webpack-runner/compile-spinner');

describe('webpack-runner/compile-spinner', () => {
    test('createCompileSpinner 返回有 start/stop/clear/tickInitial 的对象', () => {
        const sp = createCompileSpinner('编译中...');
        expect(typeof sp.start).toBe('function');
        expect(typeof sp.stop).toBe('function');
        expect(typeof sp.clear).toBe('function');
        expect(typeof sp.tickInitial).toBe('function');
    });

    test('start / stop 不抛错', () => {
        const sp = createCompileSpinner('编译中...');
        sp.start();
        sp.stop();
    });

    test('tickInitial 累计达到 expectedCount 后自动 stop', () => {
        const sp = createCompileSpinner('编译中...', 2);
        sp.start();
        sp.tickInitial();   // 1
        expect(sp.isRunning()).toBe(true);
        sp.tickInitial();   // 2，达到 expectedCount → stop
        expect(sp.isRunning()).toBe(false);
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/webpack-runner/compile-spinner.test.js
```

- [ ] **Step 3：写实现**

`src/webpack-runner/compile-spinner.js`：

```js
const ora = require('ora');

/**
 * 编译 spinner。
 *
 * @param {string} text - spinner 文案前缀
 * @param {number} [expectedCount=1] - tickInitial 累计达此数后自动 stop
 */
function createCompileSpinner(text = '编译中...', expectedCount = 1) {
    const startedAt = Date.now();
    const spinner = ora({ text, color: 'cyan' });
    let running = false;
    let initialCount = 0;
    let timer = null;

    function refresh() {
        const ms = Date.now() - startedAt;
        const sec = (ms / 1000).toFixed(1);
        spinner.text = `${text} ${sec}s`;
    }

    return {
        start() {
            if (running) return;
            running = true;
            spinner.start();
            timer = setInterval(refresh, 1000);
            timer.unref?.();
        },
        stop() {
            if (!running) return;
            running = false;
            clearInterval(timer);
            spinner.stop();
        },
        clear() {
            spinner.clear();
        },
        tickInitial() {
            initialCount += 1;
            if (initialCount >= expectedCount) {
                this.stop();
            }
        },
        isRunning() {
            return running;
        },
    };
}

module.exports = { createCompileSpinner };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/webpack-runner/compile-spinner.test.js
```

预期：3 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/webpack-runner/compile-spinner.js tests/unit/webpack-runner/compile-spinner.test.js
git commit -m "feat(webpack-runner): 加 createCompileSpinner（基于 ora，tickInitial 计数自动 stop）"
```

---

### Task 14：`src/webpack-runner/run-dev-server.js` + 测试

**Files:**
- Create: `src/webpack-runner/run-dev-server.js`
- Create: `tests/unit/webpack-runner/run-dev-server.test.js`

- [ ] **Step 1：写测试**

`tests/unit/webpack-runner/run-dev-server.test.js`：

```js
const { resolveDevServerOptions } = require('../../../src/webpack-runner/run-dev-server');

describe('webpack-runner/run-dev-server.resolveDevServerOptions', () => {
    test('默认 host=localhost / port=defaultPort', () => {
        const opts = resolveDevServerOptions({ cliOptions: {} }, {}, { defaultPort: 9000 });
        expect(opts.host).toBe('localhost');
        expect(opts.port).toBe(9000);
    });

    test('CLI --port / --host 最高优先', () => {
        const opts = resolveDevServerOptions(
            { cliOptions: { port: 8888, host: '0.0.0.0' } },
            { port: 9999, host: '127.0.0.1' },
            { defaultPort: 9000 },
        );
        expect(opts.host).toBe('0.0.0.0');
        expect(opts.port).toBe(8888);
    });

    test('userDevServer 次优先（CLI 无）', () => {
        const opts = resolveDevServerOptions(
            { cliOptions: {} },
            { port: 9999, host: '127.0.0.1' },
            { defaultPort: 9000 },
        );
        expect(opts.host).toBe('127.0.0.1');
        expect(opts.port).toBe(9999);
    });

    test('hot=true 不可被覆盖', () => {
        const opts = resolveDevServerOptions(
            { cliOptions: {} },
            { hot: false },
            { defaultPort: 9000 },
        );
        expect(opts.hot).toBe(true);
    });

    test('historyApiFallback 默认 true，用户可覆盖', () => {
        expect(resolveDevServerOptions({ cliOptions: {} }, {}, { defaultPort: 9000 }).historyApiFallback).toBe(true);
        expect(resolveDevServerOptions(
            { cliOptions: {} },
            { historyApiFallback: false },
            { defaultPort: 9000 },
        ).historyApiFallback).toBe(false);
    });

    test('devMiddleware.stats 默认 false，用户可覆盖', () => {
        expect(resolveDevServerOptions({ cliOptions: {} }, {}, { defaultPort: 9000 }).devMiddleware.stats).toBe(false);
        expect(resolveDevServerOptions(
            { cliOptions: {} },
            { devMiddleware: { stats: 'verbose' } },
            { defaultPort: 9000 },
        ).devMiddleware.stats).toBe('verbose');
    });

    test('proxy / setupMiddlewares 等任意用户字段透传', () => {
        const opts = resolveDevServerOptions(
            { cliOptions: {} },
            { proxy: { '/api': 'http://localhost:3000' } },
            { defaultPort: 9000 },
        );
        expect(opts.proxy).toEqual({ '/api': 'http://localhost:3000' });
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/webpack-runner/run-dev-server.test.js
```

- [ ] **Step 3：写实现**

`src/webpack-runner/run-dev-server.js`：

```js
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const logger = require('../core/logger');
const { extractStatsSummary } = require('./format-stats');
const { createCompileSpinner } = require('./compile-spinner');

/**
 * 装配 dev-server options：
 *   - 默认值（historyApiFallback / devMiddleware.stats）
 *   - 用户配置（webConfig.devServer 等任意 webpack-dev-server 字段）
 *   - CLI flag（host/port 最高优先）
 *   - frame 强制项（hot:true）
 */
function resolveDevServerOptions(ctx, userDev, { defaultPort }) {
    const host = ctx.cliOptions.host ?? userDev.host ?? 'localhost';
    const port = ctx.cliOptions.port ?? userDev.port ?? defaultPort;
    return {
        historyApiFallback: true,
        ...userDev,
        host,
        port,
        hot: true,
        devMiddleware: {
            stats: false,
            ...(userDev.devMiddleware || {}),
        },
    };
}

/**
 * 启动 webpack-dev-server，接管编译反馈。
 *
 * @param {object} webpackConfig - 完整 webpack 配置（含 devServer 摘出后）
 * @param {object} devServerOptions
 * @param {string} name - 用于 compileSuccess 显示
 * @param {object} ctx
 * @returns {Promise<WebpackDevServer>}
 */
async function runDevServer(webpackConfig, devServerOptions, name, ctx) {
    const compiler = webpack(webpackConfig);
    const spinner = createCompileSpinner('编译中...', 1);

    compiler.hooks.done.tap('base-client', (stats) => {
        const sum = extractStatsSummary(stats, name);
        spinner.clear();
        if (sum.errorCount > 0) {
            logger.compileFailure(sum.name);
            console.error(stats.toString({ colors: true }));
            spinner.tickInitial();
            return;
        }
        logger.compileSuccess(sum.name, sum.ms, sum.totalSize);
        logger.compileWarning(sum.name, sum.warningCount);
        const url = `http://${devServerOptions.host}:${devServerOptions.port}`;
        logger.footer({ env: ctx.env, url, target: ctx.target });
        spinner.tickInitial();
    });

    const server = new WebpackDevServer(devServerOptions, compiler);
    spinner.start();
    await server.start();
    return server;
}

module.exports = { resolveDevServerOptions, runDevServer };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/webpack-runner/run-dev-server.test.js
```

预期：7 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/webpack-runner/run-dev-server.js tests/unit/webpack-runner/run-dev-server.test.js
git commit -m "feat(webpack-runner): 加 runDevServer + resolveDevServerOptions（host/port 三级优先、hot 强制、stats 接管）"
```

---

### Task 15：`src/cli/commands/dev-web.js` + 测试

**Files:**
- Create: `src/cli/commands/dev-web.js`
- Create: `tests/unit/cli/commands-dev-web.test.js`

- [ ] **Step 1：写测试**

`tests/unit/cli/commands-dev-web.test.js`：

```js
const cmd = require('../../../src/cli/commands/dev-web');
const { TARGETS } = require('../../../src/core/target');
const { MODES } = require('../../../src/core/mode');

describe('cli/commands/dev-web', () => {
    test('命令文件导出契约：name / target / mode / needsBcConfig / aliases', () => {
        expect(cmd.name).toBe('dev:web');
        expect(cmd.target).toBe(TARGETS.WEB);
        expect(cmd.mode).toBe(MODES.DEV);
        expect(cmd.needsBcConfig).toBe(true);
        expect(cmd.needsBuilderConfig).toBe(false);
        expect(cmd.aliases).toEqual(['dev']);
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
npx jest tests/unit/cli/commands-dev-web.test.js
```

- [ ] **Step 3：写实现**

`src/cli/commands/dev-web.js`：

```js
const path = require('path');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { deriveBuildInfo } = require('../../core/build-info');
const { resolveBuildConfig } = require('../../config/bc-config');
const { resolveDevServerOptions, runDevServer } = require('../../webpack-runner/run-dev-server');

module.exports = {
    name: 'dev:web',
    aliases: ['dev'],
    description: '启动 web target 开发服务器（浏览器 SPA）',
    target: TARGETS.WEB,
    mode: MODES.DEV,
    needsBcConfig: true,
    needsBuilderConfig: false,
    options: [
        ['--port <n>', 'dev server 端口（默认 9000）'],
        ['--host <host>', 'dev server host（默认 localhost）'],
    ],
    action: async (ctx) => {
        const pkgJson = require(path.resolve(process.cwd(), 'package.json'));
        const buildInfo = deriveBuildInfo(ctx, pkgJson);

        const { web } = resolveBuildConfig(ctx, pkgJson, buildInfo);
        const { devServer: userDev = {}, ...webpackConfig } = web;
        const devServerOptions = resolveDevServerOptions(ctx, userDev, { defaultPort: 9000 });

        await runDevServer(webpackConfig, devServerOptions, 'web', ctx);

        // 进程持续运行直到 SIGINT
        process.on('SIGINT', () => {
            process.exit(0);
        });
    },
};
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/cli/commands-dev-web.test.js
```

预期：3 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/cli/commands/dev-web.js tests/unit/cli/commands-dev-web.test.js
git commit -m "feat(cli): 加 dev:web 命令（aliases [dev]，编排 buildInfo → resolveBuildConfig → runDevServer）"
```

---

### Task 16：`src/cli/index.js` 派发器 + 测试

**Files:**
- Create: `src/cli/index.js`
- Create: `tests/unit/cli/index.test.js`

- [ ] **Step 1：写测试**

`tests/unit/cli/index.test.js`：

```js
const path = require('path');
const { createCli, runCommand } = require('../../../src/cli/index');

const fixtureDir = path.join(__dirname, '../../fixtures/cli-runCommand');

beforeAll(() => {
    const fs = require('fs');
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(
        path.join(fixtureDir, '.env.prod'),
        'BC_ENV=prod\nBC_API_BASE=https://api.test\n',
    );
    fs.writeFileSync(
        path.join(fixtureDir, 'package.json'),
        JSON.stringify({ name: 'demo', version: '1.0.0' }),
    );
});

afterAll(() => {
    const fs = require('fs');
    fs.rmSync(fixtureDir, { recursive: true, force: true });
});

describe('cli/index', () => {
    test('createCli 返回 cac 实例并注册命令（含 alias）', () => {
        const cli = createCli();
        const names = cli.commands.map(c => c.name);
        expect(names).toContain('dev:web');
    });

    describe('runCommand', () => {
        const fakeCmd = {
            name: 'fake',
            target: 'web',
            mode: 'development',
            needsBcConfig: false,
            needsBuilderConfig: false,
            options: [],
            action: jest.fn().mockResolvedValue(undefined),
        };

        let oldCwd;
        beforeEach(() => {
            oldCwd = process.cwd();
            process.chdir(fixtureDir);
            fakeCmd.action.mockClear();
        });
        afterEach(() => { process.chdir(oldCwd); });

        test('runCommand 加载 env、构造 ctx、调 action(ctx)', async () => {
            await runCommand(fakeCmd, { env: 'prod' });
            expect(fakeCmd.action).toHaveBeenCalledTimes(1);
            const ctx = fakeCmd.action.mock.calls[0][0];
            expect(ctx.command).toBe('fake');
            expect(ctx.target).toBe('web');
            expect(ctx.env.BC_ENV).toBe('prod');
            expect(ctx.env.BC_API_BASE).toBe('https://api.test');
            expect(ctx.isWeb).toBe(true);
            expect(ctx.isDev).toBe(true);
        });

        test('runCommand 把 BC_ 子集写入 process.env', async () => {
            delete process.env.BC_API_BASE;
            await runCommand(fakeCmd, { env: 'prod' });
            expect(process.env.BC_API_BASE).toBe('https://api.test');
        });

        test('BC_ENV 未声明时用 cliOptions.env 兜底', async () => {
            const fs = require('fs');
            fs.writeFileSync(path.join(fixtureDir, '.env.staging'), 'BC_API_BASE=https://api\n');
            await runCommand(fakeCmd, { env: 'staging' });
            const ctx = fakeCmd.action.mock.calls[0][0];
            expect(ctx.env.BC_ENV).toBe('staging');
        });

        test('action 抛错时 runCommand 经 logger.error 报告，并以 1 退出', async () => {
            const errCmd = { ...fakeCmd, action: jest.fn().mockRejectedValue(new Error('boom')) };
            const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
            const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            await runCommand(errCmd, { env: 'prod' });
            expect(exitSpy).toHaveBeenCalledWith(1);
            exitSpy.mockRestore();
            errSpy.mockRestore();
        });
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/cli/index.test.js
```

- [ ] **Step 3：写实现**

`src/cli/index.js`：

```js
const { cac } = require('cac');
const { version } = require('../../package.json');
const { loadEnv } = require('../core/env');
const { buildCtx } = require('../core/ctx');
const logger = require('../core/logger');

const COMMANDS = [
    require('./commands/dev-web'),
    // 后续 phase：dev-app / build / pack / installer / child
];

function applyBcEnvFallback(env, cliOptions) {
    if (!env.BC_ENV) env.BC_ENV = cliOptions.env;
}

function injectBcSubsetToProcessEnv(env) {
    for (const k of Object.keys(env)) {
        if (k.startsWith('BC_')) process.env[k] = env[k];
    }
}

async function runCommand(cmd, cliOptions) {
    try {
        const env = loadEnv(cliOptions.env);
        applyBcEnvFallback(env, cliOptions);
        injectBcSubsetToProcessEnv(env);

        const ctx = buildCtx(cmd, cliOptions, env);

        process.title = `bc-${cmd.name}|env=${env.BC_ENV}`;
        logger.banner({ command: cmd.name, target: ctx.target, mode: ctx.mode, env });

        await cmd.action(ctx);
    } catch (err) {
        logger.error(cmd.name, err.message);
        if (cliOptions?.debug) console.error(err.stack);
        process.exit(1);
    }
}

function createCli() {
    const cli = cac('base-client');
    cli.option('--env <name>', '指定环境名，加载 .env.<name>', { default: 'prod' });
    cli.option('--config <path>', '指定 bc.config 路径');
    cli.option('--debug', '出错时附打印 stack');

    for (const cmd of COMMANDS) {
        const c = cli.command(cmd.name, cmd.description);
        for (const alias of (cmd.aliases || [])) c.alias(alias);
        for (const [flag, desc, cfg] of (cmd.options || [])) c.option(flag, desc, cfg);
        c.action((cliOptions) => runCommand(cmd, cliOptions));
    }

    cli.help();
    cli.version(version);
    return cli;
}

module.exports = { createCli, runCommand };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/cli/index.test.js
```

预期：5 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/cli/index.js tests/unit/cli/index.test.js
git commit -m "feat(cli): 加 createCli + runCommand（env 加载 + BC_ENV fallback + ctx 派生 + 错误处理）"
```

---

### Task 17：`src/index.js` 包入口

**Files:**
- Create: `src/index.js`

- [ ] **Step 1：写实现（无需 TDD——只是公共 API re-export）**

`src/index.js`：

```js
// frame 包公共 API（供 require('@base-client/frame') 使用；目前主要给类型提示与少数高级用法）
const mode = require('./core/mode');
const target = require('./core/target');
const logger = require('./core/logger');

module.exports = {
    MODES: mode.MODES,
    TARGETS: target.TARGETS,
    logger,
};
```

- [ ] **Step 2：验证 require 不报错**

```bash
node -e "const f = require('./src/index'); console.log(Object.keys(f));"
```

预期输出：`[ 'MODES', 'TARGETS', 'logger' ]`

- [ ] **Step 3：commit**

```bash
git add src/index.js
git commit -m "feat(index): 加包入口 src/index.js（re-export 公共契约）"
```

---

### Task 18：更新 `package.json` 与 `rollup.config.mjs`

**Files:**
- Modify: `package.json`
- Modify: `rollup.config.mjs`

- [ ] **Step 1：检查现有 package.json 与 rollup.config.mjs 内容**

```bash
cat package.json
```

记录当前 `dependencies` / `peerDependencies`。

- [ ] **Step 2：调整 package.json**

把 `webpack-merge` 从 peerDependencies 移入 dependencies（frame 内部使用，用户不必感知）。

确保 `dependencies` 至少含：
```
cac dotenv fs-extra lodash ora picocolors webpack-merge
```

`peerDependencies` 至少含：
```
electron webpack webpack-dev-server
```

具体编辑用 `npm install` 与 `npm uninstall` 之间的差异：

```bash
npm uninstall webpack-merge
npm install webpack-merge       # 安装到 dependencies
npm install --save-peer electron webpack webpack-dev-server   # 已是 peer，无副作用；确保版本与之前一致
```

- [ ] **Step 3：更新 rollup.config.mjs**

`rollup.config.mjs` 现有形态：CLI bundle 输入 `src/cli/index.js` → 输出 `dist/cli/index.js`；Framework bundle 输入 `src/index.js` → 输出 `dist/index.js`。

确认入口路径与新结构一致（`src/cli/index.js` 与 `src/index.js` 都是 Task 16 / 17 创建的）。如有 v1 残留入口（如 `src/index.js` 是否覆盖原文件）需要确认。

期望最终 rollup.config.mjs 关键字段：

```js
// CLI bundle
input: { 'cli/index': 'src/cli/index.js' }
output.dir: 'dist'
output.format: 'cjs'

// Framework bundle
input: { 'index': 'src/index.js' }
output.dir: 'dist'
output.format: 'cjs'
```

如已是此形态 → 无需改动；如有差异，按上述调整。

- [ ] **Step 4：跑全量 jest 与一次 rollup 构建确认无回归**

```bash
npx jest
```

预期：所有 unit test PASS。

```bash
npm run build
```

预期：dist/ 下产出 `cli/index.js` 与 `index.js`（无报错）。

- [ ] **Step 5：commit**

```bash
git add package.json package-lock.json rollup.config.mjs
git commit -m "chore: webpack-merge 移入 dependencies；rollup 入口校准"
```

---

### Task 19：E2E 烟雾测试（fixture project 真起 dev:web）

**Files:**
- Create: `tests/fixtures/minimal-web/bc.config.js`
- Create: `tests/fixtures/minimal-web/.env.prod`
- Create: `tests/fixtures/minimal-web/package.json`
- Create: `tests/fixtures/minimal-web/src/renderer/index.js`
- Create: `tests/fixtures/minimal-web/src/renderer/index.html`
- Create: `tests/unit/e2e-dev-web.test.js`

- [ ] **Step 1：建最小 fixture project**

`tests/fixtures/minimal-web/package.json`：

```json
{
    "name": "minimal-web",
    "version": "0.0.1",
    "main": "app/main/index.js"
}
```

`tests/fixtures/minimal-web/.env.prod`：

```
BC_ENV=prod
BC_API_BASE=https://api.example.com
```

`tests/fixtures/minimal-web/src/renderer/index.js`：

```js
// 同构入口示例
const banner = document.createElement('div');
banner.id = 'banner';
banner.textContent = `target=${__BC_BUILD__.target}, env=${__BC_BUILD__.env}, api=${process.env.BC_API_BASE}`;
document.body.appendChild(banner);
```

`tests/fixtures/minimal-web/src/renderer/index.html`：

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>minimal-web</title></head>
<body><script src="/index.js"></script></body>
</html>
```

`tests/fixtures/minimal-web/bc.config.js`：

```js
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (ctx) => ({
    web: {
        plugins: [
            new HtmlWebpackPlugin({
                template: 'src/renderer/index.html',
                inject: 'body',
            }),
        ],
        devServer: { port: 19099 },
    },
});
```

- [ ] **Step 2：本地装 html-webpack-plugin（fixture 内部依赖）**

frame 根目录已有 webpack 等 peer 依赖。fixture 用的 html-webpack-plugin 让 frame 项目本身 devDependencies 含一份（用于 E2E）：

```bash
npm install --save-dev html-webpack-plugin
```

- [ ] **Step 3：写 E2E 测试**

`tests/unit/e2e-dev-web.test.js`：

```js
const path = require('path');
const http = require('http');
const { createCli } = require('../../src/cli/index');

const fixtureDir = path.join(__dirname, '../fixtures/minimal-web');

function httpGet(url, { timeoutMs = 3000 } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
    });
}

describe('E2E: dev:web 起 dev-server，浏览器路径可访问', () => {
    let oldCwd;
    let server;

    beforeAll(() => {
        oldCwd = process.cwd();
        process.chdir(fixtureDir);
    });

    afterAll(async () => {
        if (server) await server.stop?.();
        process.chdir(oldCwd);
    });

    test('dev:web 起 19099 端口，GET / 返回 200 含 banner', async () => {
        // 直接调 action（绕开 cac 解析）以拿到 server 控制权
        const cmd = require('../../src/cli/commands/dev-web');
        const { runCommand } = require('../../src/cli/index');

        // 把 server 引用 hook 出来：替换 runDevServer 的 server 暂存
        const runDevServerMod = require('../../src/webpack-runner/run-dev-server');
        const originalRun = runDevServerMod.runDevServer;
        runDevServerMod.runDevServer = async (...args) => {
            server = await originalRun(...args);
            return server;
        };

        try {
            await runCommand(cmd, { env: 'prod' });
            // 等待编译完成（dev-server done hook）
            await new Promise((r) => setTimeout(r, 3000));
            const res = await httpGet('http://localhost:19099/');
            expect(res.status).toBe(200);
            expect(res.body).toContain('<title>minimal-web</title>');
        } finally {
            runDevServerMod.runDevServer = originalRun;
        }
    }, 30000);
});
```

- [ ] **Step 4：跑 E2E**

```bash
npx jest tests/unit/e2e-dev-web.test.js --runInBand
```

预期：1 个 test PASS（编译 + 启动 + HTTP 200）。

- [ ] **Step 5：跑全量测试确认全绿**

```bash
npx jest --runInBand
```

预期：所有 Phase 1 测试全部 PASS。

- [ ] **Step 6：commit**

```bash
git add tests/fixtures/minimal-web/ tests/unit/e2e-dev-web.test.js package.json package-lock.json
git commit -m "test(e2e): 加 dev:web E2E（最小 fixture project，HTTP 200 验证）"
```

---

## Phase 1 完成态

- 17 个 src/ 文件（core 6 + config 4 + webpack-runner 3 + cli 2 + index 1，及 templates 暂空）
- 14 份 unit + 1 份 E2E 共 ~50+ 个 test PASS
- `npx jest --runInBand` 全绿
- `npm run build` 产 `dist/cli/index.js` + `dist/index.js`
- 任一项目里 `npx base-client dev` 起 webpack-dev-server，浏览器访问可见同构 banner
- git log 含 ~17 个原子 commit

## 下一 Phase 衔接点

Phase 2（build）会复用：

- `core/*`（无需改动）
- `config/presets/web.js` 与 `config/presets/build-info-plugin.js` / `user-env-plugin.js`（无需改动）
- `config/bc-config.js`（无需改动；resolveBuildConfig 路径已支持 web target）
- `cli/index.js`（新增 build 命令到 COMMANDS 数组）
- 新增 `src/webpack-runner/run-build.js`（生产 webpack 一次性运行 + 反馈，不依赖 dev-server）
- 新增 `src/cli/commands/build.js`
- E2E：fixture project 内跑 build，检查 `dist/index.html` 与 `dist/index.js` 是否产出

执行 Phase 1 全程预计 6-10 小时（含调试与测试）；plan 自身估算 ~1100 行（含 19 个任务、~50 段代码块、~50 个测试用例）。
