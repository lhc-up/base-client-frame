# Frame 已知限制

本文档只记录当前仍成立的限制与演进事项，已解决的问题不在此列。

> 跨仓库基线的**状态与排期**见 `base-client-toolkit/docs/design/baseline-checklist.md`（唯一跟踪表）；本文只保留详细依据。

## 已知限制

- **龙芯（loong64）打包需自备 Electron 镜像源**：frame 不内置镜像配置，构建节点需通过环境变量（如 `ELECTRON_MIRROR`）自行解决。
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