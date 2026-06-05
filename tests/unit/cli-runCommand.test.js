const fs = require('fs');
const path = require('path');
const { withTempCwd } = require('./_helpers');

let exitSpy, errorSpy;
beforeEach(() => {
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

  test('skipEnv: true 时 ctx.env 为 undefined，且不读 .env.*', async () => {
    const tmp = withTempCwd();
    try {
      const action = jest.fn().mockResolvedValue();
      const cmd = { name: 'preview', mode: 'production', skipEnv: true, action };
      const cliOptions = { env: 'prod', debug: false };

      await runCommand(cmd, cliOptions);

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

  test('cmd.mode 未声明时，ctx.mode = production', async () => {
    const tmp = withTempCwd();
    try {
      fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'X=1\n');
      const action = jest.fn().mockResolvedValue();
      const cmd = { name: 'foo', action };
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
});
