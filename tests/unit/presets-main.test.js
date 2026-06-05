const path = require('path');
const webpack = require('webpack');
const { getMainPreset } = require('../../src/config/presets/main');

const ROOT = '/tmp/proj';
const ENV = { BC_API: 'http://x' };

describe('getMainPreset', () => {
    test('target=electron-main、entry=<root>/src/main/index.js', () => {
        const cfg = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
        expect(cfg.target).toBe('electron-main');
        expect(cfg.entry).toBe(path.resolve(ROOT, 'src/main/index.js'));
    });

    test('output: path / filename / libraryTarget / assetModuleFilename', () => {
        const cfg = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
        expect(cfg.output).toMatchObject({
            path: path.resolve(ROOT, 'app/main'),
            filename: 'index.js',
            libraryTarget: 'commonjs2',
            assetModuleFilename: 'assets/[name].[hash:8][ext][query]',
        });
    });

    test('externals 锁定 electron 为 commonjs', () => {
        const cfg = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
        expect(cfg.externals).toEqual({ electron: 'commonjs electron' });
    });

    test('resolve.extensions 含 .js/.mjs/.cjs/.json', () => {
        const cfg = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
        expect(cfg.resolve.extensions).toEqual(['.js', '.mjs', '.cjs', '.json']);
    });

    test('mode 透传', () => {
        const dev = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'development' });
        const prod = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
        expect(dev.mode).toBe('development');
        expect(prod.mode).toBe('production');
    });

    test('devtool: development → source-map; production → false', () => {
        const dev = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'development' });
        const prod = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
        expect(dev.devtool).toBe('source-map');
        expect(prod.devtool).toBe(false);
    });

    test('module.rules 含 3 条 Asset Modules（图片/字体/媒体）', () => {
        const cfg = getMainPreset({ rootDir: ROOT, env: ENV, mode: 'production' });
        expect(cfg.module.rules).toHaveLength(3);
        cfg.module.rules.forEach((r) => expect(r.type).toBe('asset/resource'));

        const [imgs, fonts, media] = cfg.module.rules;
        expect(imgs.test.test('foo.png')).toBe(true);
        expect(imgs.test.test('foo.svg')).toBe(true);
        expect(fonts.test.test('foo.woff2')).toBe(true);
        expect(media.test.test('foo.mp4')).toBe(true);
    });

    test('plugins 含 DefinePlugin 实例，且只注入 BC_ 前缀', () => {
        const cfg = getMainPreset({
            rootDir: ROOT,
            env: { BC_API: 'http://x', SECRET: 'no' },
            mode: 'production',
        });
        const defPlugin = cfg.plugins.find((p) => p instanceof webpack.DefinePlugin);
        expect(defPlugin).toBeDefined();
        expect(defPlugin.definitions).toEqual({
            'process.env.BC_API': JSON.stringify('http://x'),
        });
    });
});
