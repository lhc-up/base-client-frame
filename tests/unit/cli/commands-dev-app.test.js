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
