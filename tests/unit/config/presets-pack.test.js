const { getPackPreset } = require('../../../src/config/presets/pack');

const baseCtx = (over = {}) => ({
    target: 'app',
    command: 'pack',
    mode: 'production',
    isDev: false, isProd: true, isApp: true, isWeb: false,
    cliOptions: { platform: 'win', arch: 'x64' },
    env: { BC_ENV: 'prod' },
    ...over,
});
const pkgJson = { name: 'demo', productName: 'Demo App', version: '1.2.3', author: 'lhc' };

describe('config/presets/pack', () => {
    test('directories.output = "dist"', () => {
        const p = getPackPreset(baseCtx(), pkgJson);
        expect(p.directories.output).toBe('dist');
    });

    test('files：app + package.json + 排除 node_modules', () => {
        const p = getPackPreset(baseCtx(), pkgJson);
        expect(p.files).toEqual(expect.arrayContaining([
            expect.objectContaining({ from: 'app', to: '.' }),
            'package.json',
            '!**/node_modules/**',
        ]));
    });

    test('extraMetadata.main = "main/index.js"', () => {
        const p = getPackPreset(baseCtx(), pkgJson);
        expect(p.extraMetadata.main).toBe('main/index.js');
    });

    test('productName = pkgJson.productName ?? pkgJson.name', () => {
        expect(getPackPreset(baseCtx(), pkgJson).productName).toBe('Demo App');
        expect(getPackPreset(baseCtx(), { name: 'demo', version: '1.0.0' }).productName).toBe('demo');
    });

    test('copyright 含年份与 author', () => {
        const year = new Date().getFullYear();
        const p = getPackPreset(baseCtx(), pkgJson);
        expect(p.copyright).toContain(String(year));
        expect(p.copyright).toContain('lhc');
    });

    test('artifactName 默认带 BC_ENV 维度', () => {
        const p = getPackPreset(baseCtx(), pkgJson);
        expect(p.artifactName).toContain('${env.BC_ENV}');
        expect(p.artifactName).toContain('${productName}');
        expect(p.artifactName).toContain('${version}');
    });

    test('不提供 appId 默认（由用户必填）', () => {
        const p = getPackPreset(baseCtx(), pkgJson);
        expect(p.appId).toBeUndefined();
    });

    test('preset 不注入 electronDownload / electronVersion（即使 arch=loong64）', () => {
        const p = getPackPreset(baseCtx({ cliOptions: { platform: 'linux', arch: 'loong64' } }), pkgJson);
        expect(p.electronDownload).toBeUndefined();
        expect(p.electronVersion).toBeUndefined();
    });
});
