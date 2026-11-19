# Frame 已知限制

本文档只记录当前仍成立的限制与演进事项，已解决的问题不在此列。

> 跨仓库基线的**状态与排期**见 `base-client-toolkit/docs/design/baseline-checklist.md`（唯一跟踪表）；本文只保留详细依据。

## 已知限制

- **龙芯（loong64）打包需自备 Electron 镜像源**：frame 不内置镜像配置，构建节点需通过环境变量（如 `ELECTRON_MIRROR`）自行解决。
- **`BC_ENV_NAME` 无兜底且缺失时完全静默**：`applyBcEnvFallback` 只为 `BC_ENV` 提供 `--env` 默认值兜底（`src/cli/index.js:18-20`），`BC_ENV_NAME` 没有对应处理（`src/core/build-info.js` 的 `envName: env.BC_ENV_NAME`）。项目未提供 `.env.<name>` 或其中未定义 `BC_ENV_NAME` 时，`buildInfoPlugin` 会因 `JSON.stringify(undefined)` 而丢弃该键，`__BC_BUILD__` 中**整个 `envName` 字段不存在**，且构建过程无任何提示。消费方读 `__BC_BUILD__.envName` 得到 `undefined`，只能各自做缺省处理。
  - 复现：项目无 `.env` 文件时执行 `build`，产物中 `env:"prod"` 存在（来自 `--env` 兜底）而 `envName` 键缺失。
  - 兜底策略属 frame 的设计选择，此处只记录缺口：frame 无法凭空推断展示名，可选方案包括 `envName` 缺省回退为 `env` 值、或缺失时输出一条 warn。
  - 提出方：`questionnaire-answer-v3.0` 迁移项目（2026-09-29）。

- **只要整个 `__BC_BUILD__` 出现在产物中就会带入 `buildTime`，破坏产物 hash 稳定性与构建可复现性**：
  `build-info-plugin.js` 除逐字段定义 `__BC_BUILD__.<key>` 外，还定义了整个对象
  （`defs['__BC_BUILD__'] = JSON.stringify(baseObj)`，用于支撑 `typeof` 判断）。
  该对象含 `deriveBuildInfo` 的 `buildTime: Date.now()`。消费方只要整体引用它——传入函数、
  展开进运行时结构、序列化，或仅仅赋给一个常量——`buildTime` 就可能进入产物，导致
  **源码未变时产物内容仍每次不同**：使用 `[contenthash]` 时文件名每次构建都变，
  长期缓存失效；同一份源码也无法产出一致的产物。
  - 复现：消费方写 `JSON.stringify(__BC_BUILD__)`，连续两次 `build`，js 的 contenthash 不同。
  - 消费方需**逐字段引用**（`__BC_BUILD__.version` 等）。把整个对象赋给常量再取属性
    （`const B = typeof __BC_BUILD__ !== 'undefined' ? __BC_BUILD__ : {}`）**同样可能保留
    `buildTime`**：压缩器是否消除未读字段取决于产物规模，小产物上会消除、较大产物上观察到
    整个对象被保留为变量。该行为是优化而非保证，不可依赖。
  - 是否调整（例如把 `buildTime` 从整体对象定义中排除，或在文档中提示）属 frame 的设计选择。
  - 提出方：`questionnaire-answer-v3.0` 迁移项目（2026-09-29）。

- **`engines` 声明 `node >=18.12.0`，但 frame 在 Node 16.20.2 下实际可用**：业务项目
  （Node v16.20.2 / npm 8.19.4）每次 `npm i` 都会收到
  `npm WARN EBADENGINE @base-client/frame@0.0.1 required: { node: '>=18.12.0' }`，
  而 `dev:app` 的三段编译与产物运行均正常。两种可能：声明写宽了（实际不需要 18），
  或确实用到了 Node 18 独有的 API 但当前代码路径尚未触达——**后者更危险**，
  会在某条冷路径上突然失败，而业务侧只看到一条每次都出现、久而久之被忽略的 WARN。
  - 本文件「复验记录」中那条「`e2e-dev-web` 单跑超时挂起曾在 Node 16 环境记录为已知问题，
    Node 22.15.1 复验通过」恰好说明：**Node 16 下确实存在过行为差异**，
    只是业务当前用到的路径没触发。
  - 另有一处容易混淆、建议在文档里讲清：**「构建环境的 Node 版本」与「运行时 Electron
    内置的 Node 版本」是两条独立要求**。本业务 electron 锁 22.3.1（内置 Node 16.17），
    若 frame 构建侧真需要 Node ≥18，业务很容易误以为"对齐 Electron 的 Node 版本就够了"。
  - 建议：核实真实下限并对齐 `engines`；若确需 ≥18，在 README/文档中显式区分上述两条要求。
  - 提出方：`questionnaire-answer-v3.0` 迁移项目（2026-10-07）。

## 演进事项（非缺陷）

- **webpack 预设规整**：main 不处理资源、共用配置抽取等结构性优化尚未排期。
- **base-client.bake 差异盘点**：与历史 bake 仓库的行为差异尚未系统梳理，接入新项目时按需补充。

## 复验记录

- `e2e-dev-web` 单跑超时挂起曾在 Node 16 环境记录为已知问题；Node 22.15.1 复验通过（6.3s），不再列为限制。