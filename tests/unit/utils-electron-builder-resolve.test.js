const path = require('path');
const { withTempCwd, writeFakePackage } = require('./_helpers');
const { resolveElectronBuilder } = require('../../src/cli/utils/electron-builder');

describe('resolveElectronBuilder', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('rootDir 下有 electron-builder → 返回入口路径', () => {
    writeFakePackage(tmp.dir, 'electron-builder', 'module.exports = { build: () => {} };');
    const p = resolveElectronBuilder(tmp.dir);
    expect(p).toBe(path.resolve(tmp.dir, 'node_modules', 'electron-builder', 'index.js'));
  });

  test('rootDir 下无 electron-builder → 抛"未安装"错', () => {
    expect(() => resolveElectronBuilder(tmp.dir))
      .toThrow(/electron-builder 未安装/);
  });
});
