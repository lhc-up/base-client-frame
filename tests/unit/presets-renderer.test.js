const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { getRendererPreset } = require('../../src/config/presets/renderer');

const ROOT = '/tmp/proj';
const ENV = { BC_API: 'http://x' };

describe('getRendererPreset', () => {
  test('target=web、entry/output 落在 renderer 目录', () => {
    const cfg = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
    expect(cfg.target).toBe('web');
    expect(cfg.entry).toBe(path.resolve(ROOT, 'src/renderer/index.js'));
    expect(cfg.output.path).toBe(path.resolve(ROOT, 'app/renderer'));
    expect(cfg.output.filename).toBe('index.js');
  });

  test('output.publicPath = "./"', () => {
    const cfg = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
    expect(cfg.output.publicPath).toBe('./');
  });

  test('不设 externals（renderer 跑在 Chromium，不外置 electron）', () => {
    const cfg = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
    expect(cfg.externals).toBeUndefined();
  });

  test('不设 output.libraryTarget（renderer 不是 CJS 库）', () => {
    const cfg = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
    expect(cfg.output.libraryTarget).toBeUndefined();
  });

  test('plugins 含 HtmlWebpackPlugin，模板路径正确，inject=true', () => {
    const cfg = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
    const html = cfg.plugins.find((p) => p instanceof HtmlWebpackPlugin);
    expect(html).toBeDefined();
    expect(html.userOptions.template).toBe(path.resolve(ROOT, 'src/renderer/index.html'));
    expect(html.userOptions.inject).toBe(true);
  });

  test('plugins 含 DefinePlugin，BC_ 前缀过滤生效', () => {
    const cfg = getRendererPreset({
      rootDir: ROOT,
      env: { BC_API: 'http://x', NODE_ENV: 'no' },
      mode: 'production',
    });
    const defPlugin = cfg.plugins.find((p) => p instanceof webpack.DefinePlugin);
    expect(defPlugin.definitions).toEqual({
      'process.env.BC_API': JSON.stringify('http://x'),
    });
  });

  test('devtool 按 mode', () => {
    const dev = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'development' });
    const prod = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
    expect(dev.devtool).toBe('source-map');
    expect(prod.devtool).toBe(false);
  });

  test('resolve.extensions 与 main / preload 一致', () => {
    const cfg = getRendererPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
    expect(cfg.resolve.extensions).toEqual(['.js', '.mjs', '.cjs', '.json']);
  });
});
