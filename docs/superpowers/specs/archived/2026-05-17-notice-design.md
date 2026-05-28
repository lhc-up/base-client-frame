# Notice 机制设计方案

## 一、背景

主进程主动向渲染进程推送消息的场景（如系统通知、进度更新、状态变更）。

**Notice 是独立于 Service 的系统能力：**
- Service：请求-响应模式（渲染→主）
- Notice：推送模式（主→渲染）

设计原则：
- 渲染进程代码需兼容 Web 端，不能直接与主进程通信
- 渲染进程 ↔ 主进程只能通过 preload 中转
- 调用方心智负担低，API 语义清晰
- Notice 与 Service 分离，各自有独立的初始化方法

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      主进程 (Main)                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  notice 模块 (src/main/notice/)                     │   │
│  │  ├── schema.js (内置事件定义)                        │   │
│  │  ├── index.js                                       │   │
│  │  │   ├── init({ userNoticeDir })                    │   │
│  │  │   ├── broadcast(event, data)                     │   │
│  │  │   ├── direct(event, windowId, data)              │   │
│  │  │   └── register(namespace, events)                │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓ IPC                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  preload 桥接层 (src/preload/notice/)                │   │
│  │  ├── notice.on(event, callback) → 注册订阅         │   │
│  │  ├── notice.off(event, callback?) → 取消订阅        │   │
│  │  └── notice.once(event, callback) → 单次订阅       │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓ 上下文桥接                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  渲染进程 (Renderer) - Vue/React/Web                 │   │
│  │  preload.notice.on('update.progress', (data) => {})  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、事件 Schema 结构

### 3.1 格式

```js
// 框架内置：src/main/notice/schema.js
module.exports = {
    system: {
        events: {
            networkDisconnected: { description: '网络断开', broadcast: true },
            lowBattery: { description: '电量不足', broadcast: true }
        }
    },
    update: {
        events: {
            progress: { description: '更新进度', broadcast: false },
            completed: { description: '更新完成', broadcast: false },
            error: { description: '更新失败', broadcast: false }
        }
    },
    app: {
        events: {
            started: { description: '应用启动', broadcast: true },
            closed: { description: '应用关闭', broadcast: true }
        }
    },
    window: {
        events: {
            maximized: { description: '窗口最大化', broadcast: false },
            minimized: { description: '窗口最小化', broadcast: false },
            closed: { description: '窗口关闭', broadcast: false }
        }
    }
};
```

**最终事件名 = `namespace.eventName`**，如 `system.networkDisconnected`

### 3.2 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| description | string | 是 | 事件描述，用于文档和调试 |
| broadcast | boolean | 是 | true = 广播（所有窗口），false = 定向（指定窗口） |

---

## 四、用户自定义事件

### 4.1 目录结构

用户 notice 文件放在 `src/main/notices/` 目录下，一个文件代表一个模块：

```
src/main/notices/
├── user.js     # namespace: 'user'
├── update.js   # namespace: 'update'
└── config.js  # namespace: 'config'
```

### 4.2 文件格式

```js
// src/main/notices/user.js
module.exports = {
    events: {
        loginSuccess: { description: '登录成功', broadcast: false },
        logout: { description: '用户登出', broadcast: false }
    }
};
```

**namespace 从文件名自动获取**（`user.js` → `namespace: 'user'`）

### 4.3 初始化调用

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

## 五、API 设计

### 5.1 主进程 API（notice 模块）

```js
const notice = require('src/main/notice');

// 初始化（扫描用户 notice 目录）
notice.init({ userNoticeDir: path.join(__dirname, 'notices') });

// 广播 - 所有订阅该事件的窗口都收到
notice.broadcast('system.networkDisconnected', { reason: '网线断开' });

// 定向 - 只发给指定窗口
notice.direct('update.progress', windowId, { percent: 50 });

// 手动注册事件
notice.register('custom', {
    myEvent: { description: '自定义事件', broadcast: false }
});
```

**校验逻辑：**
- 调用 `broadcast()` 但事件 `broadcast: false` → 抛出错误
- 调用 `direct()` 但事件 `broadcast: true` → 抛出错误
- windowId 不存在 → 静默忽略
- 同 namespace 下事件冲突 → 抛出错误
- 不同 namespace 下可以有同名事件（如 `user.progress` vs `update.progress`）

### 5.2 Preload API

```js
// 订阅事件（自动关联当前窗口）
const unlisten = preload.notice.on('update.progress', (data) => {
    console.log(data);
});

// 单次订阅
preload.notice.once('user.logout', () => {
    console.log('logout');
});

// 取消订阅
preload.notice.off('update.progress', callback);  // 取消特定回调
preload.notice.off('update.progress');            // 取消该事件所有回调
```

### 5.3 渲染进程使用示例

```js
// Vue 组件中
export default {
    mounted() {
        this.unlistenProgress = preload.notice.on('update.progress', (data) => {
            this.progress = data.percent;
        });

        this.unlistenLogout = preload.notice.once('user.logout', () => {
            this.$router.push('/login');
        });
    },
    beforeUnmount() {
        this.unlistenProgress();
        this.unlistenLogout();
    }
};
```

---

## 六、目录结构

```
src/main/
├── notice/                    # Notice 框架模块
│   ├── index.js              # init, broadcast, direct, register
│   └── schema.js             # 内置事件定义
├── notices/                   # 用户自定义 notice（可选）
│   ├── user.js               # namespace: 'user'
│   └── update.js             # namespace: 'update'
├── service/                   # Service 机制（独立于 notice）
│   └── ...
└── ...

src/preload/
├── notice/                    # Preload 桥接
│   └── index.js
└── ...
```

---

## 七、Service 与 Notice 对比

| | Service | Notice |
|--|---------|--------|
| 模式 | 请求-响应（invoke/handle） | 推送（send/on） |
| 方向 | 渲染进程 → 主进程 | 主进程 → 渲染进程 |
| 返回值 | 有（Promise） | 无（fire-and-forget） |
| 场景 | 获取数据、执行操作 | 状态变更通知、进度推送 |
| 初始化 | `initService({ userServiceDir })` | `init({ userNoticeDir })` |
| 用户定义 | `service/*.js` | `notices/*.js` |
| 冲突处理 | 同 namespace 冲突报错 | 同 namespace 冲突报错 |