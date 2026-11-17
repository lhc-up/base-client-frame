const path = require('path');
const webpack = require('webpack');
const { getMainPreset } = require('../../../src/config/presets/main');

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

describe('config/presets/main', () => {
    test('target=electron-main, entry/output 正确', () => {
        const p = getMainPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.target).toBe('electron-main');
        expect(p.entry.index).toContain(path.join('src', 'main', 'index.js'));
        expect(p.entry.pkg).toContain(path.join('src', 'main', 'pkg.js'));
        expect(p.output.path).toContain(path.join('app', 'main'));
        expect(p.output.filename).toBe('[name].js');
        expect(p.output.libraryTarget).toBe('commonjs2');
    });

    test('externals 为数组，含 electron commonjs（业务追加项按数组拼接）', () => {
        const p = getMainPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.externals).toEqual([{ electron: 'commonjs electron' }]);
    });

    test('--pkg-only 只保留 pkg 入口', () => {
        const p = getMainPreset(baseCtx({ cliOptions: { pkgOnly: true } }), pkgJson, buildInfo);
        expect(Object.keys(p.entry)).toEqual(['pkg']);
    });

    test('devtool dev=source-map prod=false', () => {
        expect(getMainPreset(baseCtx({ isDev: true, isProd: false, mode: 'development' }), pkgJson, buildInfo).devtool).toBe('source-map');
        expect(getMainPreset(baseCtx({ isDev: false, isProd: true, mode: 'production' }), pkgJson, buildInfo).devtool).toBe(false);
    });

    test('plugins 含 buildInfoPlugin（含 encryptKey）+ userEnvPlugin', () => {
        const p = getMainPreset(baseCtx(), pkgJson, buildInfo);
        const defs = p.plugins.filter(pl => pl instanceof webpack.DefinePlugin);
        const allDefs = defs.reduce((acc, d) => ({ ...acc, ...d.definitions }), {});
        expect(allDefs['__BC_BUILD__.target']).toBe('"app"');
        expect(allDefs['__BC_BUILD__.encryptKey']).toBe('"KEY"');
        expect(allDefs['process.env.BC_ENV']).toBe('"prod"');
    });

    test('resolve.extensions 含 .js .mjs .cjs .json', () => {
        const p = getMainPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.resolve.extensions).toEqual(expect.arrayContaining(['.js', '.mjs', '.cjs', '.json']));
    });
});
