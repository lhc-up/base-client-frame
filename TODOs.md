- [x] 判断当前环境可以提取为工具函数，现在到处都是通过`process.env.NODE_ENV === 'delvelopment'`这样来判断；
- [x] 打印日志封装一下？好看或精简一些？现在通过框架打印出来的日志都是黑白的，区分度不高；
- [x] 调试、打包时，控制台市中心显示当前环境、访问地址等信息，可接管webpack的输出（不覆盖错误日志）
- [x] 框架内置的环境变量，如何友好的提供给使用者，基于约定；
- [ ] 调试、打包web端（dev:web ✓ / build ✓ / dev:app ✓ / pack ✓ ；P5 加密+bytenode、P6 child/installer 待补）
- [x] 用户通过命令行传入的参数如何使用，比如--sign，--child等，如何在构建过程中使用，比如electron-builder.config中？

### pack优化
- [ ] 让用户只提供一个icon，frame框架自动适配各平台；
- [ ] 各平台脚本，如windows自定义nsis脚本、deb钩子脚本等，这些需要构建过程动态生成
- [ ] 龙芯打包时设置electron镜像源
- [ ] 打包参数预设，框架和用户的边界
- [ ] 参考base-client.bake，找出其他需要注意的点

### 已知问题（待 Phase 全部完成后统一处理）
- [ ] `tests/unit/e2e-dev-web.test.js` 单跑 30s 超时挂掉（P1 commit 时已存在）。根因：`runCommand(cmd)` 中 `cmd.action` 是常驻进程（dev-server）不 resolve，`await` 永挂。同时 `runDevServerMod.runDevServer` 属性替换 hook 因 dev-web.js 解构导入而拿不到 server 引用（E2E dev:app 同样问题，但已改用 `jest.mock` 规避）。修法候选：(1) 让 action 在 dev-server up 后 resolve 而非永挂；(2) E2E 用 `jest.mock` 替换属性赋值 hook；(3) 测试用超时竞速代替 await。需统一各 dev:* 命令的"action 何时 resolve"语义。