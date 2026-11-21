# Frame 已知限制

本文档只记录当前仍成立的限制与演进事项，已解决的问题不在此列。

> 跨仓库基线的**状态与排期**见 `base-client-toolkit/docs/design/baseline-checklist.md`（唯一跟踪表）；本文只保留详细依据。

## 已知限制

- **龙芯（loong64）打包需要龙芯版 electron-builder**：官方 electron-builder 不支持 loong64，打包前要从龙芯源安装龙芯版，打完再恢复官方版。frame 已内置龙芯 Electron 镜像，并在打包前检查，用错版本时直接报错并输出处理步骤（见 `docs/build-target-resolution-contract.md`「龙芯（loong64）」）。

## 演进事项（非缺陷）

- **base-client.bake 差异盘点**：与历史 bake 仓库的行为差异尚未系统梳理，接入新项目时按需补充。

## 复验记录

- `e2e-dev-web` 单跑超时挂起曾在 Node 16 环境记录为已知问题；Node 22.15.1 复验通过（6.3s），不再列为限制。