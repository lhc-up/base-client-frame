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
    expect(r1.options.debug).toBeFalsy();

    const cli2 = createCli([]);
    const r2 = cli2.parse(['node', 'cli', '--debug'], { run: false });
    expect(r2.options.debug).toBe(true);
  });

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
    expect(cli.commands).toHaveLength(2);
    expect(cli.commands[0].name).toBe('foo');
    expect(cli.commands[1].name).toBe('qux');
    const fooOptions = cli.commands[0].options.map((o) => o.rawName);
    expect(fooOptions).toEqual(expect.arrayContaining([
      expect.stringContaining('--bar'),
      expect.stringContaining('--baz'),
    ]));
  });

  test('parse 命令时 action 被调用，cliOptions 完整透传', async () => {
    const action = jest.fn().mockResolvedValue();
    const commands = [
      {
        name: 'foo',
        skipEnv: true,
        options: [['--port <n>', 'port']],
        action,
      },
    ];
    const cli = createCli(commands);

    await cli.parse(['node', 'cli', 'foo', '--port', '9000']);

    expect(action).toHaveBeenCalledTimes(1);
    const ctx = action.mock.calls[0][0];
    expect(ctx.command).toBe('foo');
    expect(ctx.mode).toBe('production');
    expect(ctx.cliOptions.port).toBe(9000);
    expect(ctx.cliOptions.env).toBe('prod');
  });
});
