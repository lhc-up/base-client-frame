jest.mock('webpack');
jest.mock('webpack-dev-server');
jest.mock('child_process', () => ({
    ...jest.requireActual('child_process'),
    spawn: jest.fn(),
}));
jest.mock('../../src/config');
jest.mock('../../src/cli/utils/electron');

const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const childProcess = require('child_process');
const { resolveBuildConfig } = require('../../src/config');
const {
    resolveElectron,
    resolveMainEntry,
    killElectron,
} = require('../../src/cli/utils/electron');

const dev = require('../../src/cli/commands/dev');

let exitSpy;
beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`__EXIT__:${code}`);
    });

    const compiler = {
        run: jest.fn((cb) => cb(null, { hasErrors: () => false, toString: () => 'ok' })),
        watch: jest.fn(() => ({ close: jest.fn((cb) => cb && cb()) })),
        close: jest.fn((cb) => cb && cb()),
    };
    webpack.mockReturnValue(compiler);

    const server = {
        start: jest.fn().mockResolvedValue(),
        stop: jest.fn().mockResolvedValue(),
    };
    WebpackDevServer.mockImplementation(() => server);

    resolveElectron.mockReturnValue('/fake/electron');
    resolveMainEntry.mockReturnValue('/fake/app/main/index.js');

    childProcess.spawn.mockImplementation(() => ({
        pid: 9999,
        on: jest.fn(),
        kill: jest.fn(),
    }));

    resolveBuildConfig.mockReturnValue({
        main: { name: 'main' },
        preload: { name: 'preload' },
        renderer: { name: 'renderer' },
    });
});

afterEach(() => {
    process.removeAllListeners('SIGINT');
});

describe('dev.action', () => {
    test('默认模式：调 resolveBuildConfig + 起 dev-server + spawn Electron', async () => {
        const ctx = {
            cliOptions: { port: 9000, host: '127.0.0.1', config: undefined },
            env: { BC_API: 'http://x' },
            mode: 'development',
            command: 'dev',
        };

        await dev.action(ctx);

        expect(resolveBuildConfig).toHaveBeenCalledWith({
            env: ctx.env, mode: 'development', command: 'dev', cliOptions: ctx.cliOptions,
        });
        expect(WebpackDevServer).toHaveBeenCalled();
        expect(childProcess.spawn).toHaveBeenCalledWith(
            '/fake/electron',
            ['/fake/app/main/index.js'],
            expect.objectContaining({
                stdio: 'inherit',
                env: expect.objectContaining({
                    NODE_ENV: 'development',
                    RENDERER_DEV_URL: 'http://127.0.0.1:9000',
                }),
            })
        );
    });

    test('--watch-main：编译失败不 spawn Electron / 不 kill', async () => {
        webpack.mockReturnValue({
            watch: jest.fn((opts, cb) => {
                cb(null, {
                    hasErrors: () => true,
                    toString: () => 'compile error',
                });
                return { close: jest.fn((cb2) => cb2 && cb2()) };
            }),
            close: jest.fn(),
        });

        jest.useFakeTimers();

        const ctx = {
            cliOptions: { watchMain: true, port: 8023, host: 'localhost' },
            env: {},
            mode: 'development',
            command: 'dev',
        };
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await dev.action(ctx);
        jest.useRealTimers();

        expect(childProcess.spawn).not.toHaveBeenCalled();
        expect(killElectron).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('compile error'));

        errorSpy.mockRestore();
    });

    test('默认模式：webpack 编译失败 → action 抛错，不 spawn Electron', async () => {
        webpack.mockReturnValue({
            run: jest.fn((cb) => cb(null, {
                hasErrors: () => true,
                toString: () => 'init build error',
            })),
            close: jest.fn(),
        });

        const ctx = {
            cliOptions: { port: 8023, host: 'localhost' },
            env: {},
            mode: 'development',
            command: 'dev',
        };
        await expect(dev.action(ctx)).rejects.toThrow(/init build error/);
        expect(childProcess.spawn).not.toHaveBeenCalled();
    });

    test('spawn Electron 时注入 NODE_ENV=development + RENDERER_DEV_URL 用最终 host/port', async () => {
        const ctx = {
            cliOptions: { port: 4321, host: '0.0.0.0' },
            env: {},
            mode: 'development',
            command: 'dev',
        };
        await dev.action(ctx);
        expect(childProcess.spawn).toHaveBeenCalledWith(
            '/fake/electron',
            ['/fake/app/main/index.js'],
            expect.objectContaining({
                env: expect.objectContaining({
                    NODE_ENV: 'development',
                    RENDERER_DEV_URL: 'http://0.0.0.0:4321',
                }),
            })
        );
    });
});
