const cmd = require('../../../src/cli/commands/dev-app');
const { TARGETS } = require('../../../src/core/target');
const { MODES } = require('../../../src/core/mode');

describe('cli/commands/dev-app', () => {
    test('命令文件导出契约', () => {
        expect(cmd.name).toBe('dev:app');
        expect(cmd.target).toBe(TARGETS.APP);
        expect(cmd.mode).toBe(MODES.DEV);
        expect(cmd.needsBcConfig).toBe(true);
        expect(cmd.needsBuilderConfig).toBe(false);
        expect(cmd.aliases || []).toEqual([]);
    });

    test('options 含 --port 与 --host', () => {
        const flags = cmd.options.map(o => o[0]);
        expect(flags.some(f => f.includes('--port'))).toBe(true);
        expect(flags.some(f => f.includes('--host'))).toBe(true);
    });

    test('options 含 --inspect [port]，并由 resolveCliOptions 规整', () => {
        const flags = cmd.options.map(o => o[0]);
        expect(flags).toContain('--inspect [port]');
        expect(cmd.resolveCliOptions).toBe(cmd.resolveInspectOption);
    });

    test('默认端口：调试 9229（与 Node 一致），dev server 8023', () => {
        expect(cmd.DEFAULT_INSPECT_PORT).toBe(9229);
        expect(cmd.DEFAULT_DEV_SERVER_PORT).toBe(8023);
    });

    test('resolveInspectOption：未传为 undefined，只写 --inspect 用默认端口，写端口则用该端口', () => {
        expect(cmd.resolveInspectOption({ port: 1 })).toEqual({ port: 1, inspect: undefined });
        expect(cmd.resolveInspectOption({ inspect: false }).inspect).toBeUndefined();
        expect(cmd.resolveInspectOption({ inspect: true }).inspect).toBe(9229);
        expect(cmd.resolveInspectOption({ inspect: 9230 }).inspect).toBe(9230);
        expect(cmd.resolveInspectOption({ inspect: '9231' }).inspect).toBe(9231);
        expect(cmd.resolveInspectOption({ inspect: 1 }).inspect).toBe(1);
        expect(cmd.resolveInspectOption({ inspect: 65535 }).inspect).toBe(65535);
    });

    test.each(['abc', 0, 65536, 9229.5, -1])('resolveInspectOption：非法端口 %p 报错', (value) => {
        expect(() => cmd.resolveInspectOption({ inspect: value })).toThrow('--inspect 的端口必须是 1-65535 之间的整数');
    });

    test('electronArgs：不调试只传入口；调试时参数写在入口之前', () => {
        expect(cmd.electronArgs('/app/main.js', undefined)).toEqual(['/app/main.js']);
        expect(cmd.electronArgs('/app/main.js', 9229)).toEqual(['--inspect=9229', '--trace-warnings', '/app/main.js']);
    });

    test('action 是 async function', () => {
        expect(cmd.action.constructor.name).toBe('AsyncFunction');
    });

    test('shutdown 幂等且 dev-server stop 超时后仍按首次退出码结束', async () => {
        let timeoutCallback;
        const timeoutHandle = {};
        const child = { pid: 123, exitCode: null };
        const devServer = { stop: jest.fn(() => new Promise(() => {})) };
        const kill = jest.fn();
        const exitProcess = jest.fn();
        const clearTimeoutFn = jest.fn();

        expect(typeof cmd.createShutdown).toBe('function');
        const shutdown = cmd.createShutdown({
            child,
            devServer,
            kill,
            exitProcess,
            timeoutMs: 10,
            setTimeoutFn: (callback) => {
                timeoutCallback = callback;
                return timeoutHandle;
            },
            clearTimeoutFn,
        });
        const first = shutdown(143);
        const second = shutdown(0);
        expect(second).toBe(first);
        timeoutCallback();
        await first;

        expect(kill).toHaveBeenCalledTimes(1);
        expect(devServer.stop).toHaveBeenCalledTimes(1);
        expect(clearTimeoutFn).toHaveBeenCalledWith(timeoutHandle);
        expect(exitProcess).toHaveBeenCalledWith(143);
    });

    test('--pkg-only 无子进程：shutdown 不调用 kill，只停 dev-server 并退出', async () => {
        const devServer = { stop: jest.fn(async () => {}) };
        const kill = jest.fn();
        const exitProcess = jest.fn();
        const shutdown = cmd.createShutdown({ child: null, devServer, kill, exitProcess });
        await shutdown(130);
        expect(kill).not.toHaveBeenCalled();
        expect(devServer.stop).toHaveBeenCalledTimes(1);
        expect(exitProcess).toHaveBeenCalledWith(130);
    });

    test('options 含 --pkg-only', () => {
        expect(cmd.options.map(o => o[0])).toContain('--pkg-only');
    });

    test('注册 SIGINT 与 SIGTERM 到同一个 shutdown', () => {
        const handlers = {};
        const processLike = {
            on: jest.fn((signal, handler) => { handlers[signal] = handler; }),
        };
        const shutdown = jest.fn();

        expect(typeof cmd.registerShutdownSignals).toBe('function');
        cmd.registerShutdownSignals(shutdown, processLike);
        handlers.SIGINT();
        handlers.SIGTERM();

        expect(processLike.on.mock.calls.map(call => call[0])).toEqual(['SIGINT', 'SIGTERM']);
        expect(shutdown.mock.calls).toEqual([[130], [143]]);
    });
});

describe('dev:app electronChildEnv', () => {
    test('去掉 BC_* 变量，只保留静态替换这一种取值方式', () => {
        const env = cmd.electronChildEnv({ PATH: '/bin', BC_API_SERVER: 'http://x', BC_DEV_PKGS: '{}', NODE_ENV: 'production' });
        expect(env).toEqual({ PATH: '/bin', NODE_ENV: 'development' });
    });
});
