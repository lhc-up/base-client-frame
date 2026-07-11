# Frame fix-list stage2 · 修复回复

**日期**：2026-07-11
**分支**：master
**对应清单**：`frame-fix-list.2026-07-11-stage2.md`（3 条，本文按其序号 H1 / M1 / M2 一一对应）

---

## H1 · FB-023 · preset 硬编码单入口 → 多入口友好默认

**处理方式**：走反馈"方案 A"的等价简化版 —— preset `entry` 直接对象化 + `output.filename` 用 `[name].js` 占位符。无需引入"检测 override 就跳过默认 entry"的分支逻辑，webpack-merge 对对象 entry 的 deep merge 天然承接"追加"语义。

**改动定位**：

- `src/config/presets/preload.js:13,16`：`entry: 'src/preload/index.js'` → `entry: { index: path.resolve(rootDir, 'src/preload/index.js') }`；`filename: 'index.js'` → `filename: '[name].js'`
- `src/config/presets/renderer.js:13,16`：同款改动（反馈明确 renderer 段一并处理）
- **main preset 不动**（`src/config/presets/main.js`）：Electron 主进程惯例单入口，反馈范围外，保持字符串 entry + `index.js` filename

**业务侧写法（沙盘可回滚 defensive）**：

```js
// bc.config.js —— 只写"追加 update 入口"，index 主入口走 preset 默认
module.exports = {
    preload: {
        entry: { update: 'src/preload/update.js' },
    },
    renderer: {
        entry: { update: 'src/renderer/update.js' },
        plugins: [
            new HtmlWebpackPlugin({ filename: 'index.html',  chunks: ['index'],  template: 'src/renderer/index.html' }),
            new HtmlWebpackPlugin({ filename: 'update.html', chunks: ['update'], template: 'src/renderer/update.html' }),
        ],
    },
};
```

产物平铺：`app/preload/{index,update}.js` / `app/renderer/{index,update}.js`。**不再需要 override `output.filename`**，也不再需要在 entry 里重复写主入口 key。

**Spec 同步**：`2026-06-24-frame-design.md`

- §6.1 三进程预设表格：preload/renderer 的"默认 entry"改为 `{ index: '…' }`、"`output.filename`"改为 `[name].js`；main 保持不变
- §6.1 原"renderer 默认单入口"段落整段重写为"preload / renderer 多入口友好默认"，给出上述 `bc.config.js` 示例代码；显式点出 "UpdateWindow 独立 preload" 作为多入口场景

**验证**：

- `tests/unit/config/presets-preload.test.js` / `presets-renderer.test.js` 断言更新（entry 对象形态 + filename 占位符）
- `tests/unit/e2e-pack-enhancements.test.js` + `tests/fixtures/minimal-pack-full/bc.config.js` 按新姿势重写：业务从旧的"整段 override entry `{ renderer, update }`"改成"只追加 `{ update }`"；产物断言从 `app/update/index.js` 平铺化到 `app/renderer/update.js`
- 全套 jest 通过（本轮相关 test 全绿）

---

## M1 · FB-020 · `RENDERER_DEV_URL` 尾斜杠兜底

**处理方式**：走反馈"方案 A" —— frame `dev-app.js` 派发 `RENDERER_DEV_URL` 时保证含尾斜杠。一处兜底、业务无感、无 runtime helper。

**改动定位**：

- `src/cli/commands/dev-app.js:63`：`` `http://${devServerOptions.host}:${devServerOptions.port}` `` → `` `http://${devServerOptions.host}:${devServerOptions.port}/` ``

**业务侧写法（沙盘可回滚 defensive）**：

```js
// 直接拼子路径即通，不再需要 endsWith('/') 兜底
const url = process.env.RENDERER_DEV_URL + 'update.html';
```

**Spec 同步**：

- §7.1 dev:app 流程步骤 ③ env 注入描述追加"（含尾斜杠）"
- §7.1.1 dev-app 运行时 env 契约表格 `RENDERER_DEV_URL` 值列示例从 `http://localhost:8023` → `http://localhost:8023/`，语义列追加"业务多入口拼子路径可直接 `RENDERER_DEV_URL + 'update.html'`"

**验证**：`tests/unit/e2e-dev-app.test.js` 断言 `opts.env.RENDERER_DEV_URL` 从 `'http://localhost:19023'` → `'http://localhost:19023/'`，PASS。

---

## M2 · FB-024 · Electron 主进程 stdout Windows 中文乱码

**处理方式**：走反馈"方案 A" —— frame CLI 侧 spawn Electron 改 stdio 显式三路，stdout / stderr pipe 后由父 CLI 转发（父 CLI 的 Node 侧走 `process.stdout.write(string)` → WriteConsoleW UTF-16 路径，Windows conhost 显示正常）。

**改动定位**：`src/cli/commands/dev-app.js:72-81`

```js
const child = cp.spawn(electronExe, [mainEntry], {
    stdio: ['inherit', 'pipe', 'pipe'],   // stdin 保留 inherit（Electron 可能读交互）
    env: { ...process.env, NODE_ENV: 'development', RENDERER_DEV_URL: devUrl },
});
child.stdout.on('data', (chunk) => process.stdout.write(chunk.toString('utf8')));
child.stderr.on('data', (chunk) => process.stderr.write(chunk.toString('utf8')));
```

**生命周期不变**：`child.on('close')` / `killElectron(child)` / `SIGINT` 处理均不受 pipe 模式影响。

**业务侧变化**：沙盘可回滚"主进程 log 一律 ASCII"约束；`ctx.logger.info('[main] boot 完成…')` 中文恢复正常。

**验证**：

- `tests/unit/e2e-dev-app.test.js` 补断言 `opts.stdio === ['inherit', 'pipe', 'pipe']`；mock 子进程补 `stdout` / `stderr` 两个 `EventEmitter`
- **真机验证建议**：沙盘 Windows conhost 下跑一次 `dev:app`，主进程 `console.log('中文消息')` 显示正常（本轮 unit test 未覆盖 Windows 端真实字节流路径）

---

## 备注

- 反馈末尾提到 spec §7 FR-b "UpdateWindow 独立 preload 未验证 gap → 已确认触发"：frame spec 全文 grep 无 `FR-b` 字样，判断为沙盘侧内部编号。已在 spec §6.1 preload/renderer 段落改写时显式点出 "UpdateWindow 独立 preload" 作为多入口示例场景，等价承接
- 反馈里 `main` preset 未提及，本轮未动（Electron 主进程惯例单入口）；如未来主进程也需多入口场景再动
- 老 pack-enhancements fixture 里业务 `entry: { renderer, update }` + 旧 preset `filename: 'index.js'` 组合在改动前本就是 webpack 多 chunk 同名冲突（stash 对照验证），改动后走"追加 update key + 平铺产物"闭环
- 剩余 2 处 jest 失败（`pack/shell.test.js` 1 例 + `e2e-dev-web.test.js` suite 起不来）与本轮改动无关，改动前已存在（stash 对照验证），独立挂账
- 沙盘侧回滚 defensive 项（stage2 汇总里的 3 项：UpdateWindow 尾斜杠兜底、preload 段全字段 override、主进程 log 全 ASCII）修完后均可撤

## 本轮完成信号

- ✓ FB-023 修（preload + renderer preset）
- ✓ FB-020 修（dev URL 尾斜杠）
- ✓ FB-024 修（Electron stdio pipe 转发）
- ✓ Spec `2026-06-24-frame-design.md` 同步（§6.1 表格 / renderer 段落 / §7.1 步骤 / §7.1.1 契约表格）
- ✓ 测试 & fixture 联动更新
- ✓ 单一 commit 收敛（sha 见 `git log master`）
