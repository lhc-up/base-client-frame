const { buildTargets, computeUnpackedDir } = require('../../../src/electron/build-targets');

describe('electron/build-targets', () => {
    test('win + x64：{ win: ["nsis"], x64: true }', () => {
        expect(buildTargets({ platform: 'win', arch: 'x64' })).toEqual({ win: ['nsis'], x64: true });
    });

    test('mac + arm64：{ mac: ["dmg"], arm64: true }', () => {
        expect(buildTargets({ platform: 'mac', arch: 'arm64' })).toEqual({ mac: ['dmg'], arm64: true });
    });

    test('linux + x64：{ linux: ["deb"], x64: true }', () => {
        expect(buildTargets({ platform: 'linux', arch: 'x64' })).toEqual({ linux: ['deb'], x64: true });
    });

    test('--dir 时 targets 改为 dir', () => {
        expect(buildTargets({ platform: 'win', arch: 'x64', dir: true })).toEqual({ win: ['dir'], x64: true });
    });

    test('未知 platform → 抛错', () => {
        expect(() => buildTargets({ platform: 'ios', arch: 'arm64' })).toThrow(/不支持的平台/);
    });

    test('未知 arch → 抛错', () => {
        expect(() => buildTargets({ platform: 'win', arch: 'mips' })).toThrow(/不支持的架构/);
    });

    test('loong64 / armv7l / universal / ia32 均合法', () => {
        expect(buildTargets({ platform: 'linux', arch: 'loong64' })).toEqual({ linux: ['deb'], loong64: true });
        expect(buildTargets({ platform: 'linux', arch: 'armv7l' })).toEqual({ linux: ['deb'], armv7l: true });
        expect(buildTargets({ platform: 'mac', arch: 'universal' })).toEqual({ mac: ['dmg'], universal: true });
        expect(buildTargets({ platform: 'win', arch: 'ia32' })).toEqual({ win: ['nsis'], ia32: true });
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
            expect(buildTargets({})).toEqual({ win: ['nsis'], x64: true });
        });

        test('缺 platform + 宿主 darwin → 默认 mac', () => {
            Object.defineProperty(process, 'platform', { value: 'darwin' });
            Object.defineProperty(process, 'arch', { value: 'arm64' });
            expect(buildTargets({})).toEqual({ mac: ['dmg'], arm64: true });
        });

        test('缺 platform + 宿主 linux → 默认 linux', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            Object.defineProperty(process, 'arch', { value: 'x64' });
            expect(buildTargets({})).toEqual({ linux: ['deb'], x64: true });
        });

        test('缺 platform + 宿主是不受支持的 freebsd → 抛错', () => {
            Object.defineProperty(process, 'platform', { value: 'freebsd' });
            Object.defineProperty(process, 'arch', { value: 'x64' });
            expect(() => buildTargets({})).toThrow(/不支持的平台/);
        });

        test('缺 arch → 默认宿主 arch', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            Object.defineProperty(process, 'arch', { value: 'arm64' });
            expect(buildTargets({ platform: 'linux' })).toEqual({ linux: ['deb'], arm64: true });
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
            expect(buildTargets({ platform: 'win', arch: 'x64' })).toEqual({ win: ['nsis'], x64: true });
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
