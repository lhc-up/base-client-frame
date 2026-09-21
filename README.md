# @base-client/frame

**Electron 客户端工程化构建框架**。提供 `base-client` CLI，把 Electron 项目的开发、构建、加密、打包、安装器产出收敛为六个命令；业务项目只需提供 `bc.config.js` 与 `electron-builder.config.js`。

包边界为显式导出：库侧只有根聚合入口 `@base-client/frame` 与 `@base-client/frame/package.json` 可解析，内部模块（`src/pack`、`src/cli/commands` 等）不提供包路径导入。

## 命令

| 命令 | target / mode | 说明 |
|---|---|---|
| `dev:web` | web / development | 启动 webpack-dev-server 调试纯 web 产物 |
| `build` | web / production | 产出 web 发布包 |
| `dev:app` | app / development | 编译 main/preload/renderer 并拉起 Electron 联调 |
| `pack` | app / production | 完整打包：资源准备 → 代码构建 → 加密/增量/bytenode → electron-builder |
| `installer` | app / production | 复用上次 `pack --dir` 的 unpacked 目录，只产出安装器 |
| `child` | app / production | 产出子进程包（独立 asar + descriptor） |

全局选项：`--env <name>`（加载 `.env.<name>`，默认 `prod`）、`--config <path>`（指定 bc.config）、`--pack-config <path>`（指定 electron-builder.config）、`--debug`（出错附 stack）。

## bc.config.js 契约

`bc.config.js` 导出对象或 `(ctx) => config` 函数：

```js
module.exports = ctx => ({
    web: { /* webpack 配置片段，target=web 时使用 */ },
    main: { /* main 进程 webpack 片段 */ },
    preload: { /* preload webpack 片段 */ },
    renderer: { /* renderer webpack 片段或多入口数组 */ },
    encrypt: { iv: 'xxxxxxxxxxxxxxxx' },   // 可选，显式指定 16 字节 ASCII IV
    bytenode: false,                        // 可选，关闭主进程字节码编译
    incremental: false,                     // 可选，关闭增量 .asax 产物
});
```

合并规则：frame 预设为基础，用户片段经 `webpack-merge` 覆盖合并；`renderer` 支持多入口数组（`mergeConfigList`）。预设内置 `__BC_BUILD__` 构建信息注入与 `BC_*` 环境变量注入。

## 库入口

```js
const {
    MODES, TARGETS,       // 'development'/'production'、'app'/'web' 常量
    createCli, runCommand, // CLI 装配与单命令执行
    replace, customMerge,  // 配置合并工具
    logger,                // 构建期日志
} = require('@base-client/frame');
```

## 产物契约

构建产物的稳定格式分别由三份契约文档定义：

- `docs/crypto-artifact-contract.md` — AES-256-CBC 加密产物的算法、key/IV、文件范围与 descriptor 语义
- `docs/bytenode-artifact-contract.md` — bytenode 字节码产物的构建依赖与安装包形态
- `docs/build-target-resolution-contract.md` — `--platform/--arch` 解析与 unpacked 目录命名

## 环境与依赖

- Node `>=18.12.0`
- 必需 peer：`webpack@^5`、`webpack-dev-server@^5`
- 可选 peer：`electron`（dev:app/pack 期）、`electron-builder`（pack/installer）、`bytenode`（开启字节码时）

## 设计文档

- `docs/design/architecture.md` — 分层架构与核心不变量
- `docs/design/known-limitations.md` — 已知限制