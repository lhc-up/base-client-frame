const { buildTargets } = require('../../../src/electron/build-targets');

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

    test('--unpack 时 targets 改为 dir', () => {
        expect(buildTargets({ platform: 'win', arch: 'x64', unpack: true })).toEqual({ win: ['dir'], x64: true });
    });

    test('缺 platform → 抛错', () => {
        expect(() => buildTargets({ arch: 'x64' })).toThrow(/--platform/);
    });

    test('未知 platform → 抛错', () => {
        expect(() => buildTargets({ platform: 'ios', arch: 'arm64' })).toThrow(/不支持的平台/);
    });

    test('缺 arch → 抛错', () => {
        expect(() => buildTargets({ platform: 'win' })).toThrow(/--arch/);
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
});
