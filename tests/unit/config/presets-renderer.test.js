const path = require('path');
const webpack = require('webpack');
const { getRendererPreset } = require('../../../src/config/presets/renderer');

const baseCtx = (over = {}) => ({
    target: 'app',
    command: 'dev:app',
    mode: 'development',
    isDev: true, isProd: false, isApp: true, isWeb: false,
    cliOptions: {},
    env: { BC_ENV: 'prod' },
    ...over,
});
const pkgJson = { name: 'demo', version: '1.0.0' };
const buildInfo = { target: 'app', name: 'demo', version: '1.0.0', env: 'prod', encrypted: false, encryptKey: 'KEY' };

describe('config/presets/renderer', () => {
    test('target=web，entry 是对象形态（多入口预留）', () => {
        const p = getRendererPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.target).toBe('web');
        expect(typeof p.entry).toBe('object');
        expect(p.entry.renderer).toContain(path.join('src', 'renderer', 'index.js'));
    });

    test('output.filename 使用 [name]/index.js 模板', () => {
        const p = getRendererPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.output.filename).toBe('[name]/index.js');
        expect(p.output.path).toContain('app');
    });

    test('publicPath dev=/ prod=./', () => {
        expect(getRendererPreset(baseCtx({ isDev: true, isProd: false, mode: 'development' }), pkgJson, buildInfo).output.publicPath).toBe('/');
        expect(getRendererPreset(baseCtx({ isDev: false, isProd: true, mode: 'production' }), pkgJson, buildInfo).output.publicPath).toBe('./');
    });

    test('externals 为空（renderer 跑浏览器）', () => {
        const p = getRendererPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.externals).toBeUndefined();
    });

    test('plugins 含 buildInfoPlugin（不含 encryptKey）+ userEnvPlugin', () => {
        const p = getRendererPreset(baseCtx(), pkgJson, buildInfo);
        const defs = p.plugins.filter(pl => pl instanceof webpack.DefinePlugin);
        const allDefs = defs.reduce((acc, d) => ({ ...acc, ...d.definitions }), {});
        expect(allDefs['__BC_BUILD__.target']).toBe('"app"');
        expect(allDefs).not.toHaveProperty('__BC_BUILD__.encryptKey');
        expect(allDefs['process.env.BC_ENV']).toBe('"prod"');
    });

    test('stats 静默 + infrastructureLogging.level=warn', () => {
        const p = getRendererPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.stats).toBe('none');
        expect(p.infrastructureLogging.level).toBe('warn');
    });
});
