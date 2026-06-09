jest.mock('webpack');
jest.mock('webpack-dev-server');
jest.mock('../../src/cli/utils/compile-spinner', () => ({
    createCompileSpinner: () => ({
        start: jest.fn(), stop: jest.fn(), clear: jest.fn(), isActive: () => false,
    }),
}));
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

function makeStats({ hasErr = false, name = 'x' } = {}) {
    return {
        hasErrors: () => hasErr,
        toString: () => hasErr ? `[${name}] error` : `[${name}] ok`,
        toJson: () => ({
            name,
            time: 100,
            errors: hasErr ? [{ message: 'boom' }] : [],
            warnings: [],
            assets: [{ size: 1024 }],
        }),
        startTime: 0,
        endTime: 100,
    };
}

function makeMultiStats(hasErr = false) {
    return {
        hasErrors: () => hasErr,
        stats: [makeStats({ hasErr, name: 'main' }), makeStats({ hasErr, name: 'preload' })],
    };
}

function makeRendererCompiler() {
    return {
        hooks: { done: { tap: jest.fn() } },
        run: jest.fn((cb) => cb && cb(null, makeStats({ name: 'renderer' }))),
        watch: jest.fn(() => ({ close: jest.fn((cb) => cb && cb()) })),
        close: jest.fn((cb) => cb && cb()),
    };
}

function makeMultiCompiler(hasErr = false) {
    return {
        run: jest.fn((cb) => cb(null, makeMultiStats(hasErr))),
        watch: jest.fn((opts, cb) => {
            cb(null, makeMultiStats(hasErr));
            return { close: jest.fn((cb2) => cb2 && cb2()) };
        }),
        close: jest.fn((cb) => cb && cb()),
    };
}

let exitSpy;
beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`__EXIT__:${code}`);
    });

    webpack.mockImplementation((config) => {
        if (Array.isArray(config)) return makeMultiCompiler();
        return makeRendererCompiler();
    });

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
        webpack.mockImplementation((config) => {
            if (Array.isArray(config)) return makeMultiCompiler(true);
            return makeRendererCompiler();
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
        expect(errorSpy).toHaveBeenCalled();

        errorSpy.mockRestore();
    });

    test('默认模式：webpack 编译失败 → action 抛错，不 spawn Electron', async () => {
        webpack.mockImplementation((config) => {
            if (Array.isArray(config)) return makeMultiCompiler(true);
            return makeRendererCompiler();
        });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const ctx = {
            cliOptions: { port: 8023, host: 'localhost' },
            env: {},
            mode: 'development',
            command: 'dev',
        };
        await expect(dev.action(ctx)).rejects.toThrow(/main\+preload 编译失败/);
        expect(childProcess.spawn).not.toHaveBeenCalled();

        errorSpy.mockRestore();
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
