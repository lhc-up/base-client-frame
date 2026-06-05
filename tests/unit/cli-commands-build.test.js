jest.mock('../../src/cli/utils/production-build');

const { runProductionBuild } = require('../../src/cli/utils/production-build');
const build = require('../../src/cli/commands/build');

describe('build 命令', () => {
  test('命令模板字段', () => {
    expect(build.name).toBe('build');
    expect(build.mode).toBe('production');
    expect(build.skipEnv).toBeFalsy();
    expect(typeof build.action).toBe('function');
    expect(build.options || []).toEqual([]);
  });

  test('action 调 runProductionBuild，env/command/cliOptions 完整透传', async () => {
    runProductionBuild.mockResolvedValue();
    const ctx = {
      env: { BC_API: 'http://x' },
      command: 'build',
      mode: 'production',
      cliOptions: { config: undefined, debug: false },
    };
    await build.action(ctx);
    expect(runProductionBuild).toHaveBeenCalledWith({
      env: ctx.env,
      command: 'build',
      cliOptions: ctx.cliOptions,
    });
  });

  test('runProductionBuild 抛错 → action 透传抛出（交 M1 runCommand 收尾）', async () => {
    runProductionBuild.mockRejectedValue(new Error('compile failed'));
    await expect(build.action({
      env: {}, command: 'build', mode: 'production', cliOptions: {},
    })).rejects.toThrow(/compile failed/);
  });
});
