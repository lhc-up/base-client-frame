# Frame M4 Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `src/config/presets/` 下的三进程 webpack 预设骨架（`getMainPreset` / `getPreloadPreset` / `getRendererPreset`）+ 共享纯函数 `defineEnvPlugin`，作为 M2 合并用户配置前的底座。

**Architecture:** 四个独立文件 + 一个汇出 index：`define-env.js`（共享）、`main.js` / `preload.js` / `renderer.js`（三个 getter 各自独立产出完整预设，不共享中间层）、`index.js`（聚合导出）。三 getter 入参一致 `{ rootDir, env, mode }`、出参为 webpack 配置对象。`defineEnvPlugin` 从 env 对象过滤 `BC_` 前缀键、逐键定义为 `process.env.<key>`，返回 `webpack.DefinePlugin` 实例。

**Tech Stack:** Node 20+ / Jest 30 / webpack 5 / html-webpack-plugin 5 / CommonJS

> **Spec 参考**：`docs/superpowers/specs/2026-05-28-frame-m4-presets-design.md`

> **依赖前置**：M3 plan 的 Task 0（M0 工程基线：Jest 配置 + `npm test` 可跑）已完成。

> **与 spec 文件结构的微调**：spec §八 把 `defineEnvPlugin` 放在 `presets/index.js`，本 plan 单拆为 `presets/define-env.js` 以避免循环依赖（`main.js` / `renderer.js` 需要 require 它）。`index.js` 仅做汇出。对外 API 表面（用户从 `presets` 入口拿 getter / `defineEnvPlugin`）不变。

---

## File Structure

**Create:**
- `src/config/presets/define-env.js` — `defineEnvPlugin(env)`
- `src/config/presets/main.js` — `getMainPreset({ rootDir, env, mode })`
- `src/config/presets/preload.js` — `getPreloadPreset({ rootDir, env, mode })`
- `src/config/presets/renderer.js` — `getRendererPreset({ rootDir, env, mode })`
- `src/config/presets/index.js` — 汇出全部
- `tests/unit/presets-define-env.test.js`
- `tests/unit/presets-main.test.js`
- `tests/unit/presets-preload.test.js`
- `tests/unit/presets-renderer.test.js`
- `tests/unit/presets-index.test.js`

**Modify:**
- `package.json`：新增 `html-webpack-plugin` 到 dependencies；`webpack` 加到 devDependencies（peer 已存在，本地测试需要装到 frame 自身 node_modules）

---

## Task 0：依赖准备

**Files:**
- Modify: `package.json`

- [ ] **Step 0.1：安装 html-webpack-plugin（dependency）与 webpack（devDependency）**

Run:
```bash
npm i html-webpack-plugin@^5.6.0
npm i -D webpack@^5.90.0
```

Expected：`dependencies.html-webpack-plugin` 与 `devDependencies.webpack` 出现；`peerDependencies.webpack` 保持不动（用户项目仍需自带）。

- [ ] **Step 0.2：核对 package.json**

打开 `package.json` 确认：
- `dependencies` 含 `html-webpack-plugin@^5.x`
- `devDependencies` 含 `webpack@^5.x`
- `peerDependencies` 仍含 `webpack` 与 `webpack-dev-server`

- [ ] **Step 0.3：跑既有测试确认没破**

Run: `npm test`
Expected：M3 既有用例全绿。

- [ ] **Step 0.4：提交 Task 0**

```bash
git add package.json package-lock.json
git commit -m "chore(M4): 准备 html-webpack-plugin (dep) 与 webpack (devDep)"
```

---

## Task 1：defineEnvPlugin（共享纯函数）

**Files:**
- Create: `src/config/presets/define-env.js`
- Test: `tests/unit/presets-define-env.test.js`

### 接口契约

```js
defineEnvPlugin(env: object): webpack.DefinePlugin
```
- 只挑选 `key.startsWith('BC_')` 的键
- 每个键定义为 `process.env.<key> → JSON.stringify(value)`
- 三进程公用同一个实现；不做整体替换 `process.env`

### TDD

- [ ] **Step 1.1：写"返回 DefinePlugin 实例"测试**

```js
// tests/unit/presets-define-env.test.js
const webpack = require('webpack');
const { defineEnvPlugin } = require('../../src/config/presets/define-env');

describe('defineEnvPlugin', () => {
  test('返回 webpack.DefinePlugin 实例', () => {
    const plugin = defineEnvPlugin({ BC_API: 'http://x' });
    expect(plugin).toBeInstanceOf(webpack.DefinePlugin);
  });
});
```

- [ ] **Step 1.2：跑测试确认失败**

Run: `npx jest tests/unit/presets-define-env.test.js`
Expected：FAIL，`Cannot find module '../../src/config/presets/define-env'`。

- [ ] **Step 1.3：写最小实现**

```js
// src/config/presets/define-env.js
const webpack = require('webpack');

function defineEnvPlugin(env) {
  const defs = {};
  for (const k of Object.keys(env || {})) {
    if (k.startsWith('BC_')) {
      defs[`process.env.${k}`] = JSON.stringify(env[k]);
    }
  }
  return new webpack.DefinePlugin(defs);
}

module.exports = { defineEnvPlugin };
```

- [ ] **Step 1.4：跑测试确认通过**

Run: `npx jest tests/unit/presets-define-env.test.js`
Expected：PASS。

- [ ] **Step 1.5：补"BC_ 前缀过滤 + 逐键定义"测试**

在同一 `describe` 内追加：
```js
test('只注入 BC_ 前缀键、逐键定义为 process.env.<key>', () => {
  const plugin = defineEnvPlugin({
    BC_API: 'http://api',
    BC_VERSION: '1.0',
    SECRET: 'do-not-leak',
    NODE_ENV: 'not-injected',
  });
  expect(plugin.definitions).toEqual({
    'process.env.BC_API': JSON.stringify('http://api'),
    'process.env.BC_VERSION': JSON.stringify('1.0'),
  });
});

test('空 env 与未传 env 都返回空 definitions', () => {
  expect(defineEnvPlugin({}).definitions).toEqual({});
  expect(defineEnvPlugin(undefined).definitions).toEqual({});
});

test('不做整体替换 process.env（无 "process.env" 字面键）', () => {
  const plugin = defineEnvPlugin({ BC_API: 'x' });
  expect(plugin.definitions).not.toHaveProperty('process.env');
});

test('值用 JSON.stringify 序列化（字符串带引号、数字不带）', () => {
  const plugin = defineEnvPlugin({ BC_STR: 'abc', BC_NUM: 42 });
  expect(plugin.definitions['process.env.BC_STR']).toBe('"abc"');
  expect(plugin.definitions['process.env.BC_NUM']).toBe('42');
});
```

- [ ] **Step 1.6：跑全部 defineEnvPlugin 测试**

Run: `npx jest tests/unit/presets-define-env.test.js`
Expected：5 passed。

- [ ] **Step 1.7：提交 Task 1**

```bash
git add src/config/presets/define-env.js tests/unit/presets-define-env.test.js
git commit -m "feat(M4): defineEnvPlugin — BC_ 前缀过滤、逐键定义 process.env.<key>"
```

---

## Task 2：getMainPreset

**Files:**
- Create: `src/config/presets/main.js`
- Test: `tests/unit/presets-main.test.js`

### 接口契约

```js
getMainPreset({ rootDir, env, mode }): webpackConfig
```

返回的 webpack 配置至少包含：
- `target: 'electron-main'`
- `mode`（透传）
- `entry: <rootDir>/src/main/index.js`
- `output: { path: <rootDir>/app/main, filename: 'index.js', libraryTarget: 'commonjs2', assetModuleFilename: 'assets/[name].[hash:8][ext][query]' }`
- `externals: { electron: 'commonjs electron' }`
- `resolve.extensions: ['.js', '.mjs', '.cjs', '.json']`
- `devtool`: `'source-map'`（development）/ `false`（其他）
- `module.rules`: 3 条 Asset Modules（图片、字体、媒体）
- `plugins`: 含 `defineEnvPlugin(env)` 产物

### TDD

- [ ] **Step 2.1：写 target / entry / output 三项基础断言**

```js
// tests/unit/presets-main.test.js
const path = require('path');
const webpack = require('webpack');
const { getMainPreset } = require('../../src/config/presets/main');

const ROOT = '/tmp/proj';
const ENV = { BC_API: 'http://x' };

describe('getMainPreset', () => {
  test('target=electron-main、entry=<root>/src/main/index.js', () => {
    const cfg = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
    expect(cfg.target).toBe('electron-main');
    expect(cfg.entry).toBe(path.resolve(ROOT, 'src/main/index.js'));
  });

  test('output: path / filename / libraryTarget / assetModuleFilename', () => {
    const cfg = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
    expect(cfg.output).toMatchObject({
      path: path.resolve(ROOT, 'app/main'),
      filename: 'index.js',
      libraryTarget: 'commonjs2',
      assetModuleFilename: 'assets/[name].[hash:8][ext][query]',
    });
  });
});
```

- [ ] **Step 2.2：跑测试确认失败**

Run: `npx jest tests/unit/presets-main.test.js`
Expected：FAIL，模块不存在。

- [ ] **Step 2.3：写最小实现**

```js
// src/config/presets/main.js
const path = require('path');
const { defineEnvPlugin } = require('./define-env');

function getMainPreset({ rootDir, env, mode }) {
  return {
    target: 'electron-main',
    mode,
    entry: path.resolve(rootDir, 'src/main/index.js'),
    output: {
      path: path.resolve(rootDir, 'app/main'),
      filename: 'index.js',
      libraryTarget: 'commonjs2',
      assetModuleFilename: 'assets/[name].[hash:8][ext][query]',
    },
    externals: { electron: 'commonjs electron' },
    resolve: { extensions: ['.js', '.mjs', '.cjs', '.json'] },
    devtool: mode === 'development' ? 'source-map' : false,
    module: {
      rules: [
        { test: /\.(png|jpe?g|gif|svg|webp|avif)$/i, type: 'asset/resource' },
        { test: /\.(woff2?|eot|ttf|otf)$/i, type: 'asset/resource' },
        { test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i, type: 'asset/resource' },
      ],
    },
    plugins: [defineEnvPlugin(env)],
  };
}

module.exports = { getMainPreset };
```

- [ ] **Step 2.4：跑测试确认通过**

Run: `npx jest tests/unit/presets-main.test.js`
Expected：PASS。

- [ ] **Step 2.5：补 externals / resolve / mode / devtool 测试**

继续追加：
```js
test('externals 锁定 electron 为 commonjs', () => {
  const cfg = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
  expect(cfg.externals).toEqual({ electron: 'commonjs electron' });
});

test('resolve.extensions 含 .js/.mjs/.cjs/.json', () => {
  const cfg = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
  expect(cfg.resolve.extensions).toEqual(['.js', '.mjs', '.cjs', '.json']);
});

test('mode 透传', () => {
  const dev = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'development' });
  const prod = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
  expect(dev.mode).toBe('development');
  expect(prod.mode).toBe('production');
});

test('devtool: development → source-map; production → false', () => {
  const dev = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'development' });
  const prod = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
  expect(dev.devtool).toBe('source-map');
  expect(prod.devtool).toBe(false);
});
```

- [ ] **Step 2.6：补 Asset Modules rules 测试**

```js
test('module.rules 含 3 条 Asset Modules（图片/字体/媒体）', () => {
  const cfg = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
  expect(cfg.module.rules).toHaveLength(3);
  cfg.module.rules.forEach((r) => expect(r.type).toBe('asset/resource'));

  // 抽样匹配检查
  const [imgs, fonts, media] = cfg.module.rules;
  expect(imgs.test.test('foo.png')).toBe(true);
  expect(imgs.test.test('foo.svg')).toBe(true);
  expect(fonts.test.test('foo.woff2')).toBe(true);
  expect(media.test.test('foo.mp4')).toBe(true);
});
```

- [ ] **Step 2.7：补 plugins 含 DefinePlugin 测试**

```js
test('plugins 含 DefinePlugin 实例，且只注入 BC_ 前缀', () => {
  const cfg = getMainPreset({
    rootDir: ROOT,
    env: { BC_API: 'http://x', SECRET: 'no' },
    mode: 'production',
  });
  const defPlugin = cfg.plugins.find((p) => p instanceof webpack.DefinePlugin);
  expect(defPlugin).toBeDefined();
  expect(defPlugin.definitions).toEqual({
    'process.env.BC_API': JSON.stringify('http://x'),
  });
});
```

- [ ] **Step 2.8：跑全部 main 测试**

Run: `npx jest tests/unit/presets-main.test.js`
Expected：6 passed。

- [ ] **Step 2.9：提交 Task 2**

```bash
git add src/config/presets/main.js tests/unit/presets-main.test.js
git commit -m "feat(M4): getMainPreset — electron-main 进程预设骨架"
```

---

## Task 3：getPreloadPreset

**Files:**
- Create: `src/config/presets/preload.js`
- Test: `tests/unit/presets-preload.test.js`

### 接口契约

与 main 几乎一致，差异：
- `target: 'electron-preload'`
- `entry: <rootDir>/src/preload/index.js`
- `output.path: <rootDir>/app/preload`
- 其余字段（externals / resolve / output.libraryTarget / Asset Modules / DefinePlugin / devtool / mode）与 main 完全相同

### TDD

- [ ] **Step 3.1：写差异断言（target / entry / output.path）测试**

```js
// tests/unit/presets-preload.test.js
const path = require('path');
const webpack = require('webpack');
const { getPreloadPreset } = require('../../src/config/presets/preload');

const ROOT = '/tmp/proj';
const ENV = { BC_API: 'http://x' };

describe('getPreloadPreset', () => {
  test('target=electron-preload', () => {
    expect(getPreloadPreset({ rootDir: ROOT, env: ENV, mode: 'production' }).target)
      .toBe('electron-preload');
  });

  test('entry / output.path 落在 preload 目录', () => {
    const cfg = getPreloadPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
    expect(cfg.entry).toBe(path.resolve(ROOT, 'src/preload/index.js'));
    expect(cfg.output.path).toBe(path.resolve(ROOT, 'app/preload'));
  });
});
```

- [ ] **Step 3.2：跑测试确认失败**

Run: `npx jest tests/unit/presets-preload.test.js`
Expected：FAIL，模块不存在。

- [ ] **Step 3.3：写实现**

```js
// src/config/presets/preload.js
const path = require('path');
const { defineEnvPlugin } = require('./define-env');

function getPreloadPreset({ rootDir, env, mode }) {
  return {
    target: 'electron-preload',
    mode,
    entry: path.resolve(rootDir, 'src/preload/index.js'),
    output: {
      path: path.resolve(rootDir, 'app/preload'),
      filename: 'index.js',
      libraryTarget: 'commonjs2',
      assetModuleFilename: 'assets/[name].[hash:8][ext][query]',
    },
    externals: { electron: 'commonjs electron' },
    resolve: { extensions: ['.js', '.mjs', '.cjs', '.json'] },
    devtool: mode === 'development' ? 'source-map' : false,
    module: {
      rules: [
        { test: /\.(png|jpe?g|gif|svg|webp|avif)$/i, type: 'asset/resource' },
        { test: /\.(woff2?|eot|ttf|otf)$/i, type: 'asset/resource' },
        { test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i, type: 'asset/resource' },
      ],
    },
    plugins: [defineEnvPlugin(env)],
  };
}

module.exports = { getPreloadPreset };
```

- [ ] **Step 3.4：跑测试确认通过**

Run: `npx jest tests/unit/presets-preload.test.js`
Expected：PASS。

- [ ] **Step 3.5：补"与 main 一致"的回归测试**

```js
test('externals 锁定 electron 为 commonjs', () => {
  expect(getPreloadPreset({ rootDir: ROOT, env: ENV, mode: 'production' }).externals)
    .toEqual({ electron: 'commonjs electron' });
});

test('output.libraryTarget=commonjs2', () => {
  expect(getPreloadPreset({ rootDir: ROOT, env: ENV, mode: 'production' }).output.libraryTarget)
    .toBe('commonjs2');
});

test('devtool 按 mode', () => {
  const dev = getPreloadPreset({ rootDir: ROOT, env: ENV, mode: 'development' });
  const prod = getPreloadPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
  expect(dev.devtool).toBe('source-map');
  expect(prod.devtool).toBe(false);
});

test('plugins 含 DefinePlugin，BC_ 前缀过滤生效', () => {
  const cfg = getPreloadPreset({
    rootDir: ROOT,
    env: { BC_API: 'http://x', SECRET: 'no' },
    mode: 'production',
  });
  const defPlugin = cfg.plugins.find((p) => p instanceof webpack.DefinePlugin);
  expect(defPlugin.definitions).toEqual({
    'process.env.BC_API': JSON.stringify('http://x'),
  });
});
```

- [ ] **Step 3.6：跑全部 preload 测试**

Run: `npx jest tests/unit/presets-preload.test.js`
Expected：6 passed。

- [ ] **Step 3.7：提交 Task 3**

```bash
git add src/config/presets/preload.js tests/unit/presets-preload.test.js
git commit -m "feat(M4): getPreloadPreset — electron-preload 进程预设骨架"
```

---

## Task 4：getRendererPreset（含 html-webpack-plugin）

**Files:**
- Create: `src/config/presets/renderer.js`
- Test: `tests/unit/presets-renderer.test.js`

### 接口契约

与 main / preload 差异：
- `target: 'web'`
- `entry: <rootDir>/src/renderer/index.js`
- `output.path: <rootDir>/app/renderer`
- `output.publicPath: './'`
- **无** `libraryTarget`
- **无** `externals`
- `plugins` 多一个 `HtmlWebpackPlugin`，模板 `<rootDir>/src/renderer/index.html`、`inject: true`
- 其余字段（resolve / devtool / mode / Asset Modules / DefinePlugin）与 main / preload 一致

### TDD

- [ ] **Step 4.1：写差异断言（target / entry / output / publicPath）测试**

```js
// tests/unit/presets-renderer.test.js
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { getRendererPreset } = require('../../src/config/presets/renderer');

const ROOT = '/tmp/proj';
const ENV = { BC_API: 'http://x' };

describe('getRendererPreset', () => {
  test('target=web、entry/output 落在 renderer 目录', () => {
    const cfg = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
    expect(cfg.target).toBe('web');
    expect(cfg.entry).toBe(path.resolve(ROOT, 'src/renderer/index.js'));
    expect(cfg.output.path).toBe(path.resolve(ROOT, 'app/renderer'));
    expect(cfg.output.filename).toBe('index.js');
  });

  test('output.publicPath = "./"', () => {
    const cfg = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
    expect(cfg.output.publicPath).toBe('./');
  });
});
```

- [ ] **Step 4.2：跑测试确认失败**

Run: `npx jest tests/unit/presets-renderer.test.js`
Expected：FAIL，模块不存在。

- [ ] **Step 4.3：写实现**

```js
// src/config/presets/renderer.js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { defineEnvPlugin } = require('./define-env');

function getRendererPreset({ rootDir, env, mode }) {
  return {
    target: 'web',
    mode,
    entry: path.resolve(rootDir, 'src/renderer/index.js'),
    output: {
      path: path.resolve(rootDir, 'app/renderer'),
      filename: 'index.js',
      publicPath: './',
      assetModuleFilename: 'assets/[name].[hash:8][ext][query]',
    },
    resolve: { extensions: ['.js', '.mjs', '.cjs', '.json'] },
    devtool: mode === 'development' ? 'source-map' : false,
    module: {
      rules: [
        { test: /\.(png|jpe?g|gif|svg|webp|avif)$/i, type: 'asset/resource' },
        { test: /\.(woff2?|eot|ttf|otf)$/i, type: 'asset/resource' },
        { test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i, type: 'asset/resource' },
      ],
    },
    plugins: [
      defineEnvPlugin(env),
      new HtmlWebpackPlugin({
        template: path.resolve(rootDir, 'src/renderer/index.html'),
        inject: true,
      }),
    ],
  };
}

module.exports = { getRendererPreset };
```

- [ ] **Step 4.4：跑测试确认通过**

Run: `npx jest tests/unit/presets-renderer.test.js`
Expected：PASS。

- [ ] **Step 4.5：补"无 externals / 无 libraryTarget"测试**

```js
test('不设 externals（renderer 跑在 Chromium，不外置 electron）', () => {
  const cfg = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
  expect(cfg.externals).toBeUndefined();
});

test('不设 output.libraryTarget（renderer 不是 CJS 库）', () => {
  const cfg = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
  expect(cfg.output.libraryTarget).toBeUndefined();
});
```

- [ ] **Step 4.6：补 html-webpack-plugin 配置测试**

```js
test('plugins 含 HtmlWebpackPlugin，模板路径正确，inject=true', () => {
  const cfg = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
  const html = cfg.plugins.find((p) => p instanceof HtmlWebpackPlugin);
  expect(html).toBeDefined();
  expect(html.userOptions.template).toBe(path.resolve(ROOT, 'src/renderer/index.html'));
  expect(html.userOptions.inject).toBe(true);
});
```

> `HtmlWebpackPlugin` 5.x 把构造入参挂在 `plugin.userOptions` 上，是稳定的内部字段。

- [ ] **Step 4.7：补"DefinePlugin 行为与 main 一致"回归**

```js
test('plugins 含 DefinePlugin，BC_ 前缀过滤生效', () => {
  const cfg = getRendererPreset({
    rootDir: ROOT,
    env: { BC_API: 'http://x', NODE_ENV: 'no' },
    mode: 'production',
  });
  const defPlugin = cfg.plugins.find((p) => p instanceof webpack.DefinePlugin);
  expect(defPlugin.definitions).toEqual({
    'process.env.BC_API': JSON.stringify('http://x'),
  });
});

test('devtool 按 mode', () => {
  const dev = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'development' });
  const prod = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
  expect(dev.devtool).toBe('source-map');
  expect(prod.devtool).toBe(false);
});

test('resolve.extensions 与 main / preload 一致', () => {
  const cfg = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
  expect(cfg.resolve.extensions).toEqual(['.js', '.mjs', '.cjs', '.json']);
});
```

- [ ] **Step 4.8：跑全部 renderer 测试**

Run: `npx jest tests/unit/presets-renderer.test.js`
Expected：7 passed。

- [ ] **Step 4.9：提交 Task 4**

```bash
git add src/config/presets/renderer.js tests/unit/presets-renderer.test.js
git commit -m "feat(M4): getRendererPreset — web 进程 + HtmlWebpackPlugin + publicPath ./"
```

---

## Task 5：index.js 汇出 + API 表面 smoke test

**Files:**
- Create: `src/config/presets/index.js`
- Test: `tests/unit/presets-index.test.js`

### 接口契约

```js
const { getMainPreset, getPreloadPreset, getRendererPreset, defineEnvPlugin } = require('src/config/presets');
```

- [ ] **Step 5.1：写 API 表面测试**

```js
// tests/unit/presets-index.test.js
describe('presets/index 汇出', () => {
  test('四个 API 都是 function', () => {
    const mod = require('../../src/config/presets');
    expect(typeof mod.getMainPreset).toBe('function');
    expect(typeof mod.getPreloadPreset).toBe('function');
    expect(typeof mod.getRendererPreset).toBe('function');
    expect(typeof mod.defineEnvPlugin).toBe('function');
  });

  test('三 getter 入参一致 { rootDir, env, mode }、出参均为对象', () => {
    const { getMainPreset, getPreloadPreset, getRendererPreset } =
      require('../../src/config/presets');
    const args = { rootDir: '/tmp/proj', env: { BC_X: '1' }, mode: 'production' };
    for (const get of [getMainPreset, getPreloadPreset, getRendererPreset]) {
      expect(typeof get(args)).toBe('object');
    }
  });
});
```

- [ ] **Step 5.2：跑测试确认失败**

Run: `npx jest tests/unit/presets-index.test.js`
Expected：FAIL，模块不存在。

- [ ] **Step 5.3：写 index 汇出**

```js
// src/config/presets/index.js
const { getMainPreset } = require('./main');
const { getPreloadPreset } = require('./preload');
const { getRendererPreset } = require('./renderer');
const { defineEnvPlugin } = require('./define-env');

module.exports = {
  getMainPreset,
  getPreloadPreset,
  getRendererPreset,
  defineEnvPlugin,
};
```

- [ ] **Step 5.4：跑测试确认通过**

Run: `npx jest tests/unit/presets-index.test.js`
Expected：2 passed。

- [ ] **Step 5.5：跑全套 M4 测试**

Run: `npx jest tests/unit/presets-`
Expected：所有 presets-* 文件全绿（5 + 6 + 6 + 7 + 2 = 26 passed，外加 M3 既有用例不受影响）。

也可以一次性跑：
Run: `npm test`
Expected：M3（9） + M4（26）= 35 个 case 全绿。

- [ ] **Step 5.6：提交 Task 5**

```bash
git add src/config/presets/index.js tests/unit/presets-index.test.js
git commit -m "feat(M4): presets/index 汇出三 getter + defineEnvPlugin"
```

---

## Self-Review

按 spec 逐项核查：

| Spec 章节 | 要求 | 覆盖在哪 |
|-----------|------|----------|
| §一 定位 | 只承载构建结构 / Asset Modules / DefinePlugin；不含 babel/ts/vue 等 | Task 2/3/4 实现里只有这三类，无其他 loader |
| §二 接口 | 三 getter 入参 `{ rootDir, env, mode }` | Task 2/3/4/5 |
| §二 接口 | 三 getter 各自独立产出完整预设，不共享中间层 | 三文件各自完整列出 mode/devtool/resolve/AssetModules/DefinePlugin（实现里没有共享 helper） |
| §二 接口 | `defineEnvPlugin` 是复用的纯函数 | Task 1 |
| §三 三进程骨架 | target / entry / output / externals / resolve | Task 2/3/4 |
| §三 入口页面 | renderer 内置 html-webpack-plugin，模板 `src/renderer/index.html`，inject | Task 4 Step 4.6 |
| §四 devtool | dev → source-map；其他 → false | Task 2/3/4 |
| §五 Asset Modules | 三 rules（图片/字体/媒体）+ `output.assetModuleFilename` | Task 2/3/4 |
| §五 Asset Modules | 一律 `asset/resource`，不做 base64 | Task 2/3/4 实现里全为 `asset/resource` |
| §六 DefinePlugin | 只注入 `BC_` 前缀 | Task 1 Step 1.5 |
| §六 DefinePlugin | 逐键定义 `process.env.<key>`，不整体替换 `process.env` | Task 1 Step 1.5 |
| §六 DefinePlugin | 三进程注入同一份 BC_ 子集 | Task 2/3/4 plugins 测试均覆盖 BC_ 过滤 |
| §七 模块边界 | M4 不读 `.env`、不合并用户配置、不起 devServer | 实现仅依赖 `path/webpack/html-webpack-plugin/defineEnvPlugin`，不碰 fs / merge / devServer |
| §八 文件结构 | `main.js` / `preload.js` / `renderer.js` / `index.js` | Task 2/3/4/5；`define-env.js` 拆出为微调（已在卷首声明） |

**Placeholder 扫描**：无 TBD / TODO。代码块全部完整。

**类型一致性**：
- `getMainPreset / getPreloadPreset / getRendererPreset({ rootDir, env, mode })` 三处签名一致；
- `defineEnvPlugin(env) → webpack.DefinePlugin` 在 Task 1 定义、Task 2/3/4 内部 require 使用、Task 5 汇出 —— 一致。

**模块边界**：M4 仅 `require` `path` / `webpack` / `html-webpack-plugin` / 同目录 `./define-env`；不 `require` M3 的 env 模块（env 对象通过参数传入）、不 `require` `webpack-merge`、不 `require` `fs`。

---

## 验收

完成本 plan 后：
- `npm test` 全绿（≥ 35 个 case）
- `node -e "console.log(require('./src/config/presets').getMainPreset({ rootDir: '/tmp/proj', env: { BC_API: 'http://x' }, mode: 'development' }))"` 能输出合法 webpack 配置对象
- API 表面：`{ getMainPreset, getPreloadPreset, getRendererPreset, defineEnvPlugin }` 与 spec 一致
- `defineEnvPlugin` 的 `BC_` 过滤、逐键定义行为已被测试锁定
