# Frame 已知限制

本文档只记录当前仍成立的限制与演进事项，已解决的问题不在此列。

## 已知限制

- **龙芯（loong64）打包需自备 Electron 镜像源**：frame 不内置镜像配置，构建节点需通过环境变量（如 `ELECTRON_MIRROR`）自行解决。
- **`BC_ENV_NAME` 无兜底且缺失时完全静默**：`applyBcEnvFallback` 只为 `BC_ENV` 提供 `--env` 默认值兜底（`src/cli/index.js:18-20`），`BC_ENV_NAME` 没有对应处理（`src/core/build-info.js` 的 `envName: env.BC_ENV_NAME`）。项目未提供 `.env.<name>` 或其中未定义 `BC_ENV_NAME` 时，`buildInfoPlugin` 会因 `JSON.stringify(undefined)` 而丢弃该键，`__BC_BUILD__` 中**整个 `envName` 字段不存在**，且构建过程无任何提示。消费方读 `__BC_BUILD__.envName` 得到 `undefined`，只能各自做缺省处理。
  - 复现：项目无 `.env` 文件时执行 `build`，产物中 `env:"prod"` 存在（来自 `--env` 兜底）而 `envName` 键缺失。
  - 兜底策略属 frame 的设计选择，此处只记录缺口：frame 无法凭空推断展示名，可选方案包括 `envName` 缺省回退为 `env` 值、或缺失时输出一条 warn。
  - 提出方：`questionnaire-answer-v3.0` 迁移项目（2026-09-29）。

- **把整个 `__BC_BUILD__` 送进无法静态折叠的位置会嵌入 `buildTime`，破坏产物 hash 稳定性与构建可复现性**：
  `build-info-plugin.js` 除逐字段定义 `__BC_BUILD__.<key>` 外，还定义了整个对象
  （`defs['__BC_BUILD__'] = JSON.stringify(baseObj)`，用于支撑 `typeof` 判断）。
  该对象含 `deriveBuildInfo` 的 `buildTime: Date.now()`。消费方若把它整体传入函数、
  展开进运行时数据结构或序列化（如 `JSON.stringify(__BC_BUILD__)`、`{...__BC_BUILD__}`），
  对象必须完整保留，`buildTime` 随之进入产物，导致**源码未变时产物内容仍每次不同**：
  使用 `[contenthash]` 时文件名每次构建都变，长期缓存失效；同一份源码也无法产出一致的产物。
  - 复现：消费方写 `JSON.stringify(__BC_BUILD__)`，连续两次 `build`，js 的 contenthash 不同。
  - **赋给常量再逐字段读取是安全的**：`const B = typeof __BC_BUILD__ !== 'undefined' ? __BC_BUILD__ : {}`
    配合 `B.version` 等属性读取，压缩阶段会把未被读取的字段（含 `buildTime`）消除，
    两次构建产物完全一致。已实测确认。
  - 是否调整（例如把 `buildTime` 从整体对象定义中排除，或在文档中提示）属 frame 的设计选择。
  - 提出方：`questionnaire-answer-v3.0` 迁移项目（2026-09-29）。

## 演进事项（非缺陷）

- **webpack 预设规整**：main 不处理资源、共用配置抽取等结构性优化尚未排期。
- **base-client.bake 差异盘点**：与历史 bake 仓库的行为差异尚未系统梳理，接入新项目时按需补充。

## 复验记录

- `e2e-dev-web` 单跑超时挂起曾在 Node 16 环境记录为已知问题；Node 22.15.1 复验通过（6.3s），不再列为限制。