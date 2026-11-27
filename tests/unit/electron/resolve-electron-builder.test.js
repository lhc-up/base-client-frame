jest.mock('@base-client/app-builder-lib', () => require('../../helpers/mock-app-builder-lib'));

const { resolveAppBuilderLib, runBuilder } = require('../../../src/electron/resolve-electron-builder');

describe('electron/resolve-electron-builder', () => {
    test('使用 frame 自己依赖的 @base-client/app-builder-lib', () => {
        const lib = resolveAppBuilderLib();
        expect(typeof lib.build).toBe('function');
        expect(lib.Arch.loong64).toBe(5);
    });

    test('runBuilder：targets 转成 Map，传入 config、projectDir、prepackaged', async () => {
        const lib = resolveAppBuilderLib();
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
