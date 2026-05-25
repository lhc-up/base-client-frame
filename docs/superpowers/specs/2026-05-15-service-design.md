# Service 机制设计

## 一、概述

Service 是渲染进程与主进程通信的主要方式，采用请求-响应模式。

---

## 二、目录结构

```
框架包/
└── src/main/service/
    ├── index.js          # 扫描注册逻辑
    └── builtin/          # 框架内置 service
        └── system.js     # getServiceList 等

用户项目/
└── src/main/
    ├── index.js          # 入口，调用 initService
    └── service/          # 用户业务 service
        ├── config.js
        └── user.js
```

---

## 三、Service 格式

每个 service 文件导出：

```js
// src/main/service/config.js
module.exports = {
  namespace: 'config',
  handlers: ['get', 'update']  // 直接是方法名数组
}
```

---

## 四、Channel 约定

- 异步：`${namespace}:${handler}`，如 `config:get`
- 同步：`${namespace}:${handler}Sync`，如 `config:getSync`

---

## 五、同步/异步

双版本支持：
- 异步：返回 Promise
- 同步：方法名后加 `Sync`，直接返回结果

---

## 六、回调机制

参数中传入的回调函数会被替换为 channel，通过 `event.sender.send(channel, data)` 中转。

```js
// 渲染进程
appService.update.downloadInstaller({
  url: 'xxx',
  onProgress: (p) => console.log(p)  // 会被替换为 channel
})
```

---

## 七、动态发现

通过 `main:getServiceList` 获取所有已注册 service 的 schema 列表：

```js
[
  { namespace: 'config', handlers: ['get', 'update'] },
  { namespace: 'system', handlers: ['getServiceList'] }
]
```

---

## 八、初始化调用

```js
// 用户 src/main/index.js
const initService = require('@org/base-electron/main/service')
const path = require('path')

app.whenReady(() => {
  initService({
    userServiceDir: path.join(__dirname, 'service')
  })
  new MyWindow().create()
})
```

---

## 九、冲突处理

检测到 namespace 冲突时，直接抛出错误，终止启动。

```js
throw new Error(`[Base] Service namespace "${key}" 冲突，请检查框架内置和用户定义`)
```

---

## 十、目录结构与职责划分

```
src/main/service/
├── config/      # 配置能力 - 文件路径配置、全局数据访问
├── logger/      # 日志能力 - 日志输出
├── store/       # 存储能力 - 内存/文件存取
├── update/       # 升级能力 - 检查更新、下载、安装（不含窗口创建）
├── window/       # 窗口能力 - 窗口创建、管理
├── device/      # 硬件能力 - 键盘锁、屏幕分辨率等
├── system/      # 系统能力 - openByBrowser、getMacAddress、openTimeSetting
├── app/         # 应用生命周期 - restartApp、installApp、quitApp、minimizeApp
└── __example/   # 示例
```

---

## 十一、各 Service 职责

| Service | 职责 | 包含能力 |
|---------|------|----------|
| config | 配置 | getFilePathConfig, getGlobalData |
| logger | 日志 | log |
| store | 存储 | set, get, remove, setFile, getFile, removeFile |
| update | 升级 | getNewestPkg, downloadPkg, downloadInstaller |
| window | 窗口 | createMainWindow 等窗口相关 |
| device | 硬件 | lockKeyboard, unlockKeyboard, checkScreenResolution |
| system | 系统 | openByBrowser, getMacAddress, openTimeSetting |
| app | 应用生命周期 | restartApp, installApp, quitApp, minimizeApp |

---

## 十二、设计原则

- **libs** - 功能封装，尽量不耦合业务
- **service** - 能力暴露，可以是 libs 函数的简单暴露、组合暴露、或独立实现
- 一个 service 一个清晰边界，不会出现"这个功能放哪儿都行"的情况

---

## 十三、IPC 通信

渲染进程和主进程通过 service 通信，不需要其他通信方式。更新完成后的窗口切换也是通过 service 调用。