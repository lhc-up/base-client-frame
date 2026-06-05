const { resolveDevServerOptions } = require('../../src/cli/commands/dev-options');

describe('resolveDevServerOptions', () => {
  test('全部缺省：localhost / 8023 / hot:true / historyApiFallback:true', () => {
    const r = resolveDevServerOptions({ cliOptions: {}, userDevServer: {} });
    expect(r.host).toBe('localhost');
    expect(r.port).toBe(8023);
    expect(r.options.hot).toBe(true);
    expect(r.options.historyApiFallback).toBe(true);
    expect(r.options.host).toBe('localhost');
    expect(r.options.port).toBe(8023);
  });

  test('CLI > user > 默认（host / port 三级）', () => {
    const a = resolveDevServerOptions({
      cliOptions: {},
      userDevServer: { host: '0.0.0.0', port: 5173 },
    });
    expect(a.host).toBe('0.0.0.0');
    expect(a.port).toBe(5173);

    const b = resolveDevServerOptions({
      cliOptions: { host: '127.0.0.1', port: 4000 },
      userDevServer: { host: '0.0.0.0', port: 5173 },
    });
    expect(b.host).toBe('127.0.0.1');
    expect(b.port).toBe(4000);
  });

  test('用户 proxy / headers / setupMiddlewares 保留', () => {
    const userProxy = { '/api': 'http://backend:3000' };
    const setup = jest.fn();
    const r = resolveDevServerOptions({
      cliOptions: {},
      userDevServer: { proxy: userProxy, headers: { 'X-Foo': '1' }, setupMiddlewares: setup },
    });
    expect(r.options.proxy).toEqual(userProxy);
    expect(r.options.headers).toEqual({ 'X-Foo': '1' });
    expect(r.options.setupMiddlewares).toBe(setup);
  });

  test('用户 hot:false 被 frame 强制覆盖回 true（HMR 是 dev 核心约定）', () => {
    const r = resolveDevServerOptions({
      cliOptions: {},
      userDevServer: { hot: false },
    });
    expect(r.options.hot).toBe(true);
  });

  test('用户可以覆盖 historyApiFallback（它在 spread 之前）', () => {
    const r = resolveDevServerOptions({
      cliOptions: {},
      userDevServer: { historyApiFallback: false },
    });
    expect(r.options.historyApiFallback).toBe(false);
  });
});
