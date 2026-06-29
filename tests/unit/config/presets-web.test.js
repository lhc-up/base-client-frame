const path = require('path');
const webpack = require('webpack');
const { getWebPreset } = require('../../../src/config/presets/web');

const baseCtx = (over = {}) => ({
    target: 'web',
    command: 'dev:web',
    mode: 'development',
    isDev: true, isProd: false,
    isApp: false, isWeb: true,
    cliOptions: {},
    env: { BC_ENV: 'prod' },
    ...over,
});

const pkgJson = { name: 'demo', version: '1.0.0' };
const buildInfo = { target: 'web', name: 'demo', version: '1.0.0', env: 'prod', encrypted: false };

describe('config/presets/web', () => {
    test('返回对象含 target/entry/output/publicPath/plugins/module', () => {
        const preset = getWebPreset(baseCtx(), pkgJson, buildInfo);
        expect(preset.target).toBe('web');
        expect(preset.mode).toBe('development');
        expect(preset.entry).toContain(path.join('src', 'renderer', 'index.js'));
        expect(preset.output.path).toContain('dist');
        expect(preset.output.filename).toBe('index.js');
    });

    test('publicPath dev=/ prod=./', () => {
        expect(getWebPreset(baseCtx({ mode: 'development', isDev: true, isProd: false }), pkgJson, buildInfo).output.publicPath).toBe('/');
        expect(getWebPreset(baseCtx({ mode: 'production', isDev: false, isProd: true }), pkgJson, buildInfo).output.publicPath).toBe('./');
    });

    test('devtool dev=source-map prod=false', () => {
        expect(getWebPreset(baseCtx({ isDev: true, isProd: false, mode: 'development' }), pkgJson, buildInfo).devtool).toBe('source-map');
        expect(getWebPreset(baseCtx({ isDev: false, isProd: true, mode: 'production' }), pkgJson, buildInfo).devtool).toBe(false);
    });

    test('plugins 含 buildInfoPlugin 与 userEnvPlugin', () => {
        const preset = getWebPreset(baseCtx(), pkgJson, buildInfo);
        const definePlugins = preset.plugins.filter(p => p instanceof webpack.DefinePlugin);
        expect(definePlugins.length).toBe(2);
        const hasBuildInfo = definePlugins.some(p => '__BC_BUILD__' in p.definitions);
        expect(hasBuildInfo).toBe(true);
        const hasUserEnv = definePlugins.some(p => 'process.env.BC_ENV' in p.definitions);
        expect(hasUserEnv).toBe(true);
    });

    test('module.rules 含 Asset Modules（图片/字体/媒体）', () => {
        const preset = getWebPreset(baseCtx(), pkgJson, buildInfo);
        const rules = preset.module.rules;
        const imgRule = rules.find(r => r.test.test('foo.png'));
        const fontRule = rules.find(r => r.test.test('foo.woff2'));
        expect(imgRule.type).toBe('asset/resource');
        expect(fontRule.type).toBe('asset/resource');
    });

    test('output.assetModuleFilename 走 assets/[name].[hash:8][ext][query] 模板', () => {
        const preset = getWebPreset(baseCtx(), pkgJson, buildInfo);
        expect(preset.output.assetModuleFilename).toBe('assets/[name].[hash:8][ext][query]');
    });

    test('stats 静默 + infrastructureLogging level=warn', () => {
        const preset = getWebPreset(baseCtx(), pkgJson, buildInfo);
        expect(preset.stats).toBe('none');
        expect(preset.infrastructureLogging.level).toBe('warn');
    });

    test('resolve.extensions 含 .js .mjs .cjs .json', () => {
        const preset = getWebPreset(baseCtx(), pkgJson, buildInfo);
        expect(preset.resolve.extensions).toEqual(expect.arrayContaining(['.js', '.mjs', '.cjs', '.json']));
    });
});
