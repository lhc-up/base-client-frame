const logger = require('../../src/logger');

function captureStdout(fn) {
    const calls = [];
    const logSpy = jest.spyOn(console, 'log').mockImplementation((s) => { calls.push(String(s)); });
    const errSpy = jest.spyOn(console, 'error').mockImplementation((s) => { calls.push(String(s)); });
    try { fn(); } finally {
        logSpy.mockRestore();
        errSpy.mockRestore();
    }
    return calls;
}

function stripAnsi(s) {
    return s.replace(/\x1b\[\d+m/g, '');
}

describe('logger', () => {
    test('info 输出含 [base-client] 前缀', () => {
        const out = captureStdout(() => logger.info('hello'));
        expect(out).toHaveLength(1);
        expect(stripAnsi(out[0])).toBe('[base-client] hello');
    });

    test('success 输出含 ✓ 标记', () => {
        const out = captureStdout(() => logger.success('done'));
        expect(stripAnsi(out[0])).toBe('✓ done');
    });

    test('warn 输出含 ⚠ 标记', () => {
        const out = captureStdout(() => logger.warn('careful'));
        expect(stripAnsi(out[0])).toBe('⚠ careful');
    });

    test('error 输出含 [base-client] + scope + msg', () => {
        const out = captureStdout(() => logger.error('build', 'something broke'));
        expect(stripAnsi(out[0])).toBe('[base-client] build something broke');
    });

    test('banner 输出含 command / mode / env', () => {
        const out = captureStdout(() => logger.banner({
            command: 'dev', mode: 'development', env: { BC_ENV: 'prod' },
        }));
        const line = stripAnsi(out[0]);
        expect(line).toMatch(/\[base-client\]/);
        expect(line).toMatch(/dev/);
        expect(line).toMatch(/env=prod/);
        expect(line).toMatch(/mode=development/);
    });

    test('banner env 缺失时显示 ?', () => {
        const out = captureStdout(() => logger.banner({
            command: 'preview', mode: 'production', env: undefined,
        }));
        expect(stripAnsi(out[0])).toMatch(/env=\?/);
    });

    test('footer 排版: PREFIX 紧跟空格 + env=,不能多余 | (回归)', () => {
        const out = captureStdout(() => logger.footer({
            env: { BC_ENV: 'prod' }, url: 'http://x', watch: false,
        }));
        expect(stripAnsi(out[0])).toMatch(/^\[base-client\] env=/);
    });

    test('footer 输出 env / url, watch:on 仅 watch=true 时打', () => {
        const a = captureStdout(() => logger.footer({
            env: { BC_ENV: 'prod' }, url: 'http://127.0.0.1:8023', watch: true,
        }));
        const aL = stripAnsi(a[0]);
        expect(aL).toMatch(/env=prod/);
        expect(aL).toMatch(/http:\/\/127\.0\.0\.1:8023/);
        expect(aL).toMatch(/watch:on/);

        const b = captureStdout(() => logger.footer({
            env: { BC_ENV: 'prod' }, url: 'http://x', watch: false,
        }));
        expect(stripAnsi(b[0])).not.toMatch(/watch:on/);
    });

    test('compileSuccess 输出 [base-client] 前缀 + 名称 / 耗时 / 体积', () => {
        const out = captureStdout(() => logger.compileSuccess('main', 1500, 1024 * 1024 * 2));
        const line = stripAnsi(out[0]);
        expect(line).toMatch(/^\[base-client\] ✓ main 编译完成/);
        expect(line).toMatch(/1\.50s/);
        expect(line).toMatch(/2\.00 MB/);
    });

    test('compileFailure 输出 [base-client] ✗ + 名称', () => {
        const out = captureStdout(() => logger.compileFailure('renderer'));
        expect(stripAnsi(out[0])).toBe('[base-client] ✗ renderer 编译失败');
    });

    test('compileWarning count=0 时不打,>0 时打 [base-client] 前缀', () => {
        const a = captureStdout(() => logger.compileWarning('main', 0));
        expect(a).toHaveLength(0);
        const b = captureStdout(() => logger.compileWarning('main', 3));
        expect(stripAnsi(b[0])).toBe('[base-client] ⚠ main 3 warnings');
    });

    test('formatBytes 边界: null/小于1KB/MB', () => {
        expect(logger.formatBytes(null)).toBe('?');
        expect(logger.formatBytes(500)).toBe('500 B');
        expect(logger.formatBytes(1024)).toBe('1.0 KB');
        expect(logger.formatBytes(1024 * 1024)).toBe('1.00 MB');
    });

    test('formatMs 边界: <1s 用 ms,>=1s 用 s', () => {
        expect(logger.formatMs(500)).toBe('500ms');
        expect(logger.formatMs(1500)).toBe('1.50s');
    });
});
