# Base Client Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Electron 基础框架的核心能力：CLI、Config Factory、Service、Notice、BaseWindow、Preload 桥接

**Architecture:** 四层架构（CLI 层、构建层、框架核心层、Preload 层）。采用 Config Factory 模式统一管理 Webpack 配置；Service/Notice 机制实现主进程与渲染进程的通信；BaseWindow 提供窗口基类；Preload 由框架内置，用户无感知。

**Tech Stack:** Electron, Webpack, CAC (CLI), IPC

---

## 文件结构

```
src/
├── index.js                    # 框架主入口
├── cli/
│   ├── index.js               # CAC 配置
│   └── commands/
│       ├── dev.js            # dev 命令
│       ├── build.js          # build 命令
│       └── preview.js        # preview 命令
├── config/
│   ├── index.js              # 导出工厂
│   ├── Factory.js            # 基类
│   ├── factories/
│   │   ├── MainFactory.js
│   │   ├── PreloadFactory.js
│   │   └── RendererFactory.js
│   └── presets/
│       ├── MainPreset.js
│       ├── PreloadPreset.js
│       └── RendererPreset.js
├── service/
│   ├── index.js              # init(), getServiceList(), register(), cleanup()
│   └── schema.js             # 框架 service 定义
├── notice/
│   ├── index.js              # init(), broadcast(), direct(), register(), getSchema(), cleanupWindow()
│   └── schema.js             # 框架 event 定义
├── window/
│   └── BaseWindow.js         # 窗口基类
└── preload/
    ├── index.js              # 入口
    ├── service.js            # window.appService 动态生成
    └── notice.js             # window.preload.notice

bin/
└── base-client.js            # CLI 入口
```

---

## Phase 1: CLI 层

### Task 1: CLI 入口

**Files:**
- Create: `bin/base-client.js`

- [ ] **Step 1: 创建 CLI 入口脚本**

```javascript
#!/usr/bin/env node

const { cli } = require('../dist/cli');

cli.parse();
```

- [ ] **Step 2: 创建 CLI 模块**

Create: `src/cli/index.js`

```javascript
const { cac } = require('cac');
const { version } = require('../../package.json');

const cli = cac('base-client');

cli.command('dev', '启动开发服务器 + Electron')
  .action(async () => {
    const { dev } = await import('./commands/dev.js');
    await dev();
  });

cli.command('build', '生产环境构建')
  .action(async () => {
    const { build } = await import('./commands/build.js');
    await build();
  });

cli.command('preview', '预览构建结果')
  .action(async () => {
    const { preview } = await import('./commands/preview.js');
    await preview();
  });

cli.help();
cli.version(version);

module.exports = { cli };
```

- [ ] **Step 3: 创建 dev 命令**

Create: `src/cli/commands/dev.js`

```javascript
const { spawn } = require('child_process');

async function dev() {
  console.log('[Base] 启动开发模式...');
  // TODO: 启动 Vite dev server + Electron
}

module.exports = { dev };
```

- [ ] **Step 4: 创建 build 命令**

Create: `src/cli/commands/build.js`

```javascript
async function build() {
  console.log('[Base] 开始构建...');
  // TODO: 调用 Config Factory 构建三个进程
}

module.exports = { build };
```

- [ ] **Step 5: 创建 preview 命令**

Create: `src/cli/commands/preview.js`

```javascript
async function preview() {
  console.log('[Base] 启动预览...');
  // TODO: 启动 Electron 预览构建结果
}

module.exports = { preview };
```

- [ ] **Step 6: 配置 package.json bin**

Modify: `package.json` - 添加 bin 字段

```json
{
  "bin": {
    "base-client": "./bin/base-client.js"
  }
}
```

- [ ] **Step 7: 提交**

```bash
git add bin/ src/cli/ package.json
git commit -m "feat(cli): add base-client CLI entry"
```

---

## Phase 2: Config Factory

### Task 2: Factory 基类和三个工厂

**Files:**
- Create: `src/config/Factory.js`
- Create: `src/config/factories/MainFactory.js`
- Create: `src/config/factories/PreloadFactory.js`
- Create: `src/config/factories/RendererFactory.js`
- Create: `src/config/index.js`

- [ ] **Step 1: 创建 Factory 基类**

Create: `src/config/Factory.js`

```javascript
const { merge } = require('lodash');

class Factory {
  constructor(name, { target, outDir, externals = [] }) {
    this.name = name;
    this.target = target;
    this.outDir = outDir;
    this.externals = externals;
  }

  create(userConfig = {}) {
    const preset = this.getPreset();
    const merged = merge({}, preset, userConfig);
    this.applyPlugins(merged);
    return merged;
  }

  getPreset() {
    throw new Error('子类必须实现 getPreset()');
  }

  applyPlugins(config) {
    // 注册 preset + 插件
    return config;
  }
}

module.exports = Factory;
```

- [ ] **Step 2: 创建 MainFactory**

Create: `src/config/factories/MainFactory.js`

```javascript
const Factory = require('../Factory');

const ELECTRON_NODE_VERSIONS = {
  41: '24.14',
  40: '24.14',
  39: '22.20',
  38: '22.19',
  // ...
};

function getElectronNodeVersion() {
  // 从 Electron 版本获取 Node 版本
  const electronVersion = parseInt(require('electron').version.slice(1));
  return ELECTRON_NODE_VERSIONS[electronVersion] || '22.19';
}

function electronSupportsESM() {
  const electronVersion = parseInt(require('electron').version.slice(1));
  return electronVersion >= 28;
}

class MainFactory extends Factory {
  constructor() {
    super('main', {
      target: `node${getElectronNodeVersion()}`,
      outDir: 'out/main',
      externals: ['electron', ...require('module').builtinModules]
    });
  }

  getPreset() {
    return {
      target: this.target,
      outDir: this.outDir,
      externals: this.externals,
      format: electronSupportsESM() ? 'esm' : 'cjs'
    };
  }
}

module.exports = MainFactory;
```

- [ ] **Step 3: 创建 PreloadFactory**

Create: `src/config/factories/PreloadFactory.js`

```javascript
const Factory = require('../Factory');

class PreloadFactory extends Factory {
  constructor() {
    super('preload', {
      target: `node${getElectronNodeVersion()}`,
      outDir: 'out/preload',
      externals: ['electron', ...require('module').builtinModules]
    });
  }

  getPreset() {
    return {
      target: this.target,
      outDir: this.outDir,
      externals: this.externals,
      resolve: {
        mainFields: ['browser', 'module', 'jsnext:main', 'jsnext']
      },
      format: 'cjs'
    };
  }
}

module.exports = PreloadFactory;
```

- [ ] **Step 4: 创建 RendererFactory**

Create: `src/config/factories/RendererFactory.js`

```javascript
const Factory = require('../Factory');

const ELECTRON_CHROME_VERSIONS = {
  41: '146',
  40: '144',
  39: '142',
  // ...
};

function getElectronChromeVersion() {
  const electronVersion = parseInt(require('electron').version.slice(1));
  return ELECTRON_CHROME_VERSIONS[electronVersion] || '120';
}

class RendererFactory extends Factory {
  constructor() {
    super('renderer', {
      target: `chrome${getElectronChromeVersion()}`,
      outDir: 'out/renderer'
    });
  }

  getPreset() {
    return {
      target: this.target,
      outDir: this.outDir
    };
  }
}

module.exports = RendererFactory;
```

- [ ] **Step 5: 创建 config 导出**

Create: `src/config/index.js`

```javascript
const Factory = require('./Factory');
const MainFactory = require('./factories/MainFactory');
const PreloadFactory = require('./factories/PreloadFactory');
const RendererFactory = require('./factories/RendererFactory');

module.exports = {
  Factory,
  MainFactory,
  PreloadFactory,
  RendererFactory
};
```

- [ ] **Step 6: 提交**

```bash
git add src/config/
git commit -m "feat(config): add Config Factory implementation"
```

---

### Task 3: Preset 机制

**Files:**
- Create: `src/config/presets/MainPreset.js`
- Create: `src/config/presets/PreloadPreset.js`
- Create: `src/config/presets/RendererPreset.js`

- [ ] **Step 1: 创建 MainPreset**

Create: `src/config/presets/MainPreset.js`

```javascript
module.exports = {
  apply(config, factory) {
    return {
      ...config,
      target: factory.target,
      outDir: factory.outDir,
      externals: factory.externals,
      format: factory.format
    };
  }
};
```

- [ ] **Step 2: 创建 PreloadPreset**

Create: `src/config/presets/PreloadPreset.js`

```javascript
module.exports = {
  apply(config, factory) {
    return {
      ...config,
      target: factory.target,
      outDir: factory.outDir,
      externals: factory.externals,
      resolve: {
        mainFields: ['browser', 'module', 'jsnext:main', 'jsnext']
      },
      format: 'cjs'
    };
  }
};
```

- [ ] **Step 3: 创建 RendererPreset**

Create: `src/config/presets/RendererPreset.js`

```javascript
module.exports = {
  apply(config, factory) {
    return {
      ...config,
      target: factory.target,
      outDir: factory.outDir
    };
  }
};
```

- [ ] **Step 4: 更新 Factory 基类集成 Preset**

Modify: `src/config/Factory.js:21-24`

```javascript
applyPlugins(config) {
  const preset = require(`./presets/${this.name}Preset`);
  return preset.apply(config, this);
}
```

- [ ] **Step 5: 提交**

```bash
git add src/config/presets/
git commit -m "feat(config): add Preset mechanism"
```

---

## Phase 3: Service 机制

### Task 4: Service 核心实现

**Files:**
- Create: `src/service/index.js`
- Create: `src/service/schema.js`

- [ ] **Step 1: 创建 Service schema**

Create: `src/service/schema.js`

```javascript
const schema = [
  {
    namespace: 'system',
    handlers: ['getVersion', 'getServiceList']
  },
  {
    namespace: 'app',
    handlers: ['restartApp', 'quitApp', 'minimizeApp']
  },
  {
    namespace: 'store',
    handlers: ['set', 'get', 'remove']
  }
];

module.exports = schema;
```

- [ ] **Step 2: 创建 Service 主模块**

Create: `src/service/index.js`

```javascript
const schema = require('./schema');
const { ipcMain } = require('electron');

let registeredNamespaces = new Set();
let serviceSchemas = [...schema];

function init({ userServiceDir }) {
  // 注册内置 service handlers
  for (const s of schema) {
    registerService(s.namespace, s.handlers);
  }

  // 注册 'service:getServiceList' IPC handler
  ipcMain.handle('service:getServiceList', () => {
    return serviceSchemas;
  });

  // 扫描用户 service 目录
  if (userServiceDir) {
    scanUserServices(userServiceDir);
  }
}

function registerService(namespace, handlers) {
  if (registeredNamespaces.has(namespace)) {
    throw new Error(`[Base] Service namespace "${namespace}" 冲突，请检查框架内置和用户定义`);
  }
  registeredNamespaces.add(namespace);
  // 注册 handlers 到 ipcMain
  for (const handler of handlers) {
    // handler 注册逻辑
  }
}

function scanUserServices(dir) {
  const fs = require('fs');
  const path = require('path');
  const files = fs.readdirSync(dir);

  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const service = require(path.join(dir, file));
    registerService(service.namespace, service.handlers);
    serviceSchemas.push({ namespace: service.namespace, handlers: service.handlers });
  }
}

function getServiceList() {
  return serviceSchemas;
}

function register(namespace, handlers) {
  registerService(namespace, handlers);
  serviceSchemas.push({ namespace, handlers });
}

function cleanup() {
  // 清理所有注册的 handler
}

module.exports = { init, getServiceList, register, cleanup };
```

- [ ] **Step 3: 提交**

```bash
git add src/service/
git commit -m "feat(service): implement Service mechanism"
```

---

## Phase 4: Notice 机制

### Task 5: Notice 核心实现

**Files:**
- Create: `src/notice/index.js`
- Create: `src/notice/schema.js`

- [ ] **Step 1: 创建 Notice schema**

Create: `src/notice/schema.js`

```javascript
const schema = {
  system: {
    events: {
      networkDisconnected: { description: '网络断开', broadcast: true },
      lowBattery: { description: '电量不足', broadcast: true }
    }
  },
  app: {
    events: {
      started: { description: '应用启动', broadcast: true },
      closed: { description: '应用关闭', broadcast: true }
    }
  },
  update: {
    events: {
      progress: { description: '更新进度', broadcast: false },
      completed: { description: '更新完成', broadcast: false },
      error: { description: '更新失败', broadcast: false }
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

module.exports = schema;
```

- [ ] **Step 2: 创建 Notice 主模块**

Create: `src/notice/index.js`

```javascript
const schema = require('./schema');
const { ipcMain, BrowserWindow } = require('electron');

let registeredNamespaces = new Map();
let fullSchema = { ...schema };

function init({ userNoticeDir }) {
  // 合并内置 schema
  for (const [namespace, events] of Object.entries(schema)) {
    registerEvents(namespace, events);
  }

  // 注册 'notice:getSchema' IPC handler
  ipcMain.handle('notice:getSchema', () => {
    return fullSchema;
  });

  // 扫描用户 notices 目录
  if (userNoticeDir) {
    scanUserNotices(userNoticeDir);
  }
}

function registerEvents(namespace, events) {
  if (registeredNamespaces.has(namespace)) {
    throw new Error(`[Base] Notice namespace "${namespace}" 冲突`);
  }
  registeredNamespaces.set(namespace, events);
}

function scanUserNotices(dir) {
  const fs = require('fs');
  const path = require('path');
  const files = fs.readdirSync(dir);

  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const notice = require(path.join(dir, file));
    registerEvents(notice.namespace, notice.events);
    fullSchema[notice.namespace] = notice.events;
  }
}

function broadcast(event, data) {
  const [namespace, eventName] = event.split('.');
  const events = registeredNamespaces.get(namespace);
  if (!events || !events[eventName]) {
    throw new Error(`[Base] Notice 事件 "${event}" 未注册`);
  }
  if (!events[eventName].broadcast) {
    throw new Error(`[Base] 事件 "${event}" broadcast=true 才能使用 broadcast()`);
  }
  // 发送给所有窗口
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('notice:event', event, data);
  }
}

function direct(event, windowId, data) {
  const [namespace, eventName] = event.split('.');
  const events = registeredNamespaces.get(namespace);
  if (!events || !events[eventName]) {
    throw new Error(`[Base] Notice 事件 "${event}" 未注册`);
  }
  if (events[eventName].broadcast) {
    throw new Error(`[Base] 事件 "${event}" broadcast=false 才能使用 direct()`);
  }
  const win = BrowserWindow.fromId(windowId);
  if (win) {
    win.webContents.send('notice:event', event, data);
  }
}

function getSchema() {
  return fullSchema;
}

function cleanupWindow(windowId) {
  // 窗口关闭时清理订阅（由主进程调用）
}

module.exports = { init, broadcast, direct, register, getSchema, cleanupWindow };
```

- [ ] **Step 3: 提交**

```bash
git add src/notice/
git commit -m "feat(notice): implement Notice mechanism"
```

---

## Phase 5: BaseWindow

### Task 6: BaseWindow 基类

**Files:**
- Create: `src/window/BaseWindow.js`

- [ ] **Step 1: 创建 BaseWindow 类**

Create: `src/window/BaseWindow.js`

```javascript
const { BrowserWindow } = require('electron');
const path = require('path');
const preloadPath = require('../preload/index.js');

class BaseWindow {
  constructor(options = {}) {
    this.options = options;
    this.browserWindow = null;
  }

  // ==================== 抽象方法（子类必须实现） ====================
  getPageUrl() {
    throw new Error('子类必须实现 getPageUrl()');
  }

  getWindowOptions() {
    return {};
  }

  // ==================== 可覆盖的钩子 ====================
  onBeforeCreate(options) {
    return options;
  }

  onCreated(window) {
  }

  onClosed() {
  }

  // ==================== 模板方法 ====================
  create() {
    const userOptions = this.getWindowOptions();
    const mergedOptions = this.onBeforeCreate(userOptions);
    const window = this._createWindow(mergedOptions);
    this._setupEventListeners(window);
    this.onCreated(window);
    return window;
  }

  _createWindow(options) {
    return new BrowserWindow({
      ...options,
      webPreferences: {
        ...options.webPreferences,
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
  }

  _setupEventListeners(window) {
    window.on('closed', () => {
      this.browserWindow = null;
      this.onClosed();
    });
  }

  // ==================== 实例方法 ====================
  center() {
    this.browserWindow?.center();
  }

  show() {
    this.browserWindow?.show();
  }

  hide() {
    this.browserWindow?.hide();
  }

  close() {
    this.browserWindow?.close();
  }

  getId() {
    return this.browserWindow?.id;
  }

  getWebContents() {
    return this.browserWindow?.webContents;
  }

  send(channel, data) {
    this.browserWindow?.webContents.send(channel, data);
  }

  isDestroyed() {
    return this.browserWindow?.isDestroyed() ?? true;
  }
}

module.exports = BaseWindow;
```

- [ ] **Step 2: 提交**

```bash
git add src/window/BaseWindow.js
git commit -m "feat(window): add BaseWindow class"
```

---

## Phase 6: Preload 桥接

### Task 7: Preload Service 桥接

**Files:**
- Create: `src/preload/service.js`

- [ ] **Step 1: 创建 Preload Service 桥接**

Create: `src/preload/service.js`

```javascript
const { ipcRenderer } = require('electron');

const REPLY_ERROR_KEY = '__ipcError';

let apiCache = null;

function replaceCallbacksWithChannels(channel, args) {
  const tempChannels = [];
  for (const option of args) {
    if (typeof option !== 'object' || option === null) continue;
    for (const key in option) {
      const callback = option[key];
      if (typeof callback !== 'function') continue;
      const callbackChannel = `${channel}-${key}-${Date.now()}-${Math.random()}`;
      ipcRenderer.on(callbackChannel, (event, data) => callback(data));
      option[key] = callbackChannel;
      tempChannels.push(callbackChannel);
    }
  }
  return tempChannels;
}

async function invokeWithCallback(channel, ...args) {
  const tempChannels = replaceCallbacksWithChannels(channel, args);
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } finally {
    for (const c of tempChannels) ipcRenderer.removeAllListeners(c);
  }
}

async function getApi() {
  if (apiCache) return apiCache;

  // 首次调用时获取 schema
  const schemas = await ipcRenderer.invoke('service:getServiceList');

  const api = {};
  for (const s of schemas) {
    const scopeApi = {};
    for (const handler of s.handlers) {
      const channel = `${s.namespace}:${handler}`;
      scopeApi[handler] = async (...args) => invokeWithCallback(channel, ...args);
    }
    api[s.namespace] = scopeApi;
  }

  apiCache = api;
  return api;
}

// 懒加载：首次 IPC 调用时初始化
let initPromise = null;
function ensureInit() {
  if (!initPromise) {
    initPromise = getApi();
  }
  return initPromise;
}

// 代理对象，首次访问时初始化
const handler = {
  get(target, prop) {
    ensureInit();
    return new Proxy({}, {
      get(target2, prop2) {
        ensureInit().then(api => {
          if (api[prop] && api[prop][prop2]) {
            target[prop] = api[prop];
          }
        });
        return (...args) => {
          return ensureInit().then(api => api[prop][prop2](...args));
        };
      }
    });
  }
};

module.exports = new Proxy({}, handler);
```

- [ ] **Step 2: 提交**

```bash
git add src/preload/service.js
git commit -m "feat(preload): add dynamic Service bridge"
```

---

### Task 8: Preload Notice 桥接

**Files:**
- Create: `src/preload/notice.js`

- [ ] **Step 1: 创建 Preload Notice 桥接**

Create: `src/preload/notice.js`

```javascript
const { ipcRenderer } = require('electron');

let currentWindowId = null;
const subscriptions = new Map();

function init(windowId) {
  currentWindowId = windowId;
}

function on(eventName, callback) {
  if (!currentWindowId) {
    throw new Error('Notice not initialized with windowId');
  }
  if (!subscriptions.has(eventName)) {
    subscriptions.set(eventName, new Set());
    ipcRenderer.send('notice:subscribe', currentWindowId, eventName);
  }
  subscriptions.get(eventName).add(callback);
  return () => off(eventName, callback);
}

function off(eventName, callback) {
  if (!currentWindowId) return;
  if (!subscriptions.has(eventName)) return;

  if (callback) {
    subscriptions.get(eventName).delete(callback);
  } else {
    subscriptions.delete(eventName);
    ipcRenderer.send('notice:unsubscribe', currentWindowId, eventName);
    return;
  }

  if (subscriptions.get(eventName).size === 0) {
    subscriptions.delete(eventName);
    ipcRenderer.send('notice:unsubscribe', currentWindowId, eventName);
  }
}

function once(eventName, callback) {
  const unlisten = on(eventName, (data) => {
    unlisten();
    callback(data);
  });
  return unlisten;
}

// Listen for events from main process
ipcRenderer.on('notice:event', (event, eventName, data) => {
  const callbacks = subscriptions.get(eventName);
  if (callbacks) {
    callbacks.forEach(cb => cb(data));
  }
});

// Listen for window ID from main process
ipcRenderer.on('notice:setWindowId', (event, windowId) => {
  init(windowId);
});

module.exports = { init, on, off, once };
```

- [ ] **Step 2: 创建 Preload 入口**

Create: `src/preload/index.js`

```javascript
const { contextBridge, ipcRenderer } = require('electron');
const serviceApi = require('./service.js');
const noticeApi = require('./notice.js');

const preload = {
  service: serviceApi,
  notice: {
    on: noticeApi.on,
    off: noticeApi.off,
    once: noticeApi.once
  }
};

// 通知主进程窗口已准备好
ipcRenderer.send('preload:ready');

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('appService', serviceApi);
    contextBridge.exposeInMainWorld('preload', preload);
  } catch (error) {
    console.error(error);
    window.appService = serviceApi;
    window.preload = preload;
  }
} else {
  window.appService = serviceApi;
  window.preload = preload;
}
```

- [ ] **Step 3: 提交**

```bash
git add src/preload/
git commit -m "feat(preload): add Notice bridge and entry point"
```

---

## Phase 7: 框架主入口

### Task 9: 框架主入口

**Files:**
- Create: `src/index.js`

- [ ] **Step 1: 创建框架主入口**

Create: `src/index.js`

```javascript
const Service = require('./service');
const Notice = require('./notice');
const BaseWindow = require('./window/BaseWindow');
const { Factory, MainFactory, PreloadFactory, RendererFactory } = require('./config');
const shared = require('./shared');

module.exports = {
  // 初始化
  initService: Service.init,
  initNotice: Notice.init,

  // 核心类
  BaseWindow,

  // 配置工厂
  Factory,
  MainFactory,
  PreloadFactory,
  RendererFactory,

  // 共享
  enum: shared.enum,
  utils: shared.utils,

  // 版本
  VERSION: require('../package.json').version
};
```

- [ ] **Step 2: 创建空的 shared 模块（临时）**

Create: `src/shared/index.js`

```javascript
module.exports = {
  enum: {},
  utils: {}
};
```

- [ ] **Step 3: 提交**

```bash
git add src/index.js src/shared/
git commit -m "feat: add framework entry point"
```

---

## 总结

**实现顺序：**

| Phase | 内容 | Tasks |
|-------|------|-------|
| 1 | CLI 层 | 1 |
| 2 | Config Factory + Preset | 2-3 |
| 3 | Service 机制 | 4 |
| 4 | Notice 机制 | 5 |
| 5 | BaseWindow | 6 |
| 6 | Preload 桥接 | 7-8 |
| 7 | 框架主入口 | 9 |

**共 9 个 Task，预计 13+ commits**

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-18-framework-implementation.md`**

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**