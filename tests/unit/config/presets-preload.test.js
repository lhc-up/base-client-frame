const path = require('path');
const webpack = require('webpack');
const { getPreloadPreset } = require('../../../src/config/presets/preload');

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

describe('config/presets/preload', () => {
    test('target=electron-preload, entry/output 正确（多入口友好默认）', () => {
        const p = getPreloadPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.target).toBe('electron-preload');
        expect(p.entry).toEqual({ index: expect.stringContaining(path.join('src', 'preload', 'index.js')) });
        expect(p.output.path).toContain(path.join('app', 'preload'));
        expect(p.output.filename).toBe('[name].js');
    });

    test('externals 含 electron', () => {
        const p = getPreloadPreset(baseCtx(), pkgJson, buildInfo);
        expect(p.externals).toEqual({ electron: 'commonjs electron' });
    });

    test('plugins 含 buildInfoPlugin（不含 encryptKey）', () => {
        const p = getPreloadPreset(baseCtx(), pkgJson, buildInfo);
        const defs = p.plugins.filter(pl => pl instanceof webpack.DefinePlugin);
        const allDefs = defs.reduce((acc, d) => ({ ...acc, ...d.definitions }), {});
        expect(allDefs['__BC_BUILD__.target']).toBe('"app"');
        expect(allDefs).not.toHaveProperty('__BC_BUILD__.encryptKey');
        expect(allDefs['process.env.BC_ENV']).toBe('"prod"');
    });
});
