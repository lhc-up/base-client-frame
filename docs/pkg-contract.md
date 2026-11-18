# 宿主与包（pkg）产物契约

> 状态：设计稿，待评审。本文定义「宿主 + 包」模型下 frame 的构建产物与命令调整。
> 运行时如何加载由 toolkit `docs/design/host.md` 与业务仓库负责。frame **不依赖 toolkit**：与 toolkit 相关的配置都由业务项目在 bc.config 中接入。

## 1. 模型

任何客户端都由两部分组成：

| 部分 | 内容 | 更新方式 |
|---|---|---|
| 宿主（host） | 主进程入口、preload | 安装包 |
| 包（pkg） | 包主进程入口（业务能力）、页面 | 更新包（也随安装包内置一份） |

- 原来的「小版本增量包」与「child 子应用包」统一为**包**，分发产物统一叫**更新包**，只是被不同的宿主使用。
- 项目必须提供 `src/main/pkg.js`，不再支持原形态（安装包含全部产物 + 增量 `.asax`）。
- 版本号不拆分，沿用 semver 约定：只有 patch 变化时发更新包，其余变化重新安装。
- preload 属于宿主，随宿主版本发布。preload 只是桥接层，只装配 `appService` / `appNotice`，不写业务，一般不会变动；它的变动意味着通信协议或规则变化，必须更新宿主。
- 宿主自己的页面（如启动/升级页）从内置包中加载，随宿主版本发布，frame 不单独区分「宿主页面」。

## 2. 命令

| 命令 | 产物 | 说明 |
|---|---|---|
| `pack` | 安装包（宿主 + 内置包）+ 更新包 | 原增量包由更新包取代 |
| `pack --pkg-only` | 更新包 | 只构建包；取代原 `child` 命令（`child` 删除） |
| `dev:app` | 不变 | 宿主从 `app/` 目录直接加载包，页面仍走 dev server |
| `dev:app --pkg-only` | — | 只 watch 编译包主进程并启动页面 dev server，不启动 electron；供其他宿主联调加载（§9） |
| `installer` / `dev:web` / `build` | 不变 | |

## 3. 中间目录 `app/`

结构与现在一致，主进程多一个包入口：

```text
app/
├── main/index.js    # 宿主主进程
├── main/pkg.js      # 包主进程，commonjs2
├── preload/
└── renderer/
```

## 4. 产物

### 4.1 更新包

```text
dist/<name>-<env>-v<version>.asax
├── package.json      # 描述文件（§5）
├── main/pkg.js
└── renderer/
```

- `name` 即项目 `package.json` 的 `name`（经 `__BC_BUILD__.name`）。同一宿主可能使用多个包，文件名必须带 `name`。
- **分发名 `.asax`，落盘名 `.asar`**：dist 产物、上传、下载地址用 `.asax`；客户端下载后由 toolkit update 能力
  晋升为 `.asar`，内置包打进安装包时改名为 `.asar`。任何 Electron 程序（包括 VS Code）碰到 `.asar` 都会当作归档
  打开并持有句柄，Windows 下随后无法删除、覆盖 dist/；而 Electron 只有路径中出现 `.asar` 才能读取包内文件。

### 4.2 安装包

- `files`：`app/main/index.js`、`app/preload/**`；`extraMetadata.main` 不变（`main/index.js`）。
- 内置包：更新包改名为 `.asar` 放入 `resources/packages/`，宿主从这里读取内置包。业务额外内置的包（如其他客户端的包）也放入该目录，由业务的 electron-builder 配置追加。

## 5. 描述文件 `package.json`

沿用现有 descriptor 的全部字段（`name` / `productName` / `version` / `env` / `envName` / `buildTime` / `platform` / `arch` / `dir` / `sign` / `encrypted`），删除 `child`，新增入口字段：

| 字段 | 说明 |
|---|---|
| `main` | 包主进程入口，固定 `main/pkg.js` |
| `renderer` | 页面目录，固定 `renderer/` |

- 纯数据，宿主不执行包代码即可读取。
- 删除 `child`（同时删除 `__BC_BUILD__.child`）：同一个包可被任何宿主使用，不存在构建期的子应用形态。客户端身份由宿主在运行时告知包。

## 6. bc.config

根节点结构不变（`main` / `preload` / `renderer` / `web` …）：

- 主进程一次编译、两个入口：`src/main/index.js` → `app/main/index.js`（宿主），`src/main/pkg.js` → `app/main/pkg.js`（包）；`main` 片段同时作用于两者。`--pkg-only` 只保留包入口。
- 两个入口共用同一组构建常量（`__BC_BUILD__`）。包随更新包分发，包代码不得引用 `__BC_BUILD__.encryptKey` 或整体引用 `__BC_BUILD__`（加密方案中统一处理）。
- `renderer` 构建一次，产物整体进入包。

### 6.1 主进程 externals 改为数组

主进程预设的 externals 由对象改为数组：`[{ electron: 'commonjs electron' }]`。按现有合并规则数组与数组拼接，业务追加的 externals 函数才不会把 `electron` 覆盖掉。

toolkit 映射由业务接入：

```js
const { toolkitExternals } = require('@base-client/toolkit/build');
module.exports = () => ({
    main: { externals: [toolkitExternals] },
});
```

## 7. 流水线

### 7.1 `pack`

```text
清空 dist/ 与 app/
→ 计算 __BC_BUILD__
→ 编译 main（宿主 + 包）/ preload / renderer（并行）
→ 写描述文件 → 打更新包 → dist/
→ bytenode 宿主主进程（可选）
→ electron-builder（宿主 + 内置包）
```

### 7.2 `pack --pkg-only`

```text
清空 dist/ 与 app/
→ 计算 __BC_BUILD__
→ 编译包主进程 / renderer（并行）
→ 写描述文件 → 打更新包 → dist/
```

不编译宿主主进程与 preload，不调用 electron-builder。

## 8. 加密

本期包不加密，描述文件 `encrypted` 为 `false`。`bc.config.encrypt` 的适用范围在加密方案中统一设计。

## 9. 开发调试

| 场景 | 做法 |
|---|---|
| 日常开发（主路径） | 包在自己的宿主中开发：`dev:app` |
| 在其他宿主中联调 | 包侧 `dev:app --pkg-only`（watch 编译 `app/main/pkg.js` + 页面 dev server）；宿主侧通过开发环境覆盖项指定该包的目录与 dev server 地址（宿主业务实现）。页面改动热更新，主进程改动需重启宿主 |
| 兜底 | `pack --pkg-only` 打出更新包，放入宿主的下载目录 |

## 10. 发版

破坏性变更（删除 `child` 命令与 `child` 字段、externals 改为数组、更新包命名与扩展名）与 toolkit、业务项目同步发版；`docs/design/architecture.md` 在实现时同步更新。
