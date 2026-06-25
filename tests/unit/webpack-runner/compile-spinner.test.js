const { createCompileSpinner } = require('../../../src/webpack-runner/compile-spinner');

describe('webpack-runner/compile-spinner', () => {
    test('createCompileSpinner 返回有 start/stop/clear/tickInitial 的对象', () => {
        const sp = createCompileSpinner('编译中...');
        expect(typeof sp.start).toBe('function');
        expect(typeof sp.stop).toBe('function');
        expect(typeof sp.clear).toBe('function');
        expect(typeof sp.tickInitial).toBe('function');
    });

    test('start / stop 不抛错', () => {
        const sp = createCompileSpinner('编译中...');
        sp.start();
        sp.stop();
    });

    test('tickInitial 累计达到 expectedCount 后自动 stop', () => {
        const sp = createCompileSpinner('编译中...', 2);
        sp.start();
        sp.tickInitial();
        expect(sp.isRunning()).toBe(true);
        sp.tickInitial();
        expect(sp.isRunning()).toBe(false);
    });
});
