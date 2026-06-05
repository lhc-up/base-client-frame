const { buildTargets } = require('../../src/cli/utils/electron-builder');

describe('buildTargets', () => {
  test('缺 --platform → 抛错', () => {
    expect(() => buildTargets({ arch: 'x64' })).toThrow(/--platform/);
  });
  test('缺 --arch → 抛错', () => {
    expect(() => buildTargets({ platform: 'win' })).toThrow(/--arch/);
  });
  test('不支持的 platform → 抛错', () => {
    expect(() => buildTargets({ platform: 'foo', arch: 'x64' }))
      .toThrow(/不支持的平台：foo/);
  });
  test('不支持的 arch → 抛错', () => {
    expect(() => buildTargets({ platform: 'win', arch: 'bogus' }))
      .toThrow(/不支持的架构：bogus/);
  });

  test('win + x64 → { win: ["nsis"], x64: true }', () => {
    expect(buildTargets({ platform: 'win', arch: 'x64' })).toEqual({
      win: ['nsis'], x64: true,
    });
  });

  test('mac + arm64 → { mac: ["dmg"], arm64: true }', () => {
    expect(buildTargets({ platform: 'mac', arch: 'arm64' })).toEqual({
      mac: ['dmg'], arm64: true,
    });
  });

  test('linux + loong64 → { linux: ["deb"], loong64: true }', () => {
    expect(buildTargets({ platform: 'linux', arch: 'loong64' })).toEqual({
      linux: ['deb'], loong64: true,
    });
  });

  test('unpack:true → 平台 target 改为 ["dir"]，架构不变', () => {
    expect(buildTargets({ platform: 'win', arch: 'x64', unpack: true })).toEqual({
      win: ['dir'], x64: true,
    });
  });
});
