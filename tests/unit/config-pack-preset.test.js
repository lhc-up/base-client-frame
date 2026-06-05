const { getPackPreset } = require('../../src/config/presets/pack');

const PKG = { name: 'demo', author: 'Alice' };

describe('getPackPreset', () => {
    test('A 产物布局：directories.output / files / extraMetadata.main', () => {
        const p = getPackPreset({
            rootDir: '/tmp/proj', env: {}, mode: 'production', cliOptions: {}, pkgJson: PKG,
        });
        expect(p.directories).toEqual({ output: 'dist' });
        expect(p.files).toEqual([
            { from: 'app', to: '.' },
            'package.json',
            '!**/node_modules/**',
        ]);
        expect(p.extraMetadata).toEqual({ main: 'main/index.js' });
    });

    test('B 派生：productName / copyright / artifactName', () => {
        const year = new Date().getFullYear();
        const p = getPackPreset({
            rootDir: '/tmp', env: {}, mode: 'production', cliOptions: {},
            pkgJson: { name: 'demo', author: 'Alice' },
        });
        expect(p.productName).toBe('demo');
        expect(p.copyright).toBe(`Copyright © ${year} Alice`);
        expect(p.artifactName).toBe('${productName}_${os}_${arch}_${env.BC_ENV}_v${version}.${ext}');
    });

    test('B 派生：pkgJson.productName 优先于 name', () => {
        const p = getPackPreset({
            rootDir: '/tmp', env: {}, mode: 'production', cliOptions: {},
            pkgJson: { name: 'internal-id', productName: 'Pretty Name' },
        });
        expect(p.productName).toBe('Pretty Name');
    });

    test('appId 不在预设里（必填项，user 必须自行声明）', () => {
        const p = getPackPreset({
            rootDir: '/tmp', env: {}, mode: 'production', cliOptions: {},
            pkgJson: { name: 'demo' },
        });
        expect(p).not.toHaveProperty('appId');
    });

    test('C loong64 → 注入 electronDownload + electronVersion', () => {
        const p = getPackPreset({
            rootDir: '/tmp', env: {}, mode: 'production',
            cliOptions: { arch: 'loong64' }, pkgJson: { name: 'demo' },
        });
        expect(p.electronVersion).toBe('22.3.27');
        expect(p.electronDownload).toEqual({
            version: '22.3.27',
            mirror: 'http://ftp.loongnix.cn/electron/LoongArch/',
            customDir: 'v22.3.27',
            platform: 'linux',
            arch: 'loong64',
        });
    });

    test('C 非 loong64 → 不注入 electronDownload / electronVersion', () => {
        for (const arch of ['x64', 'arm64', 'ia32', 'armv7l', 'universal']) {
            const p = getPackPreset({
                rootDir: '/tmp', env: {}, mode: 'production',
                cliOptions: { arch }, pkgJson: { name: 'demo' },
            });
            expect(p).not.toHaveProperty('electronDownload');
            expect(p).not.toHaveProperty('electronVersion');
        }
    });
});
