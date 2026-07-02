# frame 分发形态与依赖分层重整（设计）

**日期**：2026-07-01
**范围**：`@base-client/frame` 的构建方式、依赖分层、模块解析加载
**背景**：frame 尚未真正发布（version 0.0.1），无迁移路径 / 兼容层负担；本次目标是让"本地构建工具"的语义在分发形态与依赖分层上都保持清晰、诚实。

---

## 1. 目标与约束

### 1.1 目标

围绕两个疑问收敛出统一的设计：

1. frame 源码是否需要构建？—— **不构建**
2. 依赖如何分层？—— 以 **"API 消费深度 + 版本兼容真实性"** 为唯一判据重整

### 1.2 分层判据（本次确立）

> **peerDep 只声明"深 API 消费 + 有真实版本兼容关系"的依赖**。仅"发现可执行文件"或"调用一两个稳定函数"的依赖，不写 peerDep，只在 keywords / description 里说明用途。

三条：

- **只 spawn 可执行文件 / 只查包位置**：无 peerDep（例：electron）
- **API 消费但耦合极薄（一两个稳定函数）**：无 peerDep（例：electron-builder、bytenode）
- **API 消费深（多个 API + 插件系统）**：peerDep + 窄 range（例：webpack、webpack-dev-server）

### 1.3 约束

- 不引入新的对外 API 破坏（`src/index.js` 导出的 `createCli / MODES / TARGETS / replace / customMerge / logger` 保持）
- 测试全部现有用例通过；改动涉及的部分补齐新增用例
- 本次不重构架构（不做 CLI 化、不改 config 合并职责）

### 1.4 范围外（记录不修）

| 事项 | 原因 |
|---|---|
| bytenode 编译时用宿主 Node V8 vs 运行时 Electron V8 可能不匹配 | 独立于依赖分层的隐藏 bug，需另行处理 |
| `tests/unit/e2e-dev-web.test.js` 单跑超时 | `TODOs.md` 已记录 |
| 龙芯 electron 镜像源 | `TODOs.md` 已记录 |

---

## 2. 不构建方案

### 2.1 判据

- frame 源码已经是 CJS（`type: "commonjs"` + `require`），rollup 的转换价值仅剩"合并 + externals + copy 模板"
- 报错堆栈真实、便于阅读源码、少一层构建配置心智负担
- 构建工具类项目"自己给自己打包"通常是过度工程（webpack / rollup / babel 自身核心包都不打包分发）

### 2.2 改动清单

| 位置 | 现状 | 改为 |
|---|---|---|
| `package.json:main` | `dist/index.js` | `src/index.js` |
| `bin/base-client.js` | `require('../dist/cli')` | `require('../src/cli')` |
| `package.json:files` | `["bin", "dist"]` | `["bin", "src"]` |
| `package.json:scripts` | 含 `build`, `prepublishOnly` | 删除这两条 |
| `package.json:devDependencies` | 含 6 个 rollup 相关 | 删除 |
| `rollup.config.mjs` | 存在 | 删除 |
| `dist/` 目录 | 构建产物（tracked） | `.gitignore` + 删除已 track 文件 |

### 2.3 无感兼容

- **templates 路径**：`src/pack/shell.js` 里 `path.join(__dirname, '../templates/shell')` 天然指向 `src/templates/shell`，无需改代码
- **测试**：所有测试文件已直接 `require('../../src/...')`，零改动
- **对外 API**：`src/index.js` 已完整导出所有公开成员

### 2.4 成本

包体积从 rollup bundle 转为约 20 个源文件，多几十 KB；CLI 冷启动多几个 require——量级都可忽略。

---

## 3. 依赖分层重整

### 3.1 sharp → jimp

- **原因**：sharp 是 native binding（~40MB + 装失败常见），只用于 icon 自适配
- **替代**：jimp 纯 JS，~3MB，无 native binding
- **调用点改造**：`src/pack/icon.js:25` 的 `sharp(sourceBuf).resize(size, size).png().toBuffer()` 换成 `(await Jimp.read(sourceBuf)).resize(size, size).getBufferAsync(Jimp.MIME_PNG)`

### 3.2 electron / electron-builder / bytenode 从 peerDep 移除

按 1.2 判据：

| 依赖 | frame 消费方式 | 分层结论 |
|---|---|---|
| `electron` | `resolve-electron.js` 只拿路径 → spawn 可执行文件 | 无 peerDep |
| `electron-builder` | `pack.js:83` / `installer.js:46` 只调 `.build(options)`，参数用极稳定字段 | 无 peerDep |
| `bytenode` | `pack/bytenode.js` 只调 `.compileFile({filename, output})` | 无 peerDep |

三者的存在性检查在运行时通过 `resolveModule` 抛错提示用户安装。

**keywords 补充**：`["electron", "electron-builder", "bytenode", "webpack", "build", "packager", "cli"]`

### 3.3 保留 webpack / webpack-dev-server peerDep

按 1.2 判据：Compiler API + plugin 系统属于深 API 消费，`^5.0.0` range 反映真实兼容关系。

### 3.4 devDep 清理

**删除**（6 项，本次改动决定）：
- `@rollup/plugin-commonjs`
- `@rollup/plugin-json`
- `@rollup/plugin-node-resolve`
- `rollup`
- `rollup-plugin-copy`
- `rollup-plugin-node-externals`

**保留**：`html-webpack-plugin`（测试 fixture 的 bc.config.js 里 require）、`jest`、`webpack`、`webpack-dev-server`

### 3.5 engines

新增 `"engines": { "node": ">=18.12.0" }` — 与 webpack-dev-server 5 的 Node 下限对齐，明确 frame 支持范围。

### 3.6 最终 package.json（依赖相关字段）

```jsonc
{
    "type": "commonjs",
    "main": "src/index.js",
    "bin": { "base-client": "./bin/base-client.js" },
    "engines": { "node": ">=18.12.0" },
    "files": ["bin", "src"],
    "keywords": ["electron", "electron-builder", "bytenode", "webpack", "build", "packager", "cli"],
    "scripts": {
        "test": "jest",
        "test:watch": "jest --watch"
    },
    "dependencies": {
        "@electron/asar":  "^3.4.1",
        "cac":             "^6.7.14",
        "dotenv":          "^17.4.2",
        "fs-extra":        "^11.3.5",
        "jimp":            "^0.22.0",
        "ora":             "^5.4.1",
        "picocolors":      "^1.1.1",
        "png2icons":       "^2.0.1",
        "webpack-merge":   "^6.0.1"
    },
    "peerDependencies": {
        "webpack":            "^5.0.0",
        "webpack-dev-server": "^5.0.0"
    },
    "devDependencies": {
        "html-webpack-plugin": "^5.6.3",
        "jest":                "^30.4.2",
        "webpack":             "^5.107.2",
        "webpack-dev-server":  "^5.2.4"
    }
}
```

### 3.7 用户升级影响

从旧版本升级到本版本的用户：
- 若曾装 sharp 作为传递依赖：需手动 `npm rm sharp`
- 若曾装 electron / electron-builder / bytenode：不受影响（本来就是用户自装）
- 版本 0.0.1 未正式发布，实际不存在存量用户

---

## 4. `resolveModule` — 统一的模块解析加载

### 4.1 目标

- 收敛 `resolve-electron.js` / `resolve-electron-builder.js` / `pack/bytenode.js` 中三份重复的"resolve + 校验 relative + existsSync + delete require.cache"逻辑
- 处理 ESM 迁移风险（`ERR_REQUIRE_ESM` + Windows 绝对路径 `file://` scheme）
- 采用 options 化接口，便于未来扩展

### 4.2 新增 `src/core/resolve-module.js`

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

### 4.3 三处消费点

#### 4.3.1 `src/electron/resolve-electron.js`

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

#### 4.3.2 `src/electron/resolve-electron-builder.js`

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

#### 4.3.3 `src/pack/bytenode.js` 内部

```js
const { resolveModule } = require('../core/resolve-module');

async function bytenodeMain({ rootDir, appDir, mergedBuilderConfig }) {
    const bytenode = await resolveModule('bytenode', {
        rootDir,
        missingHint: '[base-client] bytenode 未安装，请在项目中 npm i -D bytenode',
        esmCompat: true,
        clearRequireCache: true,
    });
    // 后续 bytenode.compileFile / fs 逻辑不变
}
```

### 4.4 调用点级联影响

三处 resolve 全部返回 Promise，消费方加 `await`：

| 文件 | 现状 | 改为 |
|---|---|---|
| `src/cli/commands/dev-app.js:70` | `const electronExe = resolveElectron(rootDir);` | `const electronExe = await resolveElectron(rootDir);` |
| `src/cli/commands/pack.js:83` | `const builder = resolveElectronBuilder(rootDir);` | `const builder = await resolveElectronBuilder(rootDir);` |
| `src/cli/commands/installer.js:46` | `const builder = resolveElectronBuilder(rootDir);` | `const builder = await resolveElectronBuilder(rootDir);` |

三处 action 本来就是 async，`await` 无痛。

### 4.5 平台兼容说明

- **Dynamic `import()`**：Node 13.2+ stable；本项目 Node 下限 18.12+ 无风险
- **Windows 绝对路径**：`import(pathToFileURL(entryPath).href)` 是**强制要求**（否则 `ERR_UNSUPPORTED_ESM_URL_SCHEME`）
- **`url.pathToFileURL`**：Node 10.12+ 可用

---

## 5. 测试策略

### 5.1 保留原有测试

现有 `tests/unit/**/*.test.js` 与 6 个 e2e 用例保持通过。

### 5.2 新增 `tests/unit/core/resolve-module.test.js`

覆盖 5 条路径：

| 路径 | 断言 |
|---|---|
| 不传 `rootDir` | 使用 `process.cwd()` 解析 |
| 包不存在 | 抛出 `missingHint` |
| 包位于上游 node_modules（`relative` 出错）| 抛出 `missingHint` |
| CJS 包 | 正常返回 exports |
| ESM 包（fixture 假 ESM 包） | 走 dynamic import 分支返回 default |

### 5.3 修改的 async 断言

- `tests/unit/electron/resolve-electron.test.js`（如存在）
- `tests/unit/electron/resolve-electron-builder.test.js`

改为 `await expect(...).resolves` / `.rejects` 断言。

---

## 6. 验收 & 回退

### 6.1 验收标准

| # | 检查项 |
|---|---|
| 1 | `dist/` 被 `.gitignore`，仓库内无遗留 dist 文件 |
| 2 | `npm test` 全绿 |
| 3 | `resolve-module.test.js` 覆盖 5 条路径 |
| 4 | fixture 上手工 e2e：dev:web / dev:app / build / pack / installer / child 六条命令跑通 |
| 5 | jimp 替换 sharp 后，`build/icon.png` → `dist/icons/{icon.ico, icon.icns, 16-1024.png}` 全套生成 |
| 6 | `npm i @base-client/frame` 只装 direct dep + 传递依赖，不装 electron / electron-builder / bytenode |
| 7 | 缺 electron 时 dev:app 报"未找到 electron 包"；缺 electron-builder 时 pack 报明确提示 |

### 6.2 手工 e2e 验证流

```bash
cd tests/fixtures/minimal-app     # 或另建临时 fixture
npm i electron@22.3.1 electron-builder@24 bytenode@1.5.0 webpack webpack-dev-server
npx base-client dev:web
npx base-client build
npx base-client dev:app
npx base-client pack --platform win --arch x64 --dir
npx base-client installer --platform win --arch x64
```

### 6.3 回退方案

因本次改动**在真正发布之前**，回退成本极低：`git revert` 到本次改动前的 commit 即可。无用户存量数据 / API 兼容性负担。
