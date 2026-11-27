# Frame 已知限制

本文档只记录当前仍成立的限制与演进事项，已解决的问题不在此列。

> 跨仓库基线的**状态与排期**见 `base-client-toolkit/docs/design/baseline-checklist.md`（唯一跟踪表）；本文只保留详细依据。

## 已知限制

- **龙芯新世界（`--arch loong64`）尚未支持**：需要新世界版本的 Electron（官方没有龙芯版本），来源确定前选择该目标会直接报错。龙芯旧世界用 `--arch loongarch64`（见 `docs/build-target-resolution-contract.md`「龙芯」）。

## 演进事项（非缺陷）

- **base-client.bake 差异盘点**：已完成功能对照，见 toolkit `docs/design/bake-feature-inventory.md`；缺失项逐条确认中。

## 复验记录

- `e2e-dev-web` 单跑超时挂起曾在 Node 16 环境记录为已知问题；Node 22.15.1 复验通过（6.3s），不再列为限制。