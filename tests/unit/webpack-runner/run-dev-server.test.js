const { resolveDevServerOptions } = require('../../../src/webpack-runner/run-dev-server');

describe('webpack-runner/run-dev-server.resolveDevServerOptions', () => {
    test('默认 host=localhost / port=defaultPort', () => {
        const opts = resolveDevServerOptions({ cliOptions: {}, isWeb: true }, {}, { defaultPort: 9000 });
        expect(opts.host).toBe('localhost');
        expect(opts.port).toBe(9000);
    });

    test('CLI --port / --host 最高优先', () => {
        const opts = resolveDevServerOptions(
            { cliOptions: { port: 8888, host: '0.0.0.0' }, isWeb: true },
            { port: 9999, host: '127.0.0.1' },
            { defaultPort: 9000 },
        );
        expect(opts.host).toBe('0.0.0.0');
        expect(opts.port).toBe(8888);
    });

    test('userDevServer 次优先（CLI 无）', () => {
        const opts = resolveDevServerOptions(
            { cliOptions: {}, isWeb: true },
            { port: 9999, host: '127.0.0.1' },
            { defaultPort: 9000 },
        );
        expect(opts.host).toBe('127.0.0.1');
        expect(opts.port).toBe(9999);
    });

    test('userDev.hot=false 生效（覆盖 frameDefault=true）', () => {
        const opts = resolveDevServerOptions(
            { cliOptions: {}, isWeb: true },
            { hot: false },
            { defaultPort: 9000 },
        );
        expect(opts.hot).toBe(false);
    });

    test('userDev.hot 缺省时 frameDefault=true', () => {
        const opts = resolveDevServerOptions(
            { cliOptions: {}, isWeb: true },
            {},
            { defaultPort: 9000 },
        );
        expect(opts.hot).toBe(true);
    });

    test('userDev.open=false 生效（覆盖 frameDefault=ctx.isWeb）', () => {
        const opts = resolveDevServerOptions(
            { cliOptions: {}, isWeb: true },
            { open: false },
            { defaultPort: 9000 },
        );
        expect(opts.open).toBe(false);
    });

    test('userDev.open=true 生效（覆盖 frameDefault=ctx.isWeb=false）', () => {
        const opts = resolveDevServerOptions(
            { cliOptions: {}, isWeb: false },
            { open: true },
            { defaultPort: 9000 },
        );
        expect(opts.open).toBe(true);
    });

    test('userDev.open 缺省 + ctx.isWeb=true → open=true', () => {
        const opts = resolveDevServerOptions(
            { cliOptions: {}, isWeb: true },
            {},
            { defaultPort: 9000 },
        );
        expect(opts.open).toBe(true);
    });

    test('userDev.open 缺省 + ctx.isWeb=false → open=false', () => {
        const opts = resolveDevServerOptions(
            { cliOptions: {}, isWeb: false },
            {},
            { defaultPort: 9000 },
        );
        expect(opts.open).toBe(false);
    });

    test('historyApiFallback 默认 true，用户可覆盖', () => {
        expect(resolveDevServerOptions({ cliOptions: {}, isWeb: true }, {}, { defaultPort: 9000 }).historyApiFallback).toBe(true);
        expect(resolveDevServerOptions(
            { cliOptions: {}, isWeb: true },
            { historyApiFallback: false },
            { defaultPort: 9000 },
        ).historyApiFallback).toBe(false);
    });

    test('devMiddleware.stats 默认 false，用户可覆盖', () => {
        expect(resolveDevServerOptions({ cliOptions: {}, isWeb: true }, {}, { defaultPort: 9000 }).devMiddleware.stats).toBe(false);
        expect(resolveDevServerOptions(
            { cliOptions: {}, isWeb: true },
            { devMiddleware: { stats: 'verbose' } },
            { defaultPort: 9000 },
        ).devMiddleware.stats).toBe('verbose');
    });

    test('proxy / setupMiddlewares 等任意用户字段透传', () => {
        const opts = resolveDevServerOptions(
            { cliOptions: {}, isWeb: true },
            { proxy: { '/api': 'http://localhost:3000' } },
            { defaultPort: 9000 },
        );
        expect(opts.proxy).toEqual({ '/api': 'http://localhost:3000' });
    });
});
