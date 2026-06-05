const fs = require('fs');
const path = require('path');
const { withTempCwd, writeFakePackage } = require('./_helpers');
const { resolveElectron, resolveMainEntry } = require('../../src/cli/utils/electron');

describe('resolveElectron', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('能在 rootDir 的 node_modules 里找到 electron 并返回可执行文件路径', () => {
    writeFakePackage(tmp.dir, 'electron', 'module.exports = "/fake/electron/binary";');
    expect(resolveElectron(tmp.dir)).toBe('/fake/electron/binary');
  });

  test('rootDir 下无 electron → 抛"未找到"错', () => {
    expect(() => resolveElectron(tmp.dir)).toThrow(/未找到 electron/);
    expect(() => resolveElectron(tmp.dir)).toThrow(new RegExp(tmp.dir.replace(/\\/g, '\\\\')));
  });
});

describe('resolveMainEntry', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('指向已存在的产物 → 返回绝对路径', () => {
    fs.writeFileSync(
      path.join(tmp.dir, 'package.json'),
      JSON.stringify({ main: 'app/main/index.js' })
    );
    fs.mkdirSync(path.join(tmp.dir, 'app', 'main'), { recursive: true });
    fs.writeFileSync(path.join(tmp.dir, 'app', 'main', 'index.js'), '// stub');

    expect(resolveMainEntry(tmp.dir)).toBe(
      path.resolve(tmp.dir, 'app/main/index.js')
    );
  });

  test('package.json.main 指向未构建的路径 → 抛"主进程入口不存在"错', () => {
    fs.writeFileSync(
      path.join(tmp.dir, 'package.json'),
      JSON.stringify({ main: 'app/main/index.js' })
    );
    expect(() => resolveMainEntry(tmp.dir)).toThrow(/主进程入口不存在/);
    expect(() => resolveMainEntry(tmp.dir)).toThrow(/请先构建/);
  });

  test('package.json.main 缺失 → 抛错（路径解析到 rootDir 自身，必不是文件）', () => {
    fs.writeFileSync(
      path.join(tmp.dir, 'package.json'),
      JSON.stringify({})
    );
    expect(() => resolveMainEntry(tmp.dir)).toThrow(/主进程入口不存在/);
  });
});
