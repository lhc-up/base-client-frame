# Frame M3：环境变量（Env）详细设计

> 所属：[Frame 总设计](./2026-05-28-frame-overview-design.md) 的 M3 模块。

## 一、定位

M3 负责读取、合并项目的 `.env` 文件，产出环境变量对象。这个对象有两种用途：**全部变量**供构建期使用（`bc.config.js`、frame 流程），其中**以 `BC_` 开头的子集**经 `DefinePlugin` 注入三进程运行时 bundle。

## 二、文件分层与加载

按 dotenv 惯例分两层，均在项目根目录（`process.cwd()`）：

| 文件 | 作用 | 是否必需 |
|------|------|----------|
| `.env` | 所有环境共享的通用变量 | 可选 |
| `.env.<name>` | 环境特定变量（`name` 来自 `--env`，默认 `prod`） | **必需** |

- 合并顺序：`.env.<name>` 覆盖 `.env`（环境特定优先）。
- 只读项目目录这两类文件；**不读 frame 内置文件**，**不读系统 `process.env`**（系统环境变量由 frame 构建/打包流程按需直接消费，或由用户经途径 2 显式注入——见第六节）。

## 三、initEnv 接口

```js
const dotenv = require('dotenv');

function initEnv(envName = 'prod') {
  const base = readEnvFile('.env');                 // 可选；不存在则 {}
  const specific = readEnvFile(`.env.${envName}`);  // 必需；不存在则抛错
  return { ...base, ...specific };                  // 合并后的完整变量对象
}

function readEnvFile(file) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return null;               // 由调用方决定可选/必需
  return dotenv.parse(fs.readFileSync(p));          // 解析为对象，不写 process.env
}
```

- **纯函数**：用 `dotenv.parse` 读成对象、手动合并，**不写 `process.env`**。
- 返回**合并后的完整变量对象**（含 `BC_` 与非 `BC_`）。
- `envName` 来自 `cliOptions.env`（M1）。

## 四、存在校验

- `.env.<name>` 不存在（含默认 `prod`）→ 抛错，由 `runCommand` 统一报告（M1）。
- 通用 `.env` 不存在 → 跳过（可选层）。

## 五、变量可见性与注入

合并后的变量按可见性分两层：

| 可见性 | 范围 | 谁能用 |
|--------|------|--------|
| 全部变量 | `initEnv` 返回的完整对象 → `ctx.env` | **构建期**：`bc.config.js` 函数形态、frame 流程 |
| 仅 `BC_` 前缀 | 经 `DefinePlugin` 注入 `process.env.*` | **运行时**：三进程 bundle |

- **以 `BC_` 开头 → 注入三进程**：运行时代码读 `process.env.BC_XXX`，`DefinePlugin` 在构建时替换为字面量。
- **非 `BC_` → 不注入任何进程**：仅构建期可见，不进 bundle。
- **三进程统一规则**：main / preload / renderer 一律只注入 `BC_` 前缀变量（三者都可能被反编译，不分进程）。

注入动作（`DefinePlugin`）在 M4 的 preset 实现；M3 定**契约**：注入子集 = `key.startsWith('BC_')` 的键，注入形态为 `process.env.<key>`。preset 从 M3 返回的完整对象中过滤该子集。

## 六、三类变量及其去处（安全约定）

| 类别 | 例子 | 去处 | 进 bundle? |
|------|------|------|-----------|
| 运行时业务变量 | `BC_API_BASE`、`BC_ENV` | `.env.<name>`，自动注入 | 进 |
| 构建期常量（运行时要显示） | 版本号、构建时间 | 途径 2：`bc.config.js` 里自行 `DefinePlugin` | 进（故意） |
| 构建/打包期敏感密钥 | 签名证书密码、发布 token | **不注入**：frame 构建/打包流程（M7）直接读系统 `process.env` 消费 | 永不进 |

**警示**：敏感密钥不要写进 `.env.<name>` 并加 `BC_` 前缀——那会被注入到可反编译的客户端 bundle。密钥应走系统环境变量，由 frame 流程直接消费。

> 途径 2（`bc.config.js` 中自行 `new webpack.DefinePlugin(...)`）注入的值同样进 bundle，仅适合"可公开的运行时/构建期常量"，不适合密钥。

## 七、数据流

```
--env  →  initEnv(name)  →  读 .env + .env.<name> 合并  →  完整变量对象
                                                            ├─→ ctx.env（M2 传给 bc.config.js / frame 流程，全集）
                                                            └─→ M4 preset 过滤 BC_ 子集  →  DefinePlugin 注入三进程
```

## 八、模块边界

| 方向 | 接口 | 说明 |
|------|------|------|
| M1 → M3 | `initEnv(envName)` | 传入环境名，拿到完整 env 对象 |
| M3 → M2 | 完整 env 对象 | 经 `ctx.env` 提供给 `bc.config.js` 构建期使用 |
| M3 → M4 | 完整 env 对象 + 注入契约（`BC_` 子集 → `process.env.*`） | preset 据此用 `DefinePlugin` 注入 |

M3 **不负责**：`DefinePlugin` 的具体实现（M4）、敏感密钥的消费（M7）、命令执行（M5/M6/M7）。
