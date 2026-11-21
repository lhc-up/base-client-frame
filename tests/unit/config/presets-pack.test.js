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

    test('loong64：合并龙芯 Electron 镜像配置；其他架构不带', () => {
        const loong = getPackPreset(baseCtx({ cliOptions: { platform: 'linux', arch: 'loong64' } }), pkgJson);
        expect(loong.electronVersion).toBe('22.3.27');
        expect(loong.electronDownload).toEqual({
            version: '22.3.27',
            mirror: 'http://ftp.loongnix.cn/electron/LoongArch/',
            customDir: 'v22.3.27',
            platform: 'linux',
            arch: 'loong64',
        });

        for (const arch of ['x64', 'arm64', 'ia32']) {
            const p = getPackPreset(baseCtx({ cliOptions: { platform: 'linux', arch } }), pkgJson);
            expect(p.electronVersion).toBeUndefined();
            expect(p.electronDownload).toBeUndefined();
        }
    });

    test('loong64：每次返回新的 electronDownload 对象，改动不影响下一次', () => {
        const ctx = baseCtx({ cliOptions: { platform: 'linux', arch: 'loong64' } });
        const first = getPackPreset(ctx, pkgJson);
        first.electronDownload.mirror = 'changed';
        expect(getPackPreset(ctx, pkgJson).electronDownload.mirror).toBe('http://ftp.loongnix.cn/electron/LoongArch/');
    });
});
