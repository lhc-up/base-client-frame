jest.mock('webpack');
jest.mock('../../src/config');

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const { resolveBuildConfig } = require('../../src/config');
const { withTempCwd } = require('./_helpers');

const { runProductionBuild } = require('../../src/cli/utils/production-build');

beforeEach(() => {
    resolveBuildConfig.mockReturnValue({
        main: { name: 'main' },
        preload: { name: 'preload' },
        renderer: { name: 'renderer' },
    });

    webpack.mockImplementation((config, cb) => {
        setImmediate(() => cb(null, {
            hasErrors: () => false,
            toString: () => `[${config.name}] compiled`,
        }));
    });
});

describe('runProductionBuild', () => {
    let tmp;
    beforeEach(() => { tmp = withTempCwd(); });
    afterEach(() => { tmp.cleanup(); });

    test('整体清空 app/ → 调 resolveBuildConfig(mode=production, command 透传) → webpack 调用 3 次', async () => {
        fs.mkdirSync(path.join(tmp.dir, 'app', 'main'), { recursive: true });
        fs.writeFileSync(path.join(tmp.dir, 'app', 'leftover.txt'), 'old');

        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        await runProductionBuild({
            env: { BC_API: 'http://x' },
            command: 'build',
            cliOptions: { foo: 'bar' },
        });
        logSpy.mockRestore();

        expect(fs.existsSync(path.join(tmp.dir, 'app', 'leftover.txt'))).toBe(false);

        expect(resolveBuildConfig).toHaveBeenCalledWith({
            env: { BC_API: 'http://x' },
            mode: 'production',
            command: 'build',
            cliOptions: { foo: 'bar' },
        });

        expect(webpack).toHaveBeenCalledTimes(3);
        const configsPassedToWebpack = webpack.mock.calls.map(([cfg]) => cfg.name);
        expect(configsPassedToWebpack).toEqual(expect.arrayContaining(['main', 'preload', 'renderer']));
    });

    test('renderer 编译失败 → 抛错（含 stats.toString 输出）', async () => {
        webpack.mockImplementation((config, cb) => {
            setImmediate(() => {
                const hasErr = config.name === 'renderer';
                cb(null, {
                    hasErrors: () => hasErr,
                    toString: () => hasErr ? '[renderer] ERROR detail' : '[ok]',
                });
            });
        });
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        await expect(runProductionBuild({
            env: {},
            command: 'build',
            cliOptions: {},
        })).rejects.toThrow(/renderer 编译失败/);

        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[renderer] ERROR detail'));
        errSpy.mockRestore();
        logSpy.mockRestore();
    });

    test('webpack 自身 err（不是 stats）→ 也抛错', async () => {
        webpack.mockImplementation((config, cb) => {
            setImmediate(() => cb(new Error('webpack crashed'), null));
        });
        await expect(runProductionBuild({
            env: {},
            command: 'build',
            cliOptions: {},
        })).rejects.toThrow(/webpack crashed/);
    });

    test('app/ 不存在时清空仍正常（不报错）', async () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        await expect(runProductionBuild({
            env: {},
            command: 'build',
            cliOptions: {},
        })).resolves.toBeUndefined();
        logSpy.mockRestore();
    });

    test('command="pack" 透传给 resolveBuildConfig（M7 复用同款步骤）', async () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        await runProductionBuild({
            env: { BC_X: '1' },
            command: 'pack',
            cliOptions: { platform: 'win', arch: 'x64' },
        });
        logSpy.mockRestore();
        expect(resolveBuildConfig).toHaveBeenCalledWith({
            env: { BC_X: '1' },
            mode: 'production',
            command: 'pack',
            cliOptions: { platform: 'win', arch: 'x64' },
        });
    });
});
