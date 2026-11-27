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

    test('win.requestedExecutionLevel 默认 highestAvailable，项目写了以项目为准', () => {
        const { customMerge } = require('../../../src/config/merge');
        const preset = getPackPreset(baseCtx({ cliOptions: { platform: 'win', arch: 'x64' } }), pkgJson);
        expect(preset.win).toEqual({ requestedExecutionLevel: 'highestAvailable' });
        const merged = customMerge(preset, { win: { requestedExecutionLevel: 'asInvoker', legalTrademarks: 'x' } });
        expect(merged.win).toEqual({ requestedExecutionLevel: 'asInvoker', legalTrademarks: 'x' });
    });

    test('nsis 安装选项默认值，项目写了以项目为准', () => {
        const { customMerge } = require('../../../src/config/merge');
        const preset = getPackPreset(baseCtx({ cliOptions: { platform: 'win', arch: 'x64' } }), pkgJson);
        expect(preset.nsis).toEqual({
            oneClick: false,
            allowToChangeInstallationDirectory: true,
            perMachine: true,
            deleteAppDataOnUninstall: true,
            language: '2052',
            uninstallDisplayName: '${productName}',
            runAfterFinish: true,
        });
        const merged = customMerge(preset, { nsis: { perMachine: false, guid: 'x' } });
        expect(merged.nsis.perMachine).toBe(false);
        expect(merged.nsis.guid).toBe('x');
        expect(merged.nsis.oneClick).toBe(false);
    });

    test('dmg.title、mac.identity、linux.category、linux.executableArgs 默认值', () => {
        const preset = getPackPreset(baseCtx({ cliOptions: { platform: 'linux', arch: 'x64' } }), pkgJson);
        expect(preset.dmg).toEqual({ title: '${productName}' });
        expect(preset.mac).toEqual({ identity: null });
        expect(preset.linux.category).toBe('Education;Utility;Network');
        expect(preset.linux.executableArgs).toEqual(['--no-sandbox']);
    });

    test('项目可覆盖 nsis.runAfterFinish；linux.executableArgs 默认与预设拼接，用 replace() 整体替换', () => {
        const { customMerge, replace } = require('../../../src/config/merge');
        const preset = () => getPackPreset(baseCtx({ cliOptions: { platform: 'linux', arch: 'x64' } }), pkgJson);
        const merged = customMerge(preset(), { nsis: { runAfterFinish: false }, linux: { executableArgs: ['--foo'] } });
        expect(merged.nsis.runAfterFinish).toBe(false);
        expect(merged.linux.executableArgs).toEqual(['--no-sandbox', '--foo']);
        const replaced = customMerge(preset(), { linux: { executableArgs: replace(['--foo']) } });
        expect(replaced.linux.executableArgs).toEqual(['--foo']);
    });

    describe('linux.maintainer', () => {
        const ctx = () => baseCtx({ cliOptions: { platform: 'linux', arch: 'x64' } });

        test('author 是字符串时默认作为 maintainer', () => {
            const preset = getPackPreset(ctx(), { ...pkgJson, author: '北京师范大学' });
            expect(preset.linux).toEqual({ category: 'Education;Utility;Network', executableArgs: ['--no-sandbox'], maintainer: '北京师范大学' });
        });

        test('author 是对象、空字符串或没写时不设置', () => {
            expect(getPackPreset(ctx(), { ...pkgJson, author: { name: 'a', email: 'a@b.c' } }).linux.maintainer).toBeUndefined();
            expect(getPackPreset(ctx(), { ...pkgJson, author: '  ' }).linux.maintainer).toBeUndefined();
            const { author: _ignored, ...noAuthor } = pkgJson;
            expect(getPackPreset(ctx(), noAuthor).linux.maintainer).toBeUndefined();
        });

        test('项目写了 linux.maintainer 时合并后以项目为准，其他 linux 项保留', () => {
            const { customMerge } = require('../../../src/config/merge');
            const preset = getPackPreset(ctx(), { ...pkgJson, author: '北京师范大学' });
            const merged = customMerge(preset, { linux: { maintainer: 'x <x@y.z>', category: 'Education' } });
            expect(merged.linux).toEqual({ maintainer: 'x <x@y.z>', category: 'Education', executableArgs: ['--no-sandbox'] });
        });
    });

    describe('Electron 下载镜像', () => {
        const saved = {};
        const KEYS = ['ELECTRON_MIRROR', 'npm_config_electron_mirror'];
        beforeEach(() => {
            for (const key of KEYS) {
                saved[key] = process.env[key];
                delete process.env[key];
            }
        });
        afterEach(() => {
            for (const key of KEYS) {
                if (saved[key] === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = saved[key];
                }
            }
        });

        test('龙芯以外的架构默认用 npmmirror', () => {
            for (const arch of ['x64', 'arm64', 'ia32']) {
                const p = getPackPreset(baseCtx({ cliOptions: { platform: 'linux', arch } }), pkgJson);
                expect(p.electronDownload).toEqual({ mirror: 'https://npmmirror.com/mirrors/electron/' });
            }
        });

        test('环境变量 ELECTRON_MIRROR 或 npm_config_electron_mirror 已指定时不设置', () => {
            process.env.ELECTRON_MIRROR = 'https://mirror.example/electron/';
            expect(getPackPreset(baseCtx({ cliOptions: { platform: 'win', arch: 'x64' } }), pkgJson).electronDownload).toBeUndefined();
            delete process.env.ELECTRON_MIRROR;
            process.env.npm_config_electron_mirror = 'https://mirror.example/electron/';
            expect(getPackPreset(baseCtx({ cliOptions: { platform: 'win', arch: 'x64' } }), pkgJson).electronDownload).toBeUndefined();
        });

        test('项目写了 electronDownload 时合并后以项目为准', () => {
            const { customMerge } = require('../../../src/config/merge');
            const preset = getPackPreset(baseCtx({ cliOptions: { platform: 'win', arch: 'x64' } }), pkgJson);
            const merged = customMerge(preset, { electronDownload: { mirror: 'https://mirror.example/electron/' } });
            expect(merged.electronDownload.mirror).toBe('https://mirror.example/electron/');
        });
    });

    test('loongarch64（旧世界）：龙芯镜像 Electron、deb 架构名 loongarch64、产物文件名用 loongarch64', () => {
        const loong = getPackPreset(baseCtx({ cliOptions: { platform: 'linux', arch: 'loongarch64' } }), pkgJson);
        expect(loong.electronVersion).toBe('22.3.27');
        expect(loong.electronDownload).toEqual({
            version: '22.3.27',
            mirror: 'http://ftp.loongnix.cn/electron/LoongArch/',
            customDir: 'v22.3.27',
            platform: 'linux',
            arch: 'loong64',
        });
        expect(loong.deb).toEqual({ architecture: 'loongarch64' });
        expect(loong.artifactName).toBe('${productName}_${os}_loongarch64_${env.BC_ENV}_v${version}.${ext}');

        for (const arch of ['x64', 'arm64', 'ia32']) {
            const p = getPackPreset(baseCtx({ cliOptions: { platform: 'linux', arch } }), pkgJson);
            expect(p.electronVersion).toBeUndefined();
            expect(p.electronDownload && p.electronDownload.arch).toBeUndefined();
            expect(p.deb).toBeUndefined();
            expect(p.artifactName).toContain('${arch}');
        }
    });

    test('loong64（新世界）：只带 deb 架构名 loong64，不带龙芯旧世界的 Electron', () => {
        const p = getPackPreset(baseCtx({ cliOptions: { platform: 'linux', arch: 'loong64' } }), pkgJson);
        expect(p.deb).toEqual({ architecture: 'loong64' });
        expect(p.electronVersion).toBeUndefined();
    });

    test('loongarch64：每次返回新的 electronDownload 对象，改动不影响下一次', () => {
        const ctx = baseCtx({ cliOptions: { platform: 'linux', arch: 'loongarch64' } });
        const first = getPackPreset(ctx, pkgJson);
        first.electronDownload.mirror = 'changed';
        expect(getPackPreset(ctx, pkgJson).electronDownload.mirror).toBe('http://ftp.loongnix.cn/electron/LoongArch/');
    });
});
