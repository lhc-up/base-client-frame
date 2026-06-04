# Frame M1 CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 frame 的 CLI 入口与命令派发框架：`runCommand` 派发器（initEnv → 组装 ctx → 调用 action → 统一错误处理）、`createCli` 注册器（cac 全局选项 + 命令清单注入）、命令清单文件、`bin/base-client.js` 发布入口。不实现任何具体命令（dev/build/preview/pack 由 M5/M6/M7 接入）。

**Architecture:** 三个文件协作：`src/cli/index.js` 暴露 `createCli(commands)` 工厂与 `runCommand(cmd, cliOptions)` 派发器；`src/cli/commands/index.js` 是命令清单（M1 创建为空数组，M5/M6/M7 各自往里 require 自己的命令模块）；`bin/base-client.js` 加载产物并 `cli.parse()`。CLI 注册采用**依赖注入**风格（命令清单作为参数传入 `createCli`），方便测试。

**Tech Stack:** Node 20+ / Jest 30 / cac 6 / CommonJS

> **Spec 参考**：`docs/superpowers/specs/2026-05-28-frame-m1-cli-design.md`

> **依赖前置**：M3 plan 的 `initEnv` 已实现（runCommand 直接 require 它）；M0 工程基线（Jest）已就绪。M2/M4 不强制依赖（M1 不调它们）。

> **与 spec §四 的微调**：spec 示例 `src/cli/index.js` 在模块顶层维护命令清单 + 创建单例 `cli`。本 plan 调整为**工厂模式** `createCli(commands)` —— 命令清单从 `./commands/index.js` 注入。理由：(1) 避免顶层副作用，测试时可传空清单；(2) M5/M6/M7 各自在 `./commands/index.js` 里加一行 require，互不耦合。对外 API（bin 调用 `createCli().parse()`）行为与 spec 等价。

---

## File Structure

**Create:**
- `src/cli/index.js` — `createCli` + `runCommand`
- `src/cli/commands/index.js` — 命令清单（M1 阶段为空数组）
- `bin/base-client.js` — 发布入口
- `tests/unit/cli-runCommand.test.js` — `runCommand` 单测
- `tests/unit/cli-createCli.test.js` — `createCli` 单测

**Modify:**
- 无（`cac` 与 `lodash` 已在 dependencies；jest 已在 devDependencies）

---

## Task 0：依赖核对

**Files:**（仅查看）

- [ ] **Step 0.1：确认 cac 已存在**

打开 `package.json` 确认 `dependencies.cac` 为 `^6.7.x`。若不存在则 `npm i cac@^6.7.14`。

- [ ] **Step 0.2：跑既有测试基线**

Run: `npm test`
Expected：M3 + M4 + M2 共 ≥ 52 个 case 全绿。

无需 commit（本 Task 不动文件）。

---

## Task 1：runCommand 派发器

**Files:**
- Create: `src/cli/index.js`
- Test: `tests/unit/cli-runCommand.test.js`

### 接口契约

```js
runCommand(cmd, cliOptions): Promise<void>
```

输入：
- `cmd`：命令模板 `{ name, description, mode?, skipEnv?, options?, action }`
- `cliOptions`：cac 解析得到的对象（含 `env` / `config` / `debug` / 命令专属字段）

行为：
1. `cmd.skipEnv === true` → `env = undefined`；否则 `env = initEnv(cliOptions.env)`
2. `mode = cmd.mode || 'production'`
3. 组装 `ctx = { cliOptions, env, mode, command: cmd.name }`
4. `await cmd.action(ctx)`
5. 任一步抛错 → `console.error('[base-client] <cmd> 失败：<message>')`；`cliOptions.debug` 为真时附打 stack；`process.exit(1)`

### TDD

- [ ] **Step 1.1：写"action 接收完整 ctx"测试**

```js
// tests/unit/cli-runCommand.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { withTempCwd } = require('./_helpers');

// 在 require src 前先设置全局工具
let exitSpy, errorSpy;
beforeEach(() => {
  // process.exit 在测试中抛错而不真退出，方便断言
  exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`__EXIT__:${code}`);
  });
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

const { runCommand } = require('../../src/cli');

describe('runCommand', () => {
  test('action 收到完整 ctx：cliOptions / env / mode / command', async () => {
    const tmp = withTempCwd();
    try {
      fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'BC_API=http://x\n');

      const action = jest.fn().mockResolvedValue();
      const cmd = {
        name: 'mycmd',
        mode: 'production',
        action,
      };
      const cliOptions = { env: 'prod', config: undefined, debug: false };

      await runCommand(cmd, cliOptions);

      expect(action).toHaveBeenCalledTimes(1);
      expect(action.mock.calls[0][0]).toEqual({
        cliOptions,
        env: { BC_API: 'http://x' },
        mode: 'production',
        command: 'mycmd',
      });
    } finally {
      tmp.cleanup();
    }
  });
});
```

- [ ] **Step 1.2：跑测试确认失败**

Run: `npx jest tests/unit/cli-runCommand.test.js`
Expected：FAIL，模块不存在。

- [ ] **Step 1.3：写最小实现**

```js
// src/cli/index.js
const { initEnv } = require('../env');

async function runCommand(cmd, cliOptions) {
  try {
    const env = cmd.skipEnv ? undefined : initEnv(cliOptions.env);
    const mode = cmd.mode || 'production';
    const ctx = { cliOptions, env, mode, command: cmd.name };
    await cmd.action(ctx);
  } catch (err) {
    console.error(`[base-client] ${cmd.name} 失败：${err.message}`);
    if (cliOptions && cliOptions.debug) console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { runCommand };
```

- [ ] **Step 1.4：跑测试确认通过**

Run: `npx jest tests/unit/cli-runCommand.test.js`
Expected：PASS。

- [ ] **Step 1.5：补"skipEnv: true → env=undefined、不调 initEnv"测试**

继续在 `describe('runCommand', ...)` 内追加：
```js
test('skipEnv: true 时 ctx.env 为 undefined，且不读 .env.*', async () => {
  const tmp = withTempCwd();   // 故意不写任何 .env 文件
  try {
    const action = jest.fn().mockResolvedValue();
    const cmd = { name: 'preview', mode: 'production', skipEnv: true, action };
    const cliOptions = { env: 'prod', debug: false };

    await runCommand(cmd, cliOptions);   // 不应抛 ".env.prod not found"

    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][0].env).toBeUndefined();
  } finally {
    tmp.cleanup();
  }
});

test('skipEnv 缺省（false）且 .env.<name> 缺失 → 抛错走错误分支', async () => {
  const tmp = withTempCwd();
  try {
    const action = jest.fn();
    const cmd = { name: 'build', mode: 'production', action };
    const cliOptions = { env: 'prod', debug: false };

    await expect(runCommand(cmd, cliOptions)).rejects.toThrow('__EXIT__:1');

    expect(action).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[base-client\] build 失败：/)
    );
  } finally {
    tmp.cleanup();
  }
});
```

- [ ] **Step 1.6：补"mode 缺省为 production"测试**

```js
test('cmd.mode 未声明时，ctx.mode = production', async () => {
  const tmp = withTempCwd();
  try {
    fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'X=1\n');
    const action = jest.fn().mockResolvedValue();
    const cmd = { name: 'foo', action };   // 无 mode
    await runCommand(cmd, { env: 'prod', debug: false });
    expect(action.mock.calls[0][0].mode).toBe('production');
  } finally {
    tmp.cleanup();
  }
});

test('cmd.mode = "development" 时透传', async () => {
  const tmp = withTempCwd();
  try {
    fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'X=1\n');
    const action = jest.fn().mockResolvedValue();
    const cmd = { name: 'dev', mode: 'development', action };
    await runCommand(cmd, { env: 'prod', debug: false });
    expect(action.mock.calls[0][0].mode).toBe('development');
  } finally {
    tmp.cleanup();
  }
});
```

- [ ] **Step 1.7：补"action 抛错 → 错误处理 + exit 1"测试**

```js
test('action 抛错 → console.error 输出 message，exit 1', async () => {
  const tmp = withTempCwd();
  try {
    fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'X=1\n');
    const cmd = {
      name: 'pack',
      mode: 'production',
      action: () => { throw new Error('something broke'); },
    };
    await expect(runCommand(cmd, { env: 'prod', debug: false })).rejects.toThrow('__EXIT__:1');
    expect(errorSpy).toHaveBeenCalledWith('[base-client] pack 失败：something broke');
  } finally {
    tmp.cleanup();
  }
});

test('默认不打印 err.stack', async () => {
  const tmp = withTempCwd();
  try {
    fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'X=1\n');
    const cmd = { name: 'pack', action: () => { throw new Error('broke'); } };
    await expect(runCommand(cmd, { env: 'prod', debug: false })).rejects.toThrow();

    // 任何一次 console.error 都不应是 stack（stack 通常以 "Error:" 起首并含 "    at "）
    const stackCalls = errorSpy.mock.calls.filter((c) => /\n\s+at /.test(String(c[0])));
    expect(stackCalls).toHaveLength(0);
  } finally {
    tmp.cleanup();
  }
});

test('--debug 为真时附打印 err.stack', async () => {
  const tmp = withTempCwd();
  try {
    fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'X=1\n');
    const cmd = { name: 'pack', action: () => { throw new Error('broke'); } };
    await expect(runCommand(cmd, { env: 'prod', debug: true })).rejects.toThrow();

    const stackCalls = errorSpy.mock.calls.filter((c) => /\n\s+at /.test(String(c[0])));
    expect(stackCalls.length).toBeGreaterThanOrEqual(1);
  } finally {
    tmp.cleanup();
  }
});
```

- [ ] **Step 1.8：跑全部 runCommand 测试**

Run: `npx jest tests/unit/cli-runCommand.test.js`
Expected：8 passed（1 ctx + 2 skipEnv + 2 mode + 3 error）。

- [ ] **Step 1.9：提交 Task 1**

```bash
git add src/cli/index.js tests/unit/cli-runCommand.test.js
git commit -m "feat(M1): runCommand — initEnv 派发 + skipEnv + --debug 错误处理"
```

---

## Task 2：createCli 注册器

**Files:**
- Modify: `src/cli/index.js`
- Test: `tests/unit/cli-createCli.test.js`

### 接口契约

```js
createCli(commandList?: Array<CommandModule>): CacInstance
```
- 默认 `commandList = require('./commands')`（命令清单文件）
- 注册全局选项：`--env <name> -e`（默认 `'prod'`）、`--config <path> -c`、`--debug`
- 遍历 `commandList`，按命令模板注册 name / description / options，action 包装为 `(cliOptions) => runCommand(cmd, cliOptions)`
- 启用 `cli.help()` 与 `cli.version(版本号)`
- 返回 cac 实例（**不**自动 parse）

测试使用 `cli.parse(argv, { run: false })` 检视解析结果而不触发 action。

### TDD

- [ ] **Step 2.1：写"createCli 返回带全局选项的 cac 实例"测试**

```js
// tests/unit/cli-createCli.test.js
const { createCli } = require('../../src/cli');

describe('createCli', () => {
  test('返回 cac 实例（暴露 parse 与 commands）', () => {
    const cli = createCli([]);
    expect(typeof cli.parse).toBe('function');
    expect(Array.isArray(cli.commands)).toBe(true);
  });

  test('全局选项 --env 默认 prod，可被 -e / --env 覆盖', () => {
    const cli = createCli([]);
    const r1 = cli.parse(['node', 'cli'], { run: false });
    expect(r1.options.env).toBe('prod');

    const cli2 = createCli([]);
    const r2 = cli2.parse(['node', 'cli', '-e', 'test'], { run: false });
    expect(r2.options.env).toBe('test');

    const cli3 = createCli([]);
    const r3 = cli3.parse(['node', 'cli', '--env', 'dev'], { run: false });
    expect(r3.options.env).toBe('dev');
  });

  test('全局选项 --config（-c）接收字符串', () => {
    const cli = createCli([]);
    const r = cli.parse(['node', 'cli', '--config', 'custom.config.js'], { run: false });
    expect(r.options.config).toBe('custom.config.js');
  });

  test('全局选项 --debug 是布尔', () => {
    const cli = createCli([]);
    const r1 = cli.parse(['node', 'cli'], { run: false });
    expect(r1.options.debug).toBeFalsy();   // 默认假（undefined 也算）

    const cli2 = createCli([]);
    const r2 = cli2.parse(['node', 'cli', '--debug'], { run: false });
    expect(r2.options.debug).toBe(true);
  });
});
```

- [ ] **Step 2.2：跑测试确认失败**

Run: `npx jest tests/unit/cli-createCli.test.js`
Expected：FAIL，`createCli is not a function`。

- [ ] **Step 2.3：实现 createCli**

将 `src/cli/index.js` 改为：

```js
// src/cli/index.js
const { cac } = require('cac');
const { initEnv } = require('../env');
const { version } = require('../../package.json');

function createCli(commandList) {
  const commands = commandList === undefined
    ? require('./commands')   // 生产路径：注入命令清单文件
    : commandList;

  const cli = cac('base-client');

  cli.option('-e, --env <name>', '指定环境名，加载 .env.<name>', { default: 'prod' });
  cli.option('-c, --config <path>', '指定 bc.config.js 路径');
  cli.option('--debug', '出错时附打印 err.stack');

  for (const cmd of commands) {
    const c = cli.command(cmd.name, cmd.description || '');
    (cmd.options || []).forEach(([flag, desc, cfg]) => c.option(flag, desc, cfg));
    c.action((...args) => {
      // cac 把命令位置参数排在前面，cliOptions 为最后一个对象
      const cliOptions = args[args.length - 1];
      return runCommand(cmd, cliOptions);
    });
  }

  cli.help();
  cli.version(version);
  return cli;
}

async function runCommand(cmd, cliOptions) {
  try {
    const env = cmd.skipEnv ? undefined : initEnv(cliOptions.env);
    const mode = cmd.mode || 'production';
    const ctx = { cliOptions, env, mode, command: cmd.name };
    await cmd.action(ctx);
  } catch (err) {
    console.error(`[base-client] ${cmd.name} 失败：${err.message}`);
    if (cliOptions && cliOptions.debug) console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { createCli, runCommand };
```

- [ ] **Step 2.4：跑测试确认通过**

Run: `npx jest tests/unit/cli-createCli.test.js`
Expected：4 passed。

- [ ] **Step 2.5：补"命令注册项数与命令模板一致"测试**

```js
test('命令清单按数组顺序注册，name / description / options 与模板一致', () => {
  const commands = [
    {
      name: 'foo',
      description: 'foo command',
      options: [
        ['--bar <v>', 'bar option'],
        ['--baz', 'baz flag'],
      ],
      action: jest.fn(),
    },
    { name: 'qux', description: 'qux command', action: jest.fn() },
  ];
  const cli = createCli(commands);
  // cac 内部命令数组（不含 globalCommand）
  expect(cli.commands).toHaveLength(2);
  expect(cli.commands[0].name).toBe('foo');
  expect(cli.commands[1].name).toBe('qux');
  // 选项数量：foo 命令独立 2 个（不含全局选项）
  const fooOptions = cli.commands[0].options.map((o) => o.rawName);
  expect(fooOptions).toEqual(expect.arrayContaining([
    expect.stringContaining('--bar'),
    expect.stringContaining('--baz'),
  ]));
});
```

- [ ] **Step 2.6：补"命令 action 经 parse 触发时调 runCommand"测试**

```js
test('parse 命令时 action 被调用，cliOptions 完整透传', async () => {
  const tmp = require('os').tmpdir();   // 用 tmpdir 而不切 cwd，让 initEnv 自然失败
  // 我们让 cmd.skipEnv: true，避开 .env.<name> 校验
  const action = jest.fn().mockResolvedValue();
  const commands = [
    {
      name: 'foo',
      skipEnv: true,
      options: [['--port <n>', 'port', { type: [Number] }]],
      action,
    },
  ];
  const cli = createCli(commands);

  // 注意：默认 parse 会触发 action，不传 { run: false }
  await cli.parse(['node', 'cli', 'foo', '--port', '9000']);

  expect(action).toHaveBeenCalledTimes(1);
  const ctx = action.mock.calls[0][0];
  expect(ctx.command).toBe('foo');
  expect(ctx.mode).toBe('production');     // 默认
  expect(ctx.cliOptions.port).toBe(9000);  // 命令专属选项
  expect(ctx.cliOptions.env).toBe('prod'); // 全局默认
});
```

- [ ] **Step 2.7：跑全部 createCli 测试**

Run: `npx jest tests/unit/cli-createCli.test.js`
Expected：6 passed（4 全局选项 + 1 注册项数 + 1 端到端调用）。

- [ ] **Step 2.8：提交 Task 2**

```bash
git add src/cli/index.js tests/unit/cli-createCli.test.js
git commit -m "feat(M1): createCli — cac 注册全局选项 + 命令清单工厂"
```

---

## Task 3：命令清单 + bin 入口

**Files:**
- Create: `src/cli/commands/index.js`
- Create: `bin/base-client.js`

### 命令清单契约

`src/cli/commands/index.js` 是数组，元素为命令模板。M1 阶段为空，M5/M6/M7 各自在此追加一行 `require('./dev')` / `'./build'` / `'./preview'` / `'./pack'`。

### bin 入口契约

bin 引入 frame 自身构建产物（rollup → `dist/cli.js`），调 `createCli().parse()`。

> **关于 dist 产物**：M1 plan 阶段尚未跑 rollup，`dist/cli.js` 未存在。bin 文件**语法层面**可写、可被 require 检查；运行层面留待后续（rollup 配置已在 `rollup.config.mjs`，集成验证可由人工执行）。

- [ ] **Step 3.1：写命令清单占位**

Create `src/cli/commands/index.js`：
```js
// src/cli/commands/index.js
// 命令清单：M5/M6/M7 各自往此数组追加 require。
module.exports = [
  // require('./dev'),       // M5 接入
  // require('./build'),     // M6 接入
  // require('./preview'),   // M6 接入
  // require('./pack'),      // M7 接入
];
```

- [ ] **Step 3.2：写命令清单 smoke test**

Create `tests/unit/cli-commands.test.js`：
```js
// tests/unit/cli-commands.test.js
describe('命令清单', () => {
  test('src/cli/commands/index 导出数组', () => {
    const commands = require('../../src/cli/commands');
    expect(Array.isArray(commands)).toBe(true);
  });

  test('清单中的每个元素是合法命令模板（含 name / action）', () => {
    const commands = require('../../src/cli/commands');
    for (const cmd of commands) {
      expect(typeof cmd.name).toBe('string');
      expect(typeof cmd.action).toBe('function');
    }
  });
});
```

- [ ] **Step 3.3：跑命令清单测试**

Run: `npx jest tests/unit/cli-commands.test.js`
Expected：2 passed（M1 阶段清单为空，遍历 0 次也算通过）。

- [ ] **Step 3.4：写 bin 入口**

Create `bin/base-client.js`：
```js
#!/usr/bin/env node
// 发布形态：rollup 产物 dist/cli.js 暴露 createCli。
const { createCli } = require('../dist/cli');
createCli().parse();
```

> 注意：此处 require `'../dist/cli'`，与 spec §八 完全一致。开发模式下若想绕过 rollup，可临时把它改成 `'../src/cli'`，但**不要把临时改动提交**。

- [ ] **Step 3.5：bin 文件存在性 + 可执行位（POSIX）**

Run:
```bash
node -e "require('fs').accessSync('bin/base-client.js'); console.log('OK')"
```
Expected：输出 `OK`，无报错。

POSIX 系统下还可设置可执行位（Windows 跳过）：
```bash
chmod +x bin/base-client.js 2>/dev/null || true
```

- [ ] **Step 3.6：跑全套测试**

Run: `npm test`
Expected：M3（9）+ M4（26）+ M2（17）+ M1（8 runCommand + 6 createCli + 2 commands）= 68 个 case 全绿。

- [ ] **Step 3.7：提交 Task 3**

```bash
git add src/cli/commands/index.js bin/base-client.js tests/unit/cli-commands.test.js
git commit -m "feat(M1): 命令清单占位 + bin/base-client.js 发布入口"
```

---

## Self-Review

按 spec 逐项核查：

| Spec 章节 | 要求 | 覆盖在哪 |
|-----------|------|----------|
| §一 定位 | M1 只负责"解析 → 初始化 → 派发"，不实现具体命令 | 实现仅含 `createCli` + `runCommand` + 命令清单占位 |
| §二 命令清单 | dev / build / preview / pack | `src/cli/commands/index.js` 占位，由 M5/M6/M7 接入 |
| §三 全局选项 | `--env` 默认 `prod`、`--config`、`--debug` | Task 2 Step 2.1（4 个测试） |
| §三 优先级 | CLI > 命令 > bc.config > 预设 | M1 只负责 CLI flag 收集为 `cliOptions`，进入 ctx；下游模块（M5/M6 命令实现）实施优先级 |
| §三 mode | 命令隐含，不开 `--mode` | Task 1 Step 1.6（mode 来自 cmd.mode） |
| §四 命令模板 | `{ name, description, mode, skipEnv, options, action }` | Task 2 Step 2.5 注册按模板字段；Step 1.5 / 1.6 验证 skipEnv / mode |
| §四 命令注册 | cac 循环注册全局选项 + 各命令 | Task 2 Step 2.3 / 2.5 / 2.6 |
| §五 env 流转 | initEnv 纯函数；skipEnv 命令跳过 | Task 1 Step 1.5 |
| §五 ctx | `{ cliOptions, env, mode, command }` | Task 1 Step 1.1 |
| §五 派发器 | try/catch 统一处理 | Task 1 Step 1.7 |
| §六 错误处理 | 统一前缀 `[base-client] <command> 失败：` | Task 1 Step 1.7 |
| §六 退出码 | 失败 1，不细分 | Task 1 Step 1.7（`process.exit(1)`） |
| §六 stack | 默认不打印；`--debug` 附加 | Task 1 Step 1.7（"默认不打印" + "--debug 附加"两个测试） |
| §六 编译错误 | webpack `stats.toString()` 独立打印，与 stack 无关 | M5/M6 命令实现侧职责，M1 不涉及 |
| §七 模块边界 | M1 调 M3 `initEnv`、M2 `resolveBuildConfig`；不实现具体命令 | M1 实现仅 `require('../env')`；`resolveBuildConfig` 由命令实现去 require，不在 M1 内 |
| §八 bin | `bin/base-client.js` require `dist/cli` 并 `parse()` | Task 3 Step 3.4，与 spec 代码示例一致 |

**Placeholder 扫描**：无 TBD / TODO。

**类型一致性**：
- `runCommand(cmd, cliOptions)` 入参形态贯穿 Task 1 / Task 2（createCli 内调 runCommand 时同样的 `(cmd, cliOptions)`）
- `cmd` 模板形态 `{ name, description?, mode?, skipEnv?, options?, action }` 一致
- `ctx = { cliOptions, env, mode, command }` 一致

**模块边界**：
- M1 `require` 的外部模块：`cac`、`../env`（M3）、`../../package.json`（取 version）
- **没有** `require` M2 `../config`、M4 `../config/presets`、`webpack`、`webpack-dev-server`、`child_process`
- 命令清单文件 `src/cli/commands/index.js` 初始为空，后续 M5/M6/M7 各自在内追加自己的命令 require，不破坏 M1 的边界

**与 spec §四 的微调声明**：本 plan 实现工厂 `createCli(commands)`，命令清单从 `./commands/index.js` 注入；spec 的"模块顶层维护清单 + 导出 cli 实例"在功能上等价（bin 仍是 `createCli().parse()`），但调整为工厂使测试更干净。后续修订 spec 时建议同步。

---

## 验收

完成本 plan 后：
- `npm test` 全绿（≥ 68 个 case）
- `node -e "const { createCli } = require('./src/cli'); createCli([]).parse(['node','cli','--help'])"` 能打印 frame 的 help 信息（含 `--env` / `--config` / `--debug` 三个全局选项）
- `node -e "const { createCli } = require('./src/cli'); createCli([]).parse(['node','cli','--version'])"` 能打印 `package.json` 的 version
- bin/base-client.js 存在；运行（需先 rollup 出 dist）由后续 M5 起始时验证
- M5/M6/M7 各自只需在 `src/cli/commands/index.js` 添加一行 require 即可接入命令
