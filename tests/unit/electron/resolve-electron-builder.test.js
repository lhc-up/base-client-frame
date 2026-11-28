jest.mock('@base-client/electron-builder', () => require('../../helpers/mock-electron-builder'));

const { resolveElectronBuilder, runBuilder } = require('../../../src/electron/resolve-electron-builder');

describe('electron/resolve-electron-builder', () => {
    test('使用 frame 自己依赖的 @base-client/electron-builder', () => {
        const lib = resolveElectronBuilder();
        expect(typeof lib.build).toBe('function');
        expect(lib.Arch.loong64).toBe(5);
    });

    test('runBuilder：targets 转成 Map，传入 config、projectDir、prepackaged', async () => {
        const lib = resolveElectronBuilder();
        lib._clearLastCall();
        const config = { appId: 'com.test.x' };
        await runBuilder({ platform: 'linux', types: ['deb'], builderArch: 'loong64' }, {
            config,
            projectDir: '/proj',
            prepackaged: '/proj/dist/linux-loong64-unpacked',
        });
        expect(lib._getLastCall()).toEqual({
            linux: ['deb'],
            loong64: true,
            config,
            projectDir: '/proj',
            prepackaged: '/proj/dist/linux-loong64-unpacked',
        });
    });
});

describe('withConfigMirror', () => {
    const { withConfigMirror, MIRROR_ENV_KEYS } = require('../../../src/electron/resolve-electron-builder');

    test('配置写了 electronDownload.mirror：打包期间环境变量设为该地址，结束后恢复', async () => {
        const saved = MIRROR_ENV_KEYS.map(key => process.env[key]);
        process.env.npm_config_electron_mirror = 'https://npmmirror.com/mirrors/electron/';
        delete process.env.ELECTRON_MIRROR;
        try {
            let seen;
            await withConfigMirror({ electronDownload: { mirror: 'http://ftp.loongnix.cn/electron/LoongArch/' } }, async () => {
                seen = MIRROR_ENV_KEYS.map(key => process.env[key]);
            });
            expect(seen).toEqual(MIRROR_ENV_KEYS.map(() => 'http://ftp.loongnix.cn/electron/LoongArch/'));
            expect(process.env.npm_config_electron_mirror).toBe('https://npmmirror.com/mirrors/electron/');
            expect(process.env.ELECTRON_MIRROR).toBeUndefined();
        } finally {
            MIRROR_ENV_KEYS.forEach((key, i) => {
                if (saved[i] === undefined) delete process.env[key];
                else process.env[key] = saved[i];
            });
        }
    });

    test('配置没写 mirror：不改环境变量；出错时同样恢复', async () => {
        const before = process.env.ELECTRON_MIRROR;
        await withConfigMirror({}, async () => {
            expect(process.env.ELECTRON_MIRROR).toBe(before);
        });
        await expect(withConfigMirror({ electronDownload: { mirror: 'x' } }, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        expect(process.env.ELECTRON_MIRROR).toBe(before);
    });
});
