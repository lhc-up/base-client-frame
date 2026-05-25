# 统一架构设计方案

## 一、背景

将 `base-client` 从一个具体项目改造为 Electron 基础架构框架，供多个业务项目通过 npm 包方式引用。

- 多个项目（10+）共用同一架构
- 业务逻辑和 UI 各不相同，只有底层架构相同
- 通过 npm + Git Tag 版本管理分发

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    框架层 (@org/base-electron)               │
├─────────────────────────────────────────────────────────────┤
│  主进程工具层                                                │
│  ├── BaseWindow (窗口基类)                                  │
│  ├── initService() (service 扫描注册)                       │
│  ├── notice (notice 模块，与 service 同级)                  │
│  └── 工具类 (LogHelper, StorageHelper 等)                    │
├─────────────────────────────────────────────────────────────┤
│  Preload 层                                                 │
│  ├── service 桥接 (动态生成 window.appService)              │
│  └── notice 桥接 (window.preload.notice)                    │
├─────────────────────────────────────────────────────────────┤
│  构建层                                                      │
│  ├── webpack 公共配置                                        │
│  ├── electron-builder 配置                                   │
│  └── 构建脚本                                               │
├─────────────────────────────────────────────────────────────┤
│  Shared 层                                                   │
│  ├── enum/constant                                          │
│  └── utils                                                  │
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

---

## 三、核心概念

### 3.1 Service vs Notice

| | Service | Notice |
|--|---------|--------|
| 模式 | 请求-响应（invoke/handle） | 推送（send/on） |
| 方向 | 渲染进程 → 主进程 | 主进程 → 渲染进程 |
| 返回值 | 有（Promise） | 无（fire-and-forget） |
| 场景 | 获取数据、执行操作 | 状态变更通知、进度推送 |
| 框架化 | `initService({ userServiceDir })` | `notice.register(namespace, events)` |

### 3.2 框架分层设计

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
```

---

## 四、窗口基类

### 4.1 基类设计

```js
// 框架提供 BaseWindow
class BaseWindow {
  constructor(options = {}) {
    this.options = options
    this.browserWindow = null
  }

  // 用户必须覆盖
  getPageUrl() { throw new Error('需要实现 getPageUrl') }
  getWindowOptions() { return {} }

  // 可覆盖
  onBeforeCreate(options) { return options }
  onCreated(window) { }
  onClosed() { }

  // 模板方法（用户不直接调用）
  create() {
    const userOptions = this.getWindowOptions()
    const mergedOptions = this.mergeOptions(userOptions)  // 深度合并
    const window = this.createWindow(mergedOptions)
    this.addEventListenerToWin()   // 基类处理
    this.addFiltersToWebRequest() // 基类处理（cookie等）
    this.onCreated(window)
    return window
  }

  // 工具方法
  center() { ... }
  close() { ... }
  show() { ... }
  hide() { ... }
  // ...
}
```

### 4.2 用户扩展

```js
// 用户 src/main/update.js
class UpdateWindow extends BaseWindow {
  getPageUrl() {
    return 'http://localhost:9000/update.html'
  }

  getWindowOptions() {
    return {
      width: 540,
      height: 340,
      title: '检查更新'
    }
  }
}
```

### 4.3 配置合并

使用深度合并（lodash.merge），用户只需指定部分配置：

```js
// 用户只覆盖部分
this.createWindow({
  width: 1280,
  webPreferences: {
    contextIsolation: true  // 只覆盖这一个
  }
})

// 结果：其他默认项保留
{
  width: 1280,
  webPreferences: {
    nodeIntegration: true,      // 来自默认
    contextIsolation: true,    // 用户覆盖
    preload: 'xxx'             // 来自默认
  }
}
```

---

## 五、Preload 层

### 5.1 动态生成 API

preload 启动时调用 `main:getServiceList` 获取所有 service schema，动态生成 `window.appService`。

### 5.2 API 结构

```js
window.appService = {
  config: {
    get: async (...args) => ipcRenderer.invoke('config:get', ...args),
    getSync: (...args) => ipcRenderer.sendSync('config:getSync', ...args),
    update: async (...args) => ipcRenderer.invoke('config:update', ...args),
    updateSync: (...args) => ipcRenderer.sendSync('config:updateSync', ...args),
  },
  user: {
    getInfo: async (...args) => ipcRenderer.invoke('user:getInfo', ...args),
    getInfoSync: (...args) => ipcRenderer.sendSync('user:getInfoSync', ...args),
  }
}
```

### 5.3 渲染进程使用

```js
// 异步
const config = await window.appService.config.get()
await window.appService.config.update({ refreshRate: 5 })

// 同步
const config = window.appService.config.getSync()

// 回调支持
window.appService.update.downloadInstaller({
  url: 'xxx',
  onProgress: (p) => console.log(p)
})
```

---

## 六、下一步待讨论问题

1. **构建配置** — 框架如何提供构建能力
2. **模板目录结构** — 用户项目的标准布局
3. **窗口基类内置行为** — 哪些事件/拦截由基类处理

---

## 七、版本管理

- 通过 Git Tag 管理版本
- 用户使用 `npm install @org/base-electron@^1.0.0` 按需升级
- npm 包发布到公司 Git 仓库

---

## 相关文档

- [Service 机制设计](./2026-05-15-service-design.md)
- [Notice 机制设计](./2026-05-17-notice-design.md)
- [Toolkit 边界设计](./2026-05-15-toolkit-design.md)