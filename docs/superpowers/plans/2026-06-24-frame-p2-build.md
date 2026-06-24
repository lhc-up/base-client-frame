# Frame Phase 2：`build` 命令 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `bc-frame build` 命令，对 web target 做生产构建，产物落 `dist/`（含 `index.html` / `index.js` / `assets/*`）。

**Architecture:** 在 Phase 1 既有 core / web 预设 / bc-config 基础上，新增 `webpack-runner/run-build.js`（接收 webpack config 数组并行运行 + logger 反馈，为 Phase 4 三进程生产构建预留扩展空间），新增 `cli/commands/build.js` 命令模板并注册到 cli dispatcher。

**Tech Stack:** Node.js, webpack 5（peer）, fs-extra（dist 清理）, jest 30（测试）。复用 Phase 1 全部基础设施。

**Phase 范围**：仅 `build`（web target 生产构建）。dev / dev:web / dev:app / pack 等命令独立 phase 处理。

**对应 spec 章节**：[2026-06-24-frame-design.md](../specs/2026-06-24-frame-design.md) § 2.2 build 行 / § 8 / § 11.5。

**前置 Phase**：Phase 1（Foundation + dev:web）必须已完成。

---

## 文件结构（Phase 2 增量）

```
src/
└── webpack-runner/
    └── run-build.js                     # 新增：runProductionBuild(configs, ctx)
src/cli/commands/
└── build.js                             # 新增：build 命令模板

cli/index.js                             # 修改：COMMANDS 数组追加 build

tests/unit/
├── webpack-runner/
│   └── run-build.test.js                # 新增
├── cli/
│   ├── commands-build.test.js           # 新增
│   └── index.test.js                    # 修改：补充 build 注册测试
└── e2e-build.test.js                    # 新增
```

---

## Tasks

### Task 1：`src/webpack-runner/run-build.js` + 测试

**Files:**
- Create: `src/webpack-runner/run-build.js`
- Create: `tests/unit/webpack-runner/run-build.test.js`

设计要点：`runProductionBuild(configs, ctx)` 接收一个 webpack config **数组**，并行运行各 compiler，逐个 compiler 完成时调 logger.compileSuccess/Failure/Warning。任一失败 → 整体 reject。Phase 4 三进程构建复用同一函数（传 `[main, preload, renderer]`）。

- [ ] **Step 1：写测试**

`tests/unit/webpack-runner/run-build.test.js`：

```js
const path = require('path');
const fs = require('fs-extra');
const { runProductionBuild } = require('../../../src/webpack-runner/run-build');
const logger = require('../../../src/core/logger');

const tmpRoot = path.join(__dirname, '../../tmp/run-build');

function makeMinimalConfig(name, entryContent) {
    const dir = path.join(tmpRoot, name);
    fs.ensureDirSync(dir);
    const entry = path.join(dir, 'entry.js');
    fs.writeFileSync(entry, entryContent);
    return {
        name,
        mode: 'production',
        entry,
        output: { path: path.join(dir, 'out'), filename: 'bundle.js' },
        target: 'node',
        stats: 'none',
        infrastructureLogging: { level: 'warn' },
    };
}

describe('webpack-runner/run-build', () => {
    let logSpy, errSpy;
    beforeEach(() => {
        logSpy = jest.spyOn(logger, 'compileSuccess').mockImplementation(() => {});
        errSpy = jest.spyOn(logger, 'compileFailure').mockImplementation(() => {});
        jest.spyOn(logger, 'compileWarning').mockImplementation(() => {});
        fs.removeSync(tmpRoot);
    });
    afterAll(() => { fs.removeSync(tmpRoot); });

    test('runProductionBuild 编译单 config 成功，调 logger.compileSuccess', async () => {
        const cfg = makeMinimalConfig('single', 'module.exports = 1;');
        await runProductionBuild([cfg], { target: 'web', env: {} });
        expect(logSpy).toHaveBeenCalledWith('single', expect.any(Number), expect.any(Number));
        expect(fs.existsSync(path.join(tmpRoot, 'single/out/bundle.js'))).toBe(true);
    });

    test('runProductionBuild 编译多 config 并行成功', async () => {
        const a = makeMinimalConfig('a', 'module.exports = "a";');
        const b = makeMinimalConfig('b', 'module.exports = "b";');
        await runProductionBuild([a, b], { target: 'web', env: {} });
        expect(logSpy).toHaveBeenCalledWith('a', expect.any(Number), expect.any(Number));
        expect(logSpy).toHaveBeenCalledWith('b', expect.any(Number), expect.any(Number));
    });

    test('runProductionBuild 任一 config 失败时 reject 并调 logger.compileFailure', async () => {
        const ok = makeMinimalConfig('ok', 'module.exports = 1;');
        const bad = makeMinimalConfig('bad', 'this is not valid javascript ===');
        await expect(runProductionBuild([ok, bad], { target: 'web', env: {} })).rejects.toThrow();
        expect(errSpy).toHaveBeenCalledWith('bad');
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/webpack-runner/run-build.test.js
```

预期：`Cannot find module '.../run-build'`。

- [ ] **Step 3：写实现**

`src/webpack-runner/run-build.js`：

```js
const webpack = require('webpack');
const logger = require('../core/logger');
const { extractStatsSummary } = require('./format-stats');
const { createCompileSpinner } = require('./compile-spinner');

/**
 * 并行运行多个 webpack 生产构建（一次性、无 watch）。
 * 任一失败 → reject。Phase 2 仅 web 一个 config；Phase 4 三进程并行复用同函数。
 *
 * @param {webpack.Configuration[]} configs - 一个或多个 webpack 配置
 * @param {object} ctx - frame ctx（用于上下文，目前未深度使用）
 * @returns {Promise<void>}
 */
async function runProductionBuild(configs, ctx) {
    const spinner = createCompileSpinner('编译中...', configs.length);
    spinner.start();

    try {
        await Promise.all(configs.map((cfg) => runOne(cfg, spinner)));
    } finally {
        spinner.stop();
    }
}

function runOne(cfg, spinner) {
    return new Promise((resolve, reject) => {
        const fallbackName = cfg.name || 'webpack';
        webpack(cfg, (err, stats) => {
            spinner.clear();

            if (err) {
                logger.compileFailure(fallbackName);
                console.error(err.stack || err.message);
                spinner.tickInitial();
                return reject(err);
            }

            const sum = extractStatsSummary(stats, fallbackName);
            if (sum.errorCount > 0) {
                logger.compileFailure(sum.name);
                console.error(stats.toString({ colors: true }));
                spinner.tickInitial();
                return reject(new Error(`${sum.name} 编译失败`));
            }

            logger.compileSuccess(sum.name, sum.ms, sum.totalSize);
            logger.compileWarning(sum.name, sum.warningCount);
            spinner.tickInitial();
            resolve();
        });
    });
}

module.exports = { runProductionBuild };
```

- [ ] **Step 4：跑测试确认通过**

```bash
npx jest tests/unit/webpack-runner/run-build.test.js
```

预期：3 个 test PASS。

- [ ] **Step 5：commit**

```bash
git add src/webpack-runner/run-build.js tests/unit/webpack-runner/run-build.test.js
git commit -m "feat(webpack-runner): 加 runProductionBuild（并行多 config 生产构建 + logger 反馈）"
```

---

### Task 2：`src/cli/commands/build.js` + 注册到 cli + 测试

**Files:**
- Create: `src/cli/commands/build.js`
- Create: `tests/unit/cli/commands-build.test.js`
- Modify: `src/cli/index.js`（COMMANDS 数组追加）
- Modify: `tests/unit/cli/index.test.js`（追加 build 注册断言）

- [ ] **Step 1：写命令模块测试**

`tests/unit/cli/commands-build.test.js`：

```js
const cmd = require('../../../src/cli/commands/build');
const { TARGETS } = require('../../../src/core/target');
const { MODES } = require('../../../src/core/mode');

describe('cli/commands/build', () => {
    test('命令文件导出契约：name / target / mode / needsBcConfig', () => {
        expect(cmd.name).toBe('build');
        expect(cmd.target).toBe(TARGETS.WEB);
        expect(cmd.mode).toBe(MODES.PROD);
        expect(cmd.needsBcConfig).toBe(true);
        expect(cmd.needsBuilderConfig).toBe(false);
        expect(cmd.aliases || []).toEqual([]);
    });

    test('options 为空（build 无专属选项）', () => {
        expect(cmd.options || []).toEqual([]);
    });

    test('action 是 async function', () => {
        expect(cmd.action.constructor.name).toBe('AsyncFunction');
    });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
npx jest tests/unit/cli/commands-build.test.js
```

- [ ] **Step 3：写命令模块**

`src/cli/commands/build.js`：

```js
const path = require('path');
const fse = require('fs-extra');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { deriveBuildInfo } = require('../../core/build-info');
const { resolveBuildConfig } = require('../../config/bc-config');
const { runProductionBuild } = require('../../webpack-runner/run-build');
const logger = require('../../core/logger');

module.exports = {
    name: 'build',
    description: 'web target 生产构建（产物落 dist/）',
    target: TARGETS.WEB,
    mode: MODES.PROD,
    needsBcConfig: true,
    needsBuilderConfig: false,
    options: [],
    action: async (ctx) => {
        const rootDir = process.cwd();
        const distDir = path.join(rootDir, 'dist');

        // 进场清空 dist/
        fse.emptyDirSync(distDir);

        const pkgJson = require(path.resolve(rootDir, 'package.json'));
        const buildInfo = deriveBuildInfo(ctx, pkgJson);

        const { web } = resolveBuildConfig(ctx, pkgJson, buildInfo);
        // web.devServer 字段在生产构建中无意义；摘出后丢弃
        const { devServer: _ignored, ...webpackConfig } = web;
        webpackConfig.name = webpackConfig.name || 'web';

        await runProductionBuild([webpackConfig], ctx);

        logger.success('build 完成');
    },
};
```

- [ ] **Step 4：跑命令模块测试确认通过**

```bash
npx jest tests/unit/cli/commands-build.test.js
```

预期：3 个 test PASS。

- [ ] **Step 5：修改 `src/cli/index.js`，把 build 加入 COMMANDS**

把现有的：

```js
const COMMANDS = [
    require('./commands/dev-web'),
    // 后续 phase：dev-app / build / pack / installer / child
];
```

改为：

```js
const COMMANDS = [
    require('./commands/dev-web'),
    require('./commands/build'),
    // 后续 phase：dev-app / pack / installer / child
];
```

- [ ] **Step 6：在 `tests/unit/cli/index.test.js` 中追加 build 注册断言**

找到 `test('createCli 返回 cac 实例并注册命令（含 alias）'`，把 `expect(names).toContain('dev:web');` 之后追加：

```js
expect(names).toContain('build');
```

- [ ] **Step 7：跑全量 jest 确认无回归**

```bash
npx jest tests/unit/cli/
```

预期：dev-web 与 build 命令模块测试 + index 注册测试都 PASS。

- [ ] **Step 8：commit**

```bash
git add src/cli/commands/build.js src/cli/index.js tests/unit/cli/commands-build.test.js tests/unit/cli/index.test.js
git commit -m "feat(cli): 加 build 命令（web 生产构建：dist 清空 + runProductionBuild）"
```

---

### Task 3：E2E 烟雾测试（fixture project 跑 build）

**Files:**
- Create: `tests/unit/e2e-build.test.js`

复用 Phase 1 的 `tests/fixtures/minimal-web/` fixture（含 bc.config.js / .env.prod / src/renderer/index.js / src/renderer/index.html）。

- [ ] **Step 1：写 E2E 测试**

`tests/unit/e2e-build.test.js`：

```js
const path = require('path');
const fs = require('fs');
const { runCommand } = require('../../src/cli/index');

const fixtureDir = path.join(__dirname, '../fixtures/minimal-web');

describe('E2E: build 命令在 fixture project 产出 dist/', () => {
    let oldCwd;

    beforeAll(() => {
        oldCwd = process.cwd();
        process.chdir(fixtureDir);
    });

    afterAll(() => {
        process.chdir(oldCwd);
    });

    test('build 跑通：dist/index.html 与 dist/index.js 都存在', async () => {
        const cmd = require('../../src/cli/commands/build');
        await runCommand(cmd, { env: 'prod' });

        const distDir = path.join(fixtureDir, 'dist');
        expect(fs.existsSync(path.join(distDir, 'index.html'))).toBe(true);
        expect(fs.existsSync(path.join(distDir, 'index.js'))).toBe(true);

        const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
        expect(html).toContain('<title>minimal-web</title>');

        const js = fs.readFileSync(path.join(distDir, 'index.js'), 'utf8');
        // production 构建产物含 __BC_BUILD__.target 字面量 "web"（经过 webpack 压缩后仍可搜到子串）
        expect(js).toContain('"web"');
        // 但不应含 'app' 分支代码（DCE 应消除）—— minimal-web 没写分支代码，跳过此断言
    }, 60000);
});
```

- [ ] **Step 2：跑 E2E**

```bash
npx jest tests/unit/e2e-build.test.js --runInBand
```

预期：1 个 test PASS。

- [ ] **Step 3：跑全量测试**

```bash
npx jest --runInBand
```

预期：Phase 1 + Phase 2 所有测试 PASS。

- [ ] **Step 4：commit**

```bash
git add tests/unit/e2e-build.test.js
git commit -m "test(e2e): 加 build 命令 E2E（在 minimal-web fixture 验证 dist/ 产物）"
```

---

## Phase 2 完成态

- 新增 3 个 src/ 文件（`webpack-runner/run-build.js` + `cli/commands/build.js`）
- cli/index.js 注册 build
- 新增 3 份测试文件，全部 PASS
- `bc-frame build` 在 minimal-web fixture 中产 `dist/{index.html, index.js, assets/*}`

## 下一 Phase 衔接点

Phase 3（dev:app）会新增：

- `src/config/presets/{main,preload,renderer}.js` 三个预设
- `src/electron/{resolve-electron,resolve-main-entry,kill-electron}.js`
- `src/cli/commands/dev-app.js`
- `src/config/bc-config.js` 扩展：支持 `ctx.target === 'app'` 分支（返回 `{main, preload, renderer}`）
- `src/cli/index.js` 注册 dev-app

`runProductionBuild` 在 Phase 4 pack 流程中复用，传 `[mainCfg, preloadCfg, rendererCfg]` 即三进程并行生产构建。
