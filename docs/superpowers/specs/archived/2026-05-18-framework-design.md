# Base Client 框架设计方案

## 一、概述

### 1.1 背景

将 `base-client` 从单个项目改造为 Electron 基础架构框架，供多个业务项目通过 npm 包方式引用。参考 electron-vite 的设计理念，使用 Webpack 作为构建工具。

### 1.2 设计目标

- **分层清晰**：四层架构（CLI 层、构建层、框架核心层、Preload 层）
- **配置工厂化**：统一的 Config Factory 体系管理构建配置
- **能力模块化**：Service 机制、Notice 机制、BaseWindow 基类独立模块
- **CLI 驱动**：用户通过 `base-client dev/build/preview` 命令使用

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    框架层 (@org/base-client)               │
├─────────────────────────────────────────────────────────────┤
│  CLI 层 (用户命令入口)                                       │
│  ├── bin/base-client.js                                    │
│  └── src/cli/                                              │
├─────────────────────────────────────────────────────────────┤
│  构建层 (Config Factory + Preset)                          │
│  └── src/config/                                           │
├─────────────────────────────────────────────────────────────┤
│  框架核心层 (Service, Notice, Window, Shared)               │
│  ├── src/service/                                           │
│  ├── src/notice/                                            │
│  ├── src/window/                                            │
│  └── src/shared/                                            │
├─────────────────────────────────────────────────────────────┤
│  Preload 层 (主进程 ↔ 渲染进程 通信桥接)                     │
│  └── src/preload/                                           │
└─────────────────────────────────────────────────────────────┘
```

**四层说明：**

| 层 | 职责 |
|---|---|
| CLI 层 | 用户命令入口（dev/build/preview） |
| 构建层 | Webpack 配置工厂（Config Factory + Preset） |
| 框架核心层 | 业务能力（Service、Notice、Window） |
| Preload 层 | 进程间通信桥接（框架提供，用户不可见） |

---

## 三、目录结构

```
@org/base-client
│
├── bin/
│   └── base-client.js              # CLI 入口
│
├── src/
│   ├── index.js                    # 框架主入口
│   │
│   ├── cli/                        # CLI 实现
│   │   ├── index.js               # CAC 配置
│   │   └── commands/
│   │       ├── dev.js             # dev 命令
│   │       ├── build.js           # build 命令
│   │       └── preview.js         # preview 命令
│   │
│   ├── config/                     # Config Factory
│   │   ├── index.js               # 导出工厂
│   │   ├── Factory.js             # 基类
│   │   ├── factories/
│   │   │   ├── MainFactory.js
│   │   │   ├── PreloadFactory.js
│   │   │   └── RendererFactory.js
│   │   └── presets/
│   │       ├── MainPreset.js
│   │       ├── PreloadPreset.js
│   │       └── RendererPreset.js
│   │
│   ├── service/
│   │   ├── index.js               # init(), getServiceList(), register(), cleanup()
│   │   └── schema.js              # 框架 service 定义
│   │
│   ├── notice/
│   │   ├── index.js               # init(), broadcast(), direct(), register(), getSchema()
│   │   └── schema.js              # 框架 event 定义
│   │
│   ├── window/                    # Window 基类
│   │   └── BaseWindow.js
│   │
│   ├── preload/                   # Preload 桥接
│   │   ├── index.js              # 入口
│   │   ├── service.js            # window.appService 动态生成
│   │   └── notice.js             # window.preload.notice
│   │
│   └── shared/                    # 共享代码
│       ├── enum/
│       │   ├── ipc.js
│       │   └── event.js
│       └── utils/
│           ├── uuid.js
│           └── ensureJson.js
│
├── package.json
└── README.md
```

---

## 四、CLI 设计

### 4.1 使用方式

```bash
# 开发模式
npx base-client dev

# 生产构建
npx base-client build

# 预览
npx base-client preview
```

### 4.2 命令

| 命令 | 说明 |
|------|------|
| `dev` | 启动开发服务器 + Electron |
| `build` | 生产环境构建 |
| `preview` | 预览构建结果 |

### 4.3 bin 配置

```json
// package.json
{
  "name": "@org/base-client",
  "bin": {
    "base-client": "./bin/base-client.js"
  }
}
```

---

## 五、Config Factory（构建层）

### 5.1 架构

```
src/config/
├── index.js           # 导出 MainFactory, PreloadFactory, RendererFactory
├── Factory.js         # 基类
├── factories/
│   ├── MainFactory.js
│   ├── PreloadFactory.js
│   └── RendererFactory.js
└── presets/
    ├── MainPreset.js
    ├── PreloadPreset.js
    └── RendererPreset.js
```

### 5.2 Factory 基类

```javascript
class Factory {
  constructor(name, { target, outDir, external = [] }) {
    this.name = name;
    this.target = target;
    this.outDir = outDir;
    this.external = external;
  }

  create(userConfig = {}) {
    const preset = this.getPreset();
    const merged = this.mergeConfig(preset, userConfig);
    this.applyPlugins(merged);
    return merged;
  }

  getPreset() { throw new Error('子类必须实现 getPreset()'); }
  mergeConfig(base, user) { /* 深度合并 */ }
  applyPlugins(config) { /* 注册 preset + 插件 */ }
}
```

### 5.3 三个工厂类

| 工厂 | Target | outDir | externals | 特殊配置 |
|------|--------|--------|-----------|----------|
| MainFactory | node{version} | out/main | electron, node内置 | format: esm/cjs |
| PreloadFactory | node{version} | out/preload | electron, node内置 | mainFields: browser-first |
| RendererFactory | chrome{version} | out/renderer | 无 | - |

### 5.4 Preset 机制

每个进程 Preset 自动注入：

```javascript
// MainPreset.js
module.exports = {
  target: this.target,           // 如 'node22'
  outDir: 'out/main',
  externals: ['electron', ...builtinModules],
  format: electronSupportsESM() ? 'esm' : 'cjs'
};

// PreloadPreset.js
module.exports = {
  target: this.target,
  outDir: 'out/preload',
  externals: ['electron', ...builtinModules],
  resolve: {
    mainFields: ['browser', 'module', 'jsnext:main', 'jsnext']
  },
  format: 'cjs'
};

// RendererPreset.js
module.exports = {
  target: this.target,           // 如 'chrome146'
  outDir: 'out/renderer'
};
```

---

## 六、Service 机制

### 6.1 架构

```
src/service/
├── index.js              # init(), getServiceList(), register(), cleanup()
└── schema.js             # 内置 service 定义（框架自带能力）
```

**说明：** 框架 service 统一放在 `src/service/`，无 builtin 区分。用户 service 在运行时从用户目录注册。

### 6.2 冲突处理

框架 service 与用户 service **同 namespace 时立即报错**，消灭在开发阶段。

```javascript
// 主进程
if (registeredNamespaces.has(namespace)) {
  throw new Error(`[Base] Service namespace "${namespace}" 冲突，请检查框架内置和用户定义`);
}
```

### 6.3 接口

```javascript
// 初始化
init({ userServiceDir })    // 扫描用户 service 目录，注册所有 handler
                            // 同时注册 'service:getServiceList' IPC handler

// 运行时
getServiceList()             // 返回 [{ namespace, handlers }, ...]
register(namespace, handlers)  // 手动注册新 service

// 清理
cleanup()                    // 进程退出时调用
```

### 6.4 IPC Handler 注册

`init()` 内部注册以下 handler：

| Channel | 用途 |
|---------|------|
| `service:getServiceList` | 返回所有已注册 service 的 schema |

### 6.5 Channel 约定

| 类型 | 格式 | IPC 方式 |
|------|------|----------|
| 异步 | `namespace:handler` | `ipcMain.handle` |
| 同步 | `namespace:handlerSync` | `ipcMain.on` + `sendSync` |

### 6.6 用户自定义 Service

```javascript
// 用户 src/service/user.js
module.exports = {
  namespace: 'user',
  handlers: ['getInfo', 'updateInfo']
};
```

---

## 七、Notice 机制

### 7.1 架构

```
src/notice/
├── index.js              # init(), broadcast(), direct(), register(), getSchema()
└── schema.js             # 内置事件定义（框架自带能力）
```

**说明：** 框架 notice 统一放在 `src/notice/`，无 builtin 区分。用户 notice 在运行时从用户目录注册。

### 7.2 冲突处理

框架 notice 与用户 notice **同 namespace 时立即报错**，消灭在开发阶段。

```javascript
// 主进程
if (registeredNamespaces.has(namespace)) {
  throw new Error(`[Base] Notice namespace "${namespace}" 冲突，请检查框架内置和用户定义`);
}
```

### 7.3 接口

```javascript
// 初始化
init({ userNoticeDir })    // 扫描用户 notices 目录，注册事件
                          // 同时注册 'notice:getSchema' IPC handler

// 发送
broadcast(event, data)      // 广播：所有订阅窗口都收到
direct(event, windowId, data)  // 定向：只发给指定窗口

// 运行时
register(namespace, events)  // 手动注册新事件
getSchema()                  // 获取完整事件 schema

// 清理
cleanupWindow(windowId)      // 窗口关闭时清理订阅
```

### 7.4 IPC Handler 注册

`init()` 内部注册以下 handler：

| Channel | 用途 |
|---------|------|
| `notice:getSchema` | 返回所有已注册 notice 的 schema |

### 7.5 校验规则

| 调用 | 事件 broadcast=true | 事件 broadcast=false |
|------|---------------------|----------------------|
| `broadcast()` | 正常 | 抛错 |
| `direct()` | 抛错 | 正常 |

### 7.6 用户自定义 Notice

```javascript
// 用户 src/notices/user.js
module.exports = {
  namespace: 'user',
  events: {
    loginSuccess: { description: '登录成功', broadcast: false },
    logout: { description: '用户登出', broadcast: false }
  }
};
```

---

## 八、BaseWindow 基类

### 8.1 核心设计

```javascript
class BaseWindow {
  constructor(options = {}) {
    this.options = options;
    this.browserWindow = null;
  }

  // ==================== 抽象方法（子类必须实现） ====================
  getPageUrl() { throw new Error('子类必须实现 getPageUrl()'); }
  getWindowOptions() { return {}; }

  // ==================== 可覆盖的钩子 ====================
  onBeforeCreate(options) { return options; }
  onCreated(window) { }
  onClosed() { }

  // ==================== 模板方法 ====================
  create() {
    const userOptions = this.getWindowOptions();
    const mergedOptions = this.onBeforeCreate(userOptions);
    const window = this._createWindow(mergedOptions);
    this._setupEventListeners(window);
    this.onCreated(window);
    return window;
  }

  // ==================== 实例方法 ====================
  center() { this.browserWindow?.center(); }
  show() { this.browserWindow?.show(); }
  hide() { this.browserWindow?.hide(); }
  close() { this.browserWindow?.close(); }
  getId() { return this.browserWindow?.id; }
  getWebContents() { return this.browserWindow?.webContents; }
  send(channel, data) { this.browserWindow?.webContents.send(channel, data); }
  isDestroyed() { return this.browserWindow?.isDestroyed() ?? true; }
}
```

### 8.2 子类使用

```javascript
class MainWindow extends BaseWindow {
  getPageUrl() {
    return process.env.NODE_ENV === 'development'
      ? 'http://localhost:9000'
      : `file://${__dirname}/../renderer/index.html`;
  }

  getWindowOptions() {
    return { width: 1280, height: 800, title: '我的应用' };
  }
}
```

---

## 九、Preload 桥接层

### 9.1 概述

Preload 由 BaseWindow 内部加载，对用户不可见。加载时序：

1. 用户调用 `new MainWindow().create()`
2. BaseWindow 内部 `require('@org/base-client/src/preload')` 加载 preload
3. 窗口创建时注入 preload 路径
4. 窗口加载时 preload 直接执行
5. **首次 IPC 调用时** preload 向主进程请求 schema
6. 动态生成 `window.appService` 和 `window.preload.notice`

### 9.2 架构

```
src/preload/
├── index.js              # 入口，初始化 service 和 notice 桥接
├── service.js            # window.appService 动态生成
└── notice.js             # window.preload.notice
```

### 9.3 Service 桥接

首次调用时动态获取 schema：

```javascript
// src/preload/service.js
// 首次 IPC 调用时：
// 1. 调用 service:getServiceList 获取 schema
// 2. 动态生成 window.appService

// 示例：用户定义 user service 后，window.appService 会包含
window.appService = {
  user: {
    getInfo: (...args) => invokeWithCallback('user:getInfo', ...args),
    getInfoSync: (...args) => invokeWithCallbackSync('user:getInfoSync', ...args),
  }
};
```

### 9.4 Notice 桥接

```javascript
window.preload = {
  notice: {
    on(event, callback) { /* 订阅事件，返回 unlisten 函数 */ },
    once(event, callback) { /* 单次订阅 */ },
    off(event, callback?) { /* 取消订阅 */ }
  }
};
```

### 9.5 BaseWindow 中的 Preload 注入

```javascript
// src/window/BaseWindow.js
const preloadPath = require.resolve('@org/base-client/src/preload');

_createWindow(options) {
  return new BrowserWindow({
    ...options,
    webPreferences: {
      ...options.webPreferences,
      preload: preloadPath,  // 框架内置 preload
      contextIsolation: true,
      nodeIntegration: false
    }
  });
}
```

### 9.6 渲染进程使用

```javascript
// Service 调用
const config = await window.appService.config.get();

// Notice 订阅
const unlisten = window.preload.notice.on('update.progress', (data) => {
  this.progress = data.percent;
});

// 清理
unlisten();
```

---

## 十、框架主入口

```javascript
// src/index.js
module.exports = {
  // 初始化
  initService: require('./service').init,
  initNotice: require('./notice').init,

  // 核心类
  BaseWindow: require('./window/BaseWindow'),

  // 配置工厂
  MainFactory: require('./config/factories/MainFactory'),
  PreloadFactory: require('./config/factories/PreloadFactory'),
  RendererFactory: require('./config/factories/RendererFactory'),

  // 共享
  enum: require('./shared/enum'),
  utils: require('./shared/utils'),

  // 版本
  VERSION: require('../package.json').version
};
```

---

## 十一、用户使用方式

### 11.1 安装

```bash
npm install @org/base-client
```

### 11.2 项目结构

```
用户项目/
├── src/
│   ├── main/
│   │   ├── index.js
│   │   ├── service/          # 用户自定义 service
│   │   └── notices/          # 用户自定义 notice
│   └── renderer/
│       └── index.html
└── package.json
```

**注意**：用户不需要创建 preload，框架内置的 preload 由 BaseWindow 自动加载。

### 11.3 package.json 配置

```json
{
  "scripts": {
    "dev": "base-client dev",
    "build": "base-client build",
    "preview": "base-client preview"
  }
}
```

### 11.4 用户主进程入口

```javascript
// src/main/index.js
const { initService, initNotice, BaseWindow } = require('@org/base-client');
const path = require('path');

app.whenReady(() => {
  initService({ userServiceDir: path.join(__dirname, 'service') });
  initNotice({ userNoticeDir: path.join(__dirname, 'notices') });
  new MainWindow().create();
});

class MainWindow extends BaseWindow {
  getPageUrl() { return 'http://localhost:9000' }
  getWindowOptions() { return { width: 1280, height: 800 } }
}
```

---

## 十二、设计原则

1. **四层架构**：CLI 层 → 构建层 → 框架核心层 → Preload 层
2. **框架能力在 src/** — 用户能用的全部在 src/ 中
3. **CLI 驱动** — 用户通过 `base-client` 命令使用框架
4. **配置工厂化** — Config Factory 统一管理构建配置
5. **运行时反射** — Preload 动态获取 schema，无需写死
6. **Service 与 Notice 分离** — 请求-响应 vs 推送模式独立
7. **Preload 层由框架提供** — 用户不实现 preload，只在 BaseWindow 中使用