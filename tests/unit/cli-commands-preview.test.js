jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn(),
}));
jest.mock('../../src/cli/utils/electron');

const { spawn } = require('child_process');
const { resolveElectron, resolveMainEntry } = require('../../src/cli/utils/electron');

const preview = require('../../src/cli/commands/preview');

beforeEach(() => {
  resolveElectron.mockReturnValue('/fake/electron');
  resolveMainEntry.mockReturnValue('/fake/app/main/index.js');
});

describe('preview 命令', () => {
  test('命令模板字段：skipEnv=true / mode=production / 无专属选项', () => {
    expect(preview.name).toBe('preview');
    expect(preview.skipEnv).toBe(true);
    expect(preview.mode).toBe('production');
    expect(preview.options || []).toEqual([]);
    expect(typeof preview.action).toBe('function');
  });

  test('spawn 注入 NODE_ENV=production，不注入 RENDERER_DEV_URL', async () => {
    spawn.mockImplementation(() => ({
      pid: 1,
      on: jest.fn((evt, cb) => { if (evt === 'close') setImmediate(() => cb(0)); }),
    }));
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`__EXIT__:${code}`);
    });

    await expect(preview.action({
      cliOptions: {}, env: undefined, mode: 'production', command: 'preview',
    })).rejects.toThrow('__EXIT__:0');

    expect(spawn).toHaveBeenCalledWith(
      '/fake/electron',
      ['/fake/app/main/index.js'],
      expect.objectContaining({
        stdio: 'inherit',
        env: expect.objectContaining({ NODE_ENV: 'production' }),
      })
    );
    const spawnedEnv = spawn.mock.calls[0][2].env;
    expect(spawnedEnv).not.toHaveProperty('RENDERER_DEV_URL');

    exitSpy.mockRestore();
  });

  test('Electron close code=137 → process.exit(137)', async () => {
    spawn.mockImplementation(() => ({
      pid: 1,
      on: jest.fn((evt, cb) => { if (evt === 'close') setImmediate(() => cb(137)); }),
    }));
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`__EXIT__:${code}`);
    });

    await expect(preview.action({
      cliOptions: {}, env: undefined, mode: 'production', command: 'preview',
    })).rejects.toThrow('__EXIT__:137');

    exitSpy.mockRestore();
  });

  test('Electron close code=null → process.exit(0)', async () => {
    spawn.mockImplementation(() => ({
      pid: 1,
      on: jest.fn((evt, cb) => { if (evt === 'close') setImmediate(() => cb(null)); }),
    }));
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`__EXIT__:${code}`);
    });

    await expect(preview.action({
      cliOptions: {}, env: undefined, mode: 'production', command: 'preview',
    })).rejects.toThrow('__EXIT__:0');

    exitSpy.mockRestore();
  });

  test('未构建产物 → resolveMainEntry 抛错 → action 抛错（交 M1 runCommand 收尾）', async () => {
    resolveMainEntry.mockImplementation(() => {
      throw new Error('主进程入口不存在：/fake/app/main/index.js（请先构建...）');
    });
    await expect(preview.action({
      cliOptions: {}, env: undefined, mode: 'production', command: 'preview',
    })).rejects.toThrow(/主进程入口不存在/);

    expect(spawn).not.toHaveBeenCalled();
  });
});
