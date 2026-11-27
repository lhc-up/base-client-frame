const { buildTargets, computeUnpackedDir, toBuilderTargetMap } = require('../../../src/electron/build-targets');

describe('electron/build-targets', () => {
    test('win + x64', () => {
        expect(buildTargets({ platform: 'win', arch: 'x64' })).toEqual({ platform: 'win', types: ['nsis'], builderArch: 'x64' });
    });

    test('mac + arm64', () => {
        expect(buildTargets({ platform: 'mac', arch: 'arm64' })).toEqual({ platform: 'mac', types: ['dmg'], builderArch: 'arm64' });
    });

    test('linux + x64', () => {
        expect(buildTargets({ platform: 'linux', arch: 'x64' })).toEqual({ platform: 'linux', types: ['deb'], builderArch: 'x64' });
    });

    test('--dir 时 targets 改为 dir', () => {
        expect(buildTargets({ platform: 'win', arch: 'x64', dir: true })).toEqual({ platform: 'win', types: ['dir'], builderArch: 'x64' });
    });

    test('未知 platform → 抛错', () => {
        expect(() => buildTargets({ platform: 'ios', arch: 'arm64' })).toThrow(/不支持的平台/);
    });

    test('未知 arch → 抛错', () => {
        expect(() => buildTargets({ platform: 'win', arch: 'mips' })).toThrow(/不支持的架构/);
    });

    test('龙芯两个目标（loongarch64 旧世界、loong64 新世界）在 electron-builder 中都是 loong64', () => {
        expect(buildTargets({ platform: 'linux', arch: 'loongarch64' })).toEqual({ platform: 'linux', types: ['deb'], builderArch: 'loong64' });
        expect(buildTargets({ platform: 'linux', arch: 'loong64' })).toEqual({ platform: 'linux', types: ['deb'], builderArch: 'loong64' });
    });

    test('toBuilderTargetMap：转成 app-builder-lib 的 Map<Platform, Map<Arch, types>>', () => {
        const lib = require('../../helpers/mock-app-builder-lib');
        const map = toBuilderTargetMap(buildTargets({ platform: 'linux', arch: 'loongarch64', dir: true }), lib);
        const [[platform, archMap]] = [...map.entries()];
        expect(platform).toBe(lib.Platform.LINUX);
        expect([...archMap.entries()]).toEqual([[lib.Arch.loong64, ['dir']]]);
    });

    test('computeUnpackedDir：龙芯目标按 electron-builder 的架构名 loong64 命名', () => {
        expect(computeUnpackedDir({ platform: 'linux', arch: 'loongarch64' })).toBe('linux-loong64-unpacked');
        expect(computeUnpackedDir({ platform: 'linux', arch: 'x64' })).toBe('linux-unpacked');
    });

    test('armv7l / universal / ia32 均合法', () => {
        expect(buildTargets({ platform: 'linux', arch: 'armv7l' })).toEqual({ platform: 'linux', types: ['deb'], builderArch: 'armv7l' });
        expect(buildTargets({ platform: 'mac', arch: 'universal' })).toEqual({ platform: 'mac', types: ['dmg'], builderArch: 'universal' });
        expect(buildTargets({ platform: 'win', arch: 'ia32' })).toEqual({ platform: 'win', types: ['nsis'], builderArch: 'ia32' });
    });

    describe('宿主兜底（M1）', () => {
        let originalPlatform;
        let originalArch;

        beforeEach(() => {
            originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
            originalArch = Object.getOwnPropertyDescriptor(process, 'arch');
        });
        afterEach(() => {
            Object.defineProperty(process, 'platform', originalPlatform);
            Object.defineProperty(process, 'arch', originalArch);
        });

        test('缺 platform + 宿主 win32 → 默认 win', () => {
            Object.defineProperty(process, 'platform', { value: 'win32' });
            Object.defineProperty(process, 'arch', { value: 'x64' });
            expect(buildTargets({})).toEqual({ platform: 'win', types: ['nsis'], builderArch: 'x64' });
        });

        test('缺 platform + 宿主 darwin → 默认 mac', () => {
            Object.defineProperty(process, 'platform', { value: 'darwin' });
            Object.defineProperty(process, 'arch', { value: 'arm64' });
            expect(buildTargets({})).toEqual({ platform: 'mac', types: ['dmg'], builderArch: 'arm64' });
        });

        test('缺 platform + 宿主 linux → 默认 linux', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            Object.defineProperty(process, 'arch', { value: 'x64' });
            expect(buildTargets({})).toEqual({ platform: 'linux', types: ['deb'], builderArch: 'x64' });
        });

        test('缺 platform + 宿主是不受支持的 freebsd → 抛错', () => {
            Object.defineProperty(process, 'platform', { value: 'freebsd' });
            Object.defineProperty(process, 'arch', { value: 'x64' });
            expect(() => buildTargets({})).toThrow(/不支持的平台/);
        });

        test('缺 arch → 默认宿主 arch', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            Object.defineProperty(process, 'arch', { value: 'arm64' });
            expect(buildTargets({ platform: 'linux' })).toEqual({ platform: 'linux', types: ['deb'], builderArch: 'arm64' });
        });

        test('缺 arch + 宿主 arch 不在白名单 → 抛错', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            Object.defineProperty(process, 'arch', { value: 'mips' });
            expect(() => buildTargets({ platform: 'linux' })).toThrow(/不支持的架构/);
        });

        test('computeUnpackedDir 复用宿主兜底结果', () => {
            Object.defineProperty(process, 'platform', { value: 'win32' });
            Object.defineProperty(process, 'arch', { value: 'x64' });
            expect(computeUnpackedDir({})).toBe('win-unpacked');
        });

        test('用户显式 --platform 覆盖宿主兜底', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            Object.defineProperty(process, 'arch', { value: 'x64' });
            expect(buildTargets({ platform: 'win', arch: 'x64' })).toEqual({ platform: 'win', types: ['nsis'], builderArch: 'x64' });
        });
    });
});

describe('electron/computeUnpackedDir', () => {
    test('win + x64：win-unpacked（x64 省略 arch 段）', () => {
        expect(computeUnpackedDir({ platform: 'win', arch: 'x64' })).toBe('win-unpacked');
    });

    test('win + ia32：win-ia32-unpacked', () => {
        expect(computeUnpackedDir({ platform: 'win', arch: 'ia32' })).toBe('win-ia32-unpacked');
    });

    test('win + arm64：win-arm64-unpacked', () => {
        expect(computeUnpackedDir({ platform: 'win', arch: 'arm64' })).toBe('win-arm64-unpacked');
    });

    test('linux + x64：linux-unpacked', () => {
        expect(computeUnpackedDir({ platform: 'linux', arch: 'x64' })).toBe('linux-unpacked');
    });

    test('linux + armv7l：linux-armv7l-unpacked', () => {
        expect(computeUnpackedDir({ platform: 'linux', arch: 'armv7l' })).toBe('linux-armv7l-unpacked');
    });

    test('linux + loong64：linux-loong64-unpacked', () => {
        expect(computeUnpackedDir({ platform: 'linux', arch: 'loong64' })).toBe('linux-loong64-unpacked');
    });

    test('mac + x64：mac（无 -unpacked 后缀）', () => {
        expect(computeUnpackedDir({ platform: 'mac', arch: 'x64' })).toBe('mac');
    });

    test('mac + arm64：mac-arm64', () => {
        expect(computeUnpackedDir({ platform: 'mac', arch: 'arm64' })).toBe('mac-arm64');
    });

    test('mac + universal：mac-universal', () => {
        expect(computeUnpackedDir({ platform: 'mac', arch: 'universal' })).toBe('mac-universal');
    });
});
