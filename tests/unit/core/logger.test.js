const logger = require('../../../src/core/logger');

describe('core/logger', () => {
    let logSpy, errSpy;
    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    test('info 输出 [base-client] 前缀', () => {
        logger.info('hello');
        const out = logSpy.mock.calls[0][0];
        expect(out).toContain('[base-client]');
        expect(out).toContain('hello');
    });

    test('success 含 ✓', () => {
        logger.success('done');
        expect(logSpy.mock.calls[0][0]).toContain('✓');
    });

    test('warn 含 ⚠', () => {
        logger.warn('careful');
        expect(logSpy.mock.calls[0][0]).toContain('⚠');
    });

    test('error 调用 console.error，含 scope 与 msg', () => {
        logger.error('dev:web', 'boom');
        const out = errSpy.mock.calls[0].join(' ');
        expect(out).toContain('dev:web');
        expect(out).toContain('boom');
    });

    test('banner 输出含 command / target / env / mode', () => {
        logger.banner({ command: 'dev:web', target: 'web', mode: 'development', env: { BC_ENV: 'prod' } });
        const out = logSpy.mock.calls[0][0];
        expect(out).toContain('dev:web');
        expect(out).toContain('web');
        expect(out).toContain('prod');
        expect(out).toContain('development');
    });

    test('footer 输出含 url 与 target', () => {
        logger.footer({ env: { BC_ENV: 'prod' }, url: 'http://localhost:9000', target: 'web' });
        const out = logSpy.mock.calls[0][0];
        expect(out).toContain('http://localhost:9000');
        expect(out).toContain('web');
    });

    test('compileSuccess 输出 name / ms / size', () => {
        logger.compileSuccess('web', 1234, 50000);
        const out = logSpy.mock.calls[0][0];
        expect(out).toContain('✓');
        expect(out).toContain('web');
        expect(out).toMatch(/1\.2 ?s|1234 ?ms/);
    });

    test('compileFailure 输出 name 与 ✗', () => {
        logger.compileFailure('web');
        const out = logSpy.mock.calls[0][0];
        expect(out).toContain('✗');
        expect(out).toContain('web');
    });

    test('compileWarning 0 个时不输出', () => {
        logger.compileWarning('web', 0);
        expect(logSpy).not.toHaveBeenCalled();
    });

    test('compileWarning > 0 时输出 N warnings', () => {
        logger.compileWarning('web', 3);
        const out = logSpy.mock.calls[0][0];
        expect(out).toContain('3');
        expect(out).toContain('warning');
    });

    test('formatBytes 1024 → "1.0 KB"', () => {
        expect(logger.formatBytes(1024)).toMatch(/1\.0 ?KB/);
    });

    test('formatMs 1500 → "1.5 s"', () => {
        expect(logger.formatMs(1500)).toMatch(/1\.5 ?s/);
    });

    test('formatMs 500 → "500 ms"', () => {
        expect(logger.formatMs(500)).toMatch(/500 ?ms/);
    });
});
