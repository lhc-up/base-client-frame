# Toolkit 边界设计

## 一、原则

**可能会复用到的才提取到 toolkit。**

---

## 二、libs 去向

| libs | 去向 | 理由 |
|------|------|------|
| utils.js | → toolkit | 文件/路径工具，任何服务都可能用到 |
| os.js | → toolkit | OS 判断，通用 |
| logUtil.js | → toolkit | 日志工具 |
| store.js | → toolkit | 存储封装 |
| app.js | → toolkit | 应用生命周期通用操作 |
| zipUtil.js | → toolkit | zip 操作，可能复用 |
| package.js | → 框架 | 更新逻辑是框架自己的能力 |
| protocol.js | → 框架 | asar 加密协议，框架特定 |
| shortcut.js | → 框架 | 调试用快捷键，非通用 |

---

## 三、service 去向

| service | 去向 | 理由 |
|---------|------|------|
| config | → toolkit | 配置能力通用 |
| logger | → toolkit | 日志能力通用 |
| store | → toolkit | 存储能力通用 |
| device | → toolkit | 硬件控制可能复用 |
| system | → toolkit | 系统级能力通用 |
| app | → toolkit | 应用生命周期通用 |
| update | → 框架 | 升级是框架能力 |
| window | → 框架 | 窗口管理是框架提供 |
| notice | → 框架 | 消息推送是框架能力（独立于 service） |

---

## 四、框架 vs Toolkit vs 用户层

```
┌─────────────────────────────────────────────────────────────┐
│                    框架层 (@org/base-electron)               │
├─────────────────────────────────────────────────────────────┤
│  主进程工具层                                                │
│  ├── BaseWindow (窗口基类)                                  │
│  ├── initService() (service 扫描注册)                       │
│  ├── notice (notice 模块，与 service 同级)                  │
│  └── 工具类 (LogHelper, StorageHelper 等)                   │
├─────────────────────────────────────────────────────────────┤
│  Toolkit 层 (@org/base-toolkit)                             │
│  ├── libs 通用能力                                          │
│  └── service 通用能力                                       │
└─────────────────────────────────────────────────────────────┘
                              ↓ npm install + git tag
┌─────────────────────────────────────────────────────────────┐
│                    用户层 (各业务项目)                       │
│  ├── src/main/                                             │
│  │   ├── index.js (入口)                                   │
│  │   ├── *.js (窗口类，继承 BaseWindow)                     │
│  │   └── service/ (业务 service)                           │
│  └── src/renderer/ (UI 层，用户自行选择 Vue/React 等)        │
└─────────────────────────────────────────────────────────────┘
```