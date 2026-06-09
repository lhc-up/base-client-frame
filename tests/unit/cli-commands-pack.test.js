jest.mock('../../src/config/pack');
jest.mock('../../src/cli/utils/production-build');
jest.mock('../../src/cli/utils/electron-builder');

const { resolvePackConfig } = require('../../src/config/pack');
const { runProductionBuild } = require('../../src/cli/utils/production-build');
const {
    buildTargets,
    resolveElectronBuilder,
} = require('../../src/cli/utils/electron-builder');

const fakeBuilderPath = '/fake/path/electron-builder';
const mockBuilderBuild = jest.fn().mockResolvedValue();
jest.mock(
    '/fake/path/electron-builder',
    () => ({ build: mockBuilderBuild }),
    { virtual: true }
);

const pack = require('../../src/cli/commands/pack');

beforeEach(() => {
    resolvePackConfig.mockReturnValue({
        appId: 'com.foo', files: ['package.json'], directories: { output: 'dist' },
    });
    runProductionBuild.mockResolvedValue();
    resolveElectronBuilder.mockReturnValue(fakeBuilderPath);
    buildTargets.mockReturnValue({ win: ['nsis'], x64: true });
    mockBuilderBuild.mockClear();
});

describe('pack 命令', () => {
    test('命令模板字段（含 --pack-config 与 5 个选项）', () => {
        expect(pack.name).toBe('pack');
        expect(pack.mode).toBe('production');
        expect(pack.skipEnv).toBeFalsy();
        const flags = (pack.options || []).map(([flag]) => flag);
        expect(flags).toEqual(expect.arrayContaining([
            expect.stringContaining('--pack-config'),
            expect.stringContaining('--platform'),
            expect.stringContaining('--arch'),
            expect.stringContaining('--unpack'),
            expect.stringContaining('--sign'),
        ]));
    });

    test('action 流水线：① resolvePackConfig → ② runProductionBuild → ③ require(resolveElectronBuilder) → ④ buildTargets → ⑤ electronBuilder.build', async () => {
        const ctx = {
            env: { BC_ENV: 'prod' },
            mode: 'production',
            command: 'pack',
            cliOptions: { platform: 'win', arch: 'x64', sign: true },
        };
        await pack.action(ctx);

        const callOrder = [
            resolvePackConfig.mock.invocationCallOrder[0],
            runProductionBuild.mock.invocationCallOrder[0],
            mockBuilderBuild.mock.invocationCallOrder[0],
        ];
        expect(callOrder).toEqual([...callOrder].sort((a, b) => a - b));

        expect(resolvePackConfig).toHaveBeenCalledWith(ctx);
        expect(runProductionBuild).toHaveBeenCalledWith(ctx);
        expect(buildTargets).toHaveBeenCalledWith(ctx.cliOptions);
        expect(mockBuilderBuild).toHaveBeenCalledWith({
            win: ['nsis'], x64: true,
            config: { appId: 'com.foo', files: ['package.json'], directories: { output: 'dist' } },
        });
    });

    test('resolvePackConfig 抛错 → 不执行 runProductionBuild / electron-builder.build', async () => {
        resolvePackConfig.mockImplementation(() => {
            throw new Error('未找到 electron-builder.config.js');
        });
        const ctx = {
            env: {}, mode: 'production', command: 'pack',
            cliOptions: { platform: 'win', arch: 'x64' },
        };
        await expect(pack.action(ctx)).rejects.toThrow(/未找到 electron-builder/);
        expect(runProductionBuild).not.toHaveBeenCalled();
        expect(mockBuilderBuild).not.toHaveBeenCalled();
    });

    test('buildTargets 抛错（platform 不支持）→ 不调 electron-builder.build', async () => {
        buildTargets.mockImplementation(() => { throw new Error('不支持的平台：foo'); });
        await expect(pack.action({
            env: {}, mode: 'production', command: 'pack',
            cliOptions: { platform: 'foo', arch: 'x64' },
        })).rejects.toThrow(/不支持的平台：foo/);
        expect(mockBuilderBuild).not.toHaveBeenCalled();
    });

    test('electron-builder.build 抛错 → 透传抛出', async () => {
        mockBuilderBuild.mockRejectedValue(new Error('builder error'));
        await expect(pack.action({
            env: {}, mode: 'production', command: 'pack',
            cliOptions: { platform: 'win', arch: 'x64' },
        })).rejects.toThrow(/builder error/);
    });
});
