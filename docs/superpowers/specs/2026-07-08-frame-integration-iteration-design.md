# Frame 接入迭代设计

**日期**：2026-07-08
**项目**：`@base-client/frame`
**性质**：因 `client-project` 沙盘接入触发的迭代活文档

> 本文档不是 frame 的整体架构真理源（那是 `2026-06-24-frame-design.md`），而是**因本次沙盘接入探索识别到的迭代项清单**。每一项都标注触发来源、影响命令、后续 spec 触发时机，供各阶段执行前拉起对应 spec 使用。

---

## §1 定位

### 1.1 触发背景

`client-project` 是本次接入 `business-project` 前的**探索沙盘**（详见接入方案设计文档 §1）。沙盘的目的是暴露 frame 架构问题、验证接入方法。本文档记录沙盘接入过程中 frame 需要迭代的项。

### 1.2 关联包引入：`@base-client/crypto`

本次接入引入一个新的 Node 环境共享工具包 `@base-client/crypto`，用于 asax 加解密：

- 打包时 frame 依赖它做增量包（asax）加密
- 主进程运行时 toolkit `update` capability 依赖它做解密（详见 T-doc §7）
- 渲染进程加解密业务自处理，`crypto` 不覆盖
- **双仓平行原则不变**：frame ↔ toolkit 之间无直接依赖，均单向依赖 `crypto`

### 1.3 定位边界不变

frame 仍然只做构建工具链，**不介入**：

- 技术栈选型（Vue/React/Svelte 等一律用户自配）
- 多入口业务规则（用户自配 renderer entry）
- 加解密算法选型（作为可选 hook 提供，由用户注入）
- addons/native 目录约定
- 产物命名规则

以上均走用户 `bc.config` / `electron-builder.config` 配置。

---

## §2 迭代项 A 档：接入必备

### F-01 preset 可覆盖性验证与手册化 ✓ 已完成（2026-07-08）

| 项 | 内容 |
|---|---|
| 触发阶段 | 阶段 1 起步前 |
| 影响命令 | dev:web / dev:app / build / pack / child |
| 定性 | 保证 renderer / web / preload / main preset 均能被用户 `replace` / `customMerge` 完全接管（entry / plugins / loader / target 都可换） |
| 后续 spec 触发时机 | 阶段 1 起步前必须先出 spec |
| 阻塞什么 | 阶段 1 无法开始 |
| 实际结论 | 不提供接管机制。删除四个 preset 中的 `module.rules`（asset/resource）与 `output.assetModuleFilename`；bc.config 合并沿用 webpack-merge 官方默认语义（标量覆盖 / 对象深合并 / 数组追加）；资源处理、转译 loader、HTML 模板、单例插件均归用户在 bc.config 自加。已同步 frame-design.md §6 头部、§6.1、§6.3、§10.9。 |

### F-02 子应用/升级包（child + asax）构建参数注入隔离

| 项 | 内容 |
|---|---|
| 触发阶段 | 阶段 5 起步前 |
| 影响命令 | pack / child |
| 定性 | 明确哪些编译期变量不该注入到 child / asax 产物（跨平台复用场景下平台/架构/环境等信息可能造成运行时判断错误） |
| 后续 spec 触发时机 | 阶段 5 起步前 |
| 阻塞什么 | 阶段 5 无法完成 |
| 备注 | 已在现有 `TODOs.md` 列出 |

---

## §3 迭代项 B 档：接入过程验证/确认

### F-03 多入口 renderer 用户自配透传验证

| 项 | 内容 |
|---|---|
| 触发阶段 | 阶段 4 |
| 影响命令 | dev:app / pack / child |
| 定性 | 验证 `bc.config.renderer` 用户传对象/数组 entry + 自注 `html-webpack-plugin` 时，preset 不阻挠、dev-server 多入口 HMR 天然可用 |
| 后续 spec 触发时机 | 阶段 4 起步时（验证式，若发现阻挠再拉 spec） |
| 阻塞什么 | 若发现阻挠，阶段 4 可能回退到阶段 1 补配置能力 |

### F-04 electron-builder.config 样板集

| 项 | 内容 |
|---|---|
| 触发阶段 | 阶段 5 |
| 影响命令 | pack / installer |
| 定性 | 产物名带 env、addons/native 目录打包、多平台 icon、龙芯镜像源 等，全归用户配置。frame 侧不动代码，只提供 recipe 参考文档 |
| 后续 spec 触发时机 | 阶段 5 起步时（文档产出，非代码） |
| 阻塞什么 | 只影响用户使用便利性，不阻塞代码链路 |

---

## §4 迭代项与接入阶段的映射矩阵

| 阶段 | F-01 | F-02 | F-03 | F-04 | crypto |
|---|---|---|---|---|---|
| 阶段 0 | — | — | — | — | — |
| 阶段 1 | ✓ 起步 | — | — | — | — |
| 阶段 2 | — | — | — | — | — |
| 阶段 3 | — | — | — | — | — |
| 阶段 4 | — | — | ✓ 验证 | — | — |
| 阶段 5 | — | ✓ | — | ✓ recipe | ✓ 打包时依赖 |

---

## §5 每项 spec 触发时机汇总

| 项 | 触发时机 | 阻塞对象 |
|---|---|---|
| F-01 | 阶段 1 起步前 | 阶段 1 |
| F-02 | 阶段 5 起步前 | 阶段 5 |
| F-03 | 阶段 4 起步时（探索式） | 阶段 4（若阻挠） |
| F-04 | 阶段 5 起步时 | 只影响 recipe 文档 |
| crypto 首版 | 与 F-02 同期或更早 | 阶段 5 加密路径 |

---

## §6 与 `TODOs.md` 的合并规则

`TODOs.md` 是 frame 的日常改进池，本文档是"因接入沙盘触发的迭代项"专项。合并规则：

- 本文档 A 档项目应在 `TODOs.md` 也列一行，加前缀 `[F-XX 接入]` 标注来源
- `TODOs.md` 中已存在但恰好被本文档覆盖的项，改写为 `[F-XX 接入] 参见 spec`
- 每阶段结束时，反馈 DoD 产生的新 F-XX 项按此规则同步

---

## §7 关联包 `@base-client/crypto` 说明

### 7.1 定位

- 位置：`D:/Desktop/npm/base-client-crypto`（本轮新建，具体建仓在 crypto 首版 spec 时执行）
- 运行环境：只跑 Node（frame 打包 + 主进程运行时）
- 渲染进程加解密业务自处理，`crypto` 不覆盖
- 支持流式 API（利用 Node stream 优势，避免大文件全量加载内存）

### 7.2 使用方

| 使用方 | 用途 | 集成方式 |
|---|---|---|
| frame | pack 命令的 asax 加密步骤 | frame 打包链路调用 crypto 加密 API |
| toolkit `update` capability | 从磁盘装载 asar 前的解密步骤 | toolkit `update` capability init 时用户注入 crypto decrypt 函数 |
| 业务侧（可选） | 主进程其他自定义加密需求 | 业务侧直接 require |

### 7.3 双仓平行原则的兼容

- frame ↔ toolkit：**无直接依赖**（保持既有平行关系）
- frame → crypto：**单向依赖**
- toolkit → crypto：**单向依赖**
- 依赖图为 DAG（有向无环），无环依赖

### 7.4 首版能力清单（本轮 spec 前的初步定性）

- AES 加解密（流式）
- SM4 加解密（可选，视 business 需要）
- 密钥读取工具（从固定路径、环境变量、config 多来源）

### 7.5 spec 触发时机

- crypto 首版 spec：与 F-02 同期或更早
- 阶段 5 起步前必须完成，否则加密路径无实现

---

## §8 反馈回填约定

沙盘接入过程中如发现 frame 新的迭代点：

- 立即在本文档 §2 或 §3 增补新的 F-XX 条目
- 在 `TODOs.md` 同步一行前缀 `[F-XX 接入]`
- 对应接入方案文档 §6 反馈闭环机制中记录

**注意**：只记录能力/接口层面的问题，不记录业务实现细节（后者归接入方案文档 §5 recipe）。
