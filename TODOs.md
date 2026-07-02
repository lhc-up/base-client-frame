- [x] 判断当前环境可以提取为工具函数，现在到处都是通过`process.env.NODE_ENV === 'delvelopment'`这样来判断；
- [x] 打印日志封装一下？好看或精简一些？现在通过框架打印出来的日志都是黑白的，区分度不高；
- [x] 调试、打包时，控制台市中心显示当前环境、访问地址等信息，可接管webpack的输出（不覆盖错误日志）
- [x] 框架内置的环境变量，如何友好的提供给使用者，基于约定；
- [x] 调试、打包web端（dev:web ✓ / build ✓ / dev:app ✓ / pack ✓ / 加密 ✓ / bytenode ✓ / child ✓ / installer ✓）
- [x] 用户通过命令行传入的参数如何使用，比如--sign，--child等，如何在构建过程中使用，比如electron-builder.config中？

### pack优化
- [x] 让用户只提供一个icon，frame框架自动适配各平台
- [x] 各平台脚本，如windows自定义nsis脚本、deb钩子脚本等，这些需要构建过程动态生成（模板替换变量；具体宏/脚本逻辑用户在 builder.config 内补）
- [ ] 龙芯打包时设置electron镜像源
- [x] 打包参数预设，框架和用户的边界（preset + customMerge + replace 三层）
- [ ] 参考base-client.bake，找出其他需要注意的点

### 已知问题（待 Phase 全部完成后统一处理）
- [ ] `tests/unit/e2e-dev-web.test.js` 单跑 30s 超时挂掉（P1 commit 时已存在）。根因：`runCommand(cmd)` 中 `cmd.action` 是常驻进程（dev-server）不 resolve，`await` 永挂。同时 `runDevServerMod.runDevServer` 属性替换 hook 因 dev-web.js 解构导入而拿不到 server 引用（E2E dev:app 同样问题，但已改用 `jest.mock` 规避）。修法候选：(1) 让 action 在 dev-server up 后 resolve 而非永挂；(2) E2E 用 `jest.mock` 替换属性赋值 hook；(3) 测试用超时竞速代替 await。需统一各 dev:* 命令的"action 何时 resolve"语义。

### 第二版 review 已完成（2026-06-29）

- [x] buildInfoPlugin 改为逐字段注入 `__BC_BUILD__.<k>`（设计 §6.3）
- [x] dispatcher 完整 preload bc.config / electron-builder.config，结果挂 `ctx.userConfig` / `ctx.userBuilderConfig`，避免用户函数被调多次
- [x] dev:web SIGINT 走 `server.stop()`（对齐 dev:app）
- [x] pack --dir 未产出可识别 unpacked 目录时 logger.warn
- [x] dispatcher 错误格式加"失败："文案；process.title 加 BC_ENV ?? '?' 兜底
- [x] target 字面量收敛至 `core/target.js`：bc-config / build-info 改用 TARGETS.APP / WEB
- [x] 卸载未使用的 lodash 依赖
- [x] 去重 --pack-config（保留 cli 全局声明，pack/installer options 数组移除）
- [x] src/index.js 补 createCli / TARGETS / MODES / replace / customMerge / logger 公共导出
- [x] 设计文档 §10.6 / §4.1 dev:app / §12.3 spinner 三处修订