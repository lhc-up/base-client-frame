# Frame M7：pack 命令（详细设计）

> 所属：[Frame 总设计](./2026-05-28-frame-overview-design.md) 的 M7 模块。

## 一、定位

M7 是命令执行层的发布侧，mode 固定 `production`（M1 隐含）：

- `pack`：基于生产构建产物，调用 electron-builder 产出指定平台 / 架构的安装包（或免安装目录），可选代码签名。

pack 内部自动复用 M6 build 流程作为前置（清空 `app/` + 三进程生产构建），构建完成后调 electron-builder 的 programmatic API 完成打包。配置由 frame pack 预设与用户 `electron-builder.config.js` 深合并产出。

M7 不负责：webpack 三进程构建本身（M6 build 流程）、配置预设以外的产物语义（如 shell 钩子路径，由 user 自由写）、发布上传。

## 二、用户配置形态

`electron-builder.config.js` 是 M7 与用户项目之间的**打包配置契约**，统一导出一个函数 `(ctx) => config`：

```js
// 项目根 electron-builder.config.js
module.exports = ({ command, mode, env, cliOptions, replace }) => ({
  appId: 'com.foo.bar',
  productName: 'FooBar',
  win: {
    icon: 'resource/icons/icon.ico',
    requestedExecutionLevel: 'highestAvailable',
    ...(cliOptions.sign ? {
      signingHashAlgorithms: ['sha256'],
      certificateFile: 'resource/cert/public-key.pfx',
      certificatePassword: env.WIN_CODE_SIGN_PWD,
      rfc3161TimeStampServer: 'http://timestamp.digicert.com',
    } : {}),
  },
  extraResources: [
    { from: 'resource/icons', to: 'icons' },     // 默认追加到预设之上
  ],
  files: replace(['package.json', '!**/node_modules/**']),   // 整组替换预设的 files
});
```

返回值即官方 electron-builder Configuration 对象，无额外嵌套层。

`ctx` 字段：

| 字段 | 取值 | 含义 |
|------|------|------|
| `command` | `'pack'` | 当前命令名 |
| `mode` | `'production'` | 命令隐含 |
| `env` | 对象 | 解析后的环境变量（M3 提供） |
| `cliOptions` | 对象 | 本次命令的 CLI 参数（含 `platform` / `arch` / `unpack` / `sign` 等） |
| `replace` | `(arr) => taggedArr` | 标记数组字段"整组替换预设值"（见第四节） |

### 配置定位

1. 默认在 `process.cwd()` 探测 `electron-builder.config.{js,mjs,cjs}`。
2. 若 pack 命令带 `--pack-config <path>`（pack 专属选项，见第五节），改用指定路径。
3. **配置文件必需**：既无 `--pack-config`、cwd 也无 `electron-builder.config.*` 时，抛错 `未找到 electron-builder.config.js`，由 M1 `runCommand` 统一报告。

不复用 M1 全局 `--config <path>`：M1 `--config` 始终指向 `bc.config.js`（pack 内部经 `runProductionBuild` 也会用到），electron-builder 的配置走独立 `--pack-config`。两份配置两个 flag、语义互不抢占。

## 三、预设字段（getPackPreset）

frame 在合并前先计算一份预设 electron-builder 配置，作为用户配置覆盖的基线。

```js
function getPackPreset({ rootDir, env, mode, cliOptions, pkgJson }) {
  const year = new Date().getFullYear();
  const author = pkgJson.author ?? '';

  return {
    // ── A. 产物布局（frame 强约定，与 build 产物结构对齐）──────────────
    directories: { output: 'dist' },
    files: [
      { from: 'app', to: '.' },               // build 落 app/，安装包根下平铺
      'package.json',
      '!**/node_modules/**',
    ],
    extraMetadata: { main: 'main/index.js' },   // 安装包内的 electron 入口

    // ── B. pkgJson 派生默认（user 可覆盖）─────────────────────────────
    // appId：故意不设默认。产品身份是发布级强标识，必须由 user 在 electron-builder.config 中显式声明，
    //        缺失时由 electron-builder 自身校验报错（"appId is required"）。frame 不替 user 决定。
    productName: pkgJson.productName ?? pkgJson.name,
    copyright: `Copyright © ${year} ${author}`,
    artifactName: '${productName}_${os}_${arch}_${env.BC_ENV}_v${version}.${ext}',

    // ── C. 架构参数化（loong64 mirror，cli 选了 loong64 才注入）──────
    ...(cliOptions.arch === 'loong64' ? {
      electronDownload: {
        version: '22.3.27',
        mirror: 'http://ftp.loongnix.cn/electron/LoongArch/',
        customDir: 'v22.3.27',
        platform: 'linux',
        arch: 'loong64',
      },
      electronVersion: '22.3.27',
    } : {}),
  };
}
```

### 字段说明

| 字段 | 来源 | 用户能否覆盖 | 说明 |
|------|------|--------------|------|
| `directories.output` | A | 可（少见） | 安装包落 `dist/` |
| `files` | A | 可（用 `replace` 整组覆盖最稳） | 把 `app/` 拍平到安装包根 |
| `extraMetadata.main` | A | 可（少见） | 覆盖 package.json 的 main 字段，指向安装包内 `main/index.js` |
| `appId` | — | **必填** | 预设不提供默认；user 必须在 `electron-builder.config` 显式声明（如 `com.foo.bar`），缺失时由 electron-builder 报错 |
| `productName` | B | 可 | `pkgJson.productName ?? pkgJson.name` |
| `copyright` | B | 可 | 按 author 自动生成 |
| `artifactName` | B | 可 | 默认带 BC_ENV 维度，便于多环境产物并存 |
| `electronDownload` / `electronVersion` | C | 可 | 仅 `--arch loong64` 时注入龙芯镜像；其它架构默认不出现 |

### 不入预设的字段

平台特定的 `win` / `mac` / `linux` / `nsis` / `dmg` / `deb`（含 `extraResources`、`shortcutName`、`icon`、`maintainer`、`fpm` 等），由 user 在 `electron-builder.config.js` 自行写。frame 不为这些字段提供任何路径约定或目录默认。

## 四、合并语义

frame 把 `getPackPreset(...)` 与用户配置返回值做深合并，输出最终 electron-builder 配置：

```
mergedConfig = customMerge(preset, userConfig)
```

### 默认行为

| 值类型 | 行为 |
|--------|------|
| 标量（string / number / boolean） | 用户值覆盖预设值 |
| 普通对象 | 递归深合并 |
| 数组 | 预设数组 ⊕ 用户数组（**追加**，与 M2 一致） |

数组追加意味着用户写 `extraResources: [{ from: 'resource/icons', to: 'icons' }]` 时，预设的相关数组（若有）不会被丢失，而是接在后面。

### `replace` 标记：整组替换

数组追加是默认行为；当用户希望"完全接手某个数组字段、不要预设贡献"时，用 ctx 的 `replace` 工具：

```js
files: replace(['package.json', '!**/node_modules/**']),
```

### 实现细节

`replace` 把"替换意图"作为不可枚举的 Symbol 标记挂在数组上，使返回值**仍是数组**、不出现奇怪的中间对象类型：

```js
const REPLACE = Symbol('$replace');

function replace(arr) {
  const tagged = arr.slice();
  tagged[REPLACE] = true;
  return tagged;
}

function customMerge(preset, user) {
  return mergeWithCustomize({
    customizeArray: (presetArr, userArr) => {
      if (userArr && userArr[REPLACE]) return Array.from(userArr);   // 整组替换
      return [...(presetArr || []), ...(userArr || [])];             // 默认追加
    },
  })(preset, user);
}
```

- 用户视角：写 `files: replace([...])` 即可，无需关心 Symbol。
- 信号仅 frame 合并阶段消化，不泄漏到 electron-builder。
- 数组追加策略与 M2 同源（`webpack-merge` 的 `mergeWithCustomize`）。

## 五、pack 命令

### 流程

```
① resolvePackConfig({ env, mode:'production', command:'pack', cliOptions })
   ├─ 加载用户 electron-builder.config.js（必需，找不到抛错）
   ├─ userConfig = userFn({ command, mode, env, cliOptions, replace })
   ├─ preset = getPackPreset({ rootDir, env, mode, cliOptions, pkgJson })
   └─ mergedConfig = customMerge(preset, userConfig)
② runProductionBuild({ env, command:'pack', cliOptions })  // M6 共享步骤：清空 app/ + 三进程生产构建
③ electronBuilder = require(resolveElectronBuilder(rootDir))
④ targets = buildTargets(cliOptions)
⑤ await electronBuilder.build({ ...targets, config: mergedConfig })
```

① 放在 ② 之前，使 user config 问题（未找到、函数体抛错、平台 / 架构非法）能**快速失败**，不浪费一次完整构建的时间。

### resolvePackConfig

```js
function resolvePackConfig({ env, mode, command, cliOptions }) {
  const rootDir = process.cwd();
  const pkgJson = require(path.resolve(rootDir, 'package.json'));
  const raw = loadPackUserConfig(rootDir, cliOptions.packConfig);   // 接入 --pack-config；找不到抛错
  const userConfig = raw({ command, mode, env, cliOptions, replace });
  const preset = getPackPreset({ rootDir, env, mode, cliOptions, pkgJson });
  return customMerge(preset, userConfig);
}
```

`rootDir` 取 `process.cwd()`、`pkgJson` 由 `rootDir/package.json` 读取，与 M2 `resolveBuildConfig` 同源。`loadPackUserConfig` 优先用 `cliOptions.packConfig`（`--pack-config` 解析后的值），否则走 cwd 探测，找不到抛错。

### targets 推导（buildTargets）

```js
const platformMap = { win: ['nsis'], mac: ['dmg'], linux: ['deb'] };
const archList = ['ia32', 'x64', 'armv7l', 'arm64', 'universal', 'loong64'];

function buildTargets({ platform, arch, unpack }) {
  if (!platform) throw new Error('缺少 --platform');
  if (!platformMap[platform]) throw new Error(`不支持的平台：${platform}`);
  if (!arch) throw new Error('缺少 --arch');
  if (!archList.includes(arch)) throw new Error(`不支持的架构：${arch}`);

  return { [platform]: unpack ? ['dir'] : platformMap[platform], [arch]: true };
}
```

输出形态直接对应 electron-builder programmatic API 的 `CliOptions`：`{ win: [...], x64: true, ... }`。

### resolveElectronBuilder

```js
function resolveElectronBuilder(rootDir) {
  try {
    return require.resolve('electron-builder', {
      paths: [path.join(rootDir, 'node_modules')],
    });
  } catch {
    throw new Error('electron-builder 未安装，请在项目中 npm i -D electron-builder');
  }
}
```

electron-builder **不**列入 frame 的 `dependencies` / `peerDependencies`；按需从用户项目 `node_modules` 解析，未装即报。与 M5 / M6 的 `resolveElectron` 同款模式。

### 失败处理

任一阶段抛错 → 由 M1 `runCommand` 统一报告、退出码 `1`。electron-builder 自身的错误诊断（缺证书、签名失败、平台兼容性等）已携带完整堆栈，frame 不再额外包装。

### 命令选项

| flag | 必选 | 含义 |
|------|------|------|
| `--env <name>` | 是（M1 全局） | 指定 `.env.<name>` |
| `--config <path>` | 否（M1 全局） | 指定 `bc.config.js` 路径（pack 内部经 `runProductionBuild` 调 `resolveBuildConfig` 时使用） |
| `--pack-config <path>` | 否（pack 专属） | 指定 `electron-builder.config.js` 路径；未传则在 cwd 探测 |
| `--platform <win\|mac\|linux>` | 是 | 目标平台 |
| `--arch <ia32\|x64\|armv7l\|arm64\|universal\|loong64>` | 是 | 目标架构 |
| `--unpack` | 否（boolean） | 产出免安装目录（不打 installer） |
| `--sign` | 否（boolean） | 触发签名；具体证书等字段由 user config 函数读 `cliOptions.sign` 自行注入 |

`--config` 与 `--pack-config` **语义互不抢占**：前者始终指 webpack 用的 `bc.config.js`，后者始终指 electron-builder 用的 `electron-builder.config.js`。

后续新增选项按 M1 命令模板的 `options` 数组追加即可。

## 六、模块边界

### 命令接口

| 方向 | 接口 | 说明 |
|------|------|------|
| M1 → M7 | `action(ctx)`，`ctx = { cliOptions, env, mode, command }` | 命令派发入口 |
| M7 → M6 | `runProductionBuild({ env, command:'pack', cliOptions })` | M6 共享步骤，pack 内部前置调用 |
| M7 → M2 | 间接（经 `runProductionBuild` 内调 `resolveBuildConfig`） | 三进程构建配置 |
| M7 → M3 | 间接（经 `ctx.env`） | 解析后的 env 对象 |

### M7 自有接口

| 函数 | 角色 |
|------|------|
| `resolvePackConfig({ env, mode, command, cliOptions })` | M7 对 pack 命令暴露的主接口，返回合并后的 electron-builder 配置 |
| `getPackPreset({ rootDir, env, mode, cliOptions, pkgJson })` | 内部，被 `resolvePackConfig` 调用 |
| `customMerge(preset, userConfig)` | 内部深合并 + 数组追加 + `REPLACE` Symbol 识别 |
| `buildTargets(cliOptions)` | 内部，cliOptions → electron-builder `CliOptions` 子集 |
| `resolveElectronBuilder(rootDir)` | 内部，按需解析用户项目的 electron-builder 模块入口 |

### M7 不负责

- webpack 构建（M6）
- bc.config.js 加载与合并（M2）
- env 加载（M3）
- CLI 解析与命令派发（M1）
- Electron 启动（M5 / M6；pack 阶段不启动 Electron）

## 七、文件结构

```
src/
├── cli/
│   ├── commands/
│   │   └── pack.js                # pack 命令定义（M1 命令模板）
│   └── utils/
│       └── electron-builder.js    # resolveElectronBuilder + buildTargets
└── config/
    ├── pack.js                    # resolvePackConfig + customMerge + replace（含 REPLACE Symbol）
    └── presets/
        └── pack.js                # getPackPreset
```

| 文件 | 职责 |
|------|------|
| `cli/commands/pack.js` | 命令模板 `{ name:'pack', description, mode:'production', options:[platform, arch, unpack, sign], action }`；action 编排 resolvePackConfig → build 流程 → resolveElectronBuilder → buildTargets → `electronBuilder.build` |
| `cli/utils/electron-builder.js` | `resolveElectronBuilder(rootDir)`、`buildTargets(cliOptions)` |
| `config/pack.js` | `resolvePackConfig(...)` 主接口、`customMerge`（`webpack-merge` customizer + `REPLACE` Symbol 识别）、`replace` 工具与 `REPLACE` Symbol |
| `config/presets/pack.js` | `getPackPreset(...)` 预设字段定义 |
