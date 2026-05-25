# Notice 机制实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现主进程向渲染进程主动推送消息的 notice 机制，支持广播和定向两种模式，支持用户自定义事件。

**Architecture:**
- Notice 是独立于 Service 的系统能力（推送模式 vs Service 的请求-响应模式）
- `initNotice()` 与 `initService()` 分离
- preload 桥接层负责订阅/取消订阅
- 主进程 notice 模块维护订阅映射并负责事件分发

**Tech Stack:** Electron IPC, BrowserWindow API

---

## 文件结构

```
src/main/notice/                    # Notice 独立模块
├── index.js                        # broadcast, direct, register, init, getSchema, cleanupWindow
└── schema.js                       # 内置事件定义

src/main/notices/                   # 用户自定义 notice 目录
├── user.js                         # namespace: 'user'
└── update.js                       # namespace: 'update'

src/preload/notice/                 # Preload 桥接
└── index.js                        # on, off, once, init
```

---

## 已完成 ✅

### Task 1-8: 全部完成

**功能清单：**

| 方法 | 说明 |
|------|------|
| `notice.init({ userNoticeDir })` | 初始化并扫描用户 notice 目录 |
| `notice.broadcast(event, data)` | 广播到所有订阅窗口 |
| `notice.direct(event, windowId, data)` | 定向到指定窗口 |
| `notice.register(namespace, events)` | 注册事件定义 |
| `notice.getSchema()` | 获取完整 schema |
| `notice.cleanupWindow(windowId)` | 清理窗口订阅 |
| `preload.notice.on(event, cb)` | 订阅事件 |
| `preload.notice.off(event, cb?)` | 取消订阅 |
| `preload.notice.once(event, cb)` | 单次订阅 |

**内置事件（schema.js）：**

```js
system:    networkDisconnected, lowBattery
update:    progress, completed, error
app:       started, closed
window:    maximized, minimized, closed
```

**用户 notice 文件格式：**

```js
// src/main/notices/user.js
module.exports = {
    events: {
        loginSuccess: { description: '登录成功', broadcast: false },
        logout: { description: '用户登出', broadcast: false }
    }
};
```

**初始化调用：**

```js
// 用户 src/main/index.js
const notice = require('@org/base-electron/main/notice');
const path = require('path');

app.whenReady(() => {
    notice.init({ userNoticeDir: path.join(__dirname, 'notices') });
    new MyWindow().create();
});
```

---

## 验证清单

- [x] 内置事件可通过 `notice.broadcast()` / `notice.direct()` 发送
- [x] `notice.register()` 可注册新事件
- [x] 冲突事件名抛出错误
- [x] `notice.init()` 扫描用户 notice 并注册
- [x] preload 的 `on/off/once` 正常工作
- [x] 窗口关闭时自动清理订阅