const path = require('path');
const webpack = require('webpack');
const { getPreloadPreset } = require('../../src/config/presets/preload');

const ROOT = '/tmp/proj';
const ENV = { BC_API: 'http://x' };

describe('getPreloadPreset', () => {
    test('target=electron-preload', () => {
        expect(getPreloadPreset({ rootDir: ROOT, env: ENV, mode: 'production' }).target)
            .toBe('electron-preload');
    });

    test('entry / output.path 落在 preload 目录', () => {
        const cfg = getPreloadPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
        expect(cfg.entry).toBe(path.resolve(ROOT, 'src/preload/index.js'));
        expect(cfg.output.path).toBe(path.resolve(ROOT, 'app/preload'));
    });

    test('externals 锁定 electron 为 commonjs', () => {
        expect(getPreloadPreset({ rootDir: ROOT, env: ENV, mode: 'production' }).externals)
            .toEqual({ electron: 'commonjs electron' });
    });

    test('output.libraryTarget=commonjs2', () => {
        expect(getPreloadPreset({ rootDir: ROOT, env: ENV, mode: 'production' }).output.libraryTarget)
            .toBe('commonjs2');
    });

    test('devtool 按 mode', () => {
        const dev = getPreloadPreset({ rootDir: ROOT, env: ENV, mode: 'development' });
        const prod = getPreloadPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
        expect(dev.devtool).toBe('source-map');
        expect(prod.devtool).toBe(false);
    });

    test('plugins 含 DefinePlugin，BC_ 前缀过滤生效', () => {
        const cfg = getPreloadPreset({
            rootDir: ROOT,
            env: { BC_API: 'http://x', SECRET: 'no' },
            mode: 'production',
        });
        const defPlugin = cfg.plugins.find((p) => p instanceof webpack.DefinePlugin);
        expect(defPlugin.definitions).toEqual({
            'process.env.BC_API': JSON.stringify('http://x'),
        });
    });
});
