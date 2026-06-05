const fs = require('fs');
const os = require('os');
const path = require('path');

const { readEnvFile, initEnv } = require('../../src/env');

/** 把当前 cwd 切到一个干净的临时目录，返回该路径与还原函数。 */
function withTempCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-env-'));
  const originalCwd = process.cwd();
  process.chdir(dir);
  return {
    dir,
    cleanup() {
      process.chdir(originalCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe('readEnvFile', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('文件不存在时返回 null', () => {
    expect(readEnvFile('.env')).toBeNull();
  });

  test('文件存在时解析为对象', () => {
    fs.writeFileSync(path.join(tmp.dir, '.env'), 'FOO=bar\nBC_API=http://a\n');
    expect(readEnvFile('.env')).toEqual({ FOO: 'bar', BC_API: 'http://a' });
  });

  test('不污染 process.env', () => {
    fs.writeFileSync(path.join(tmp.dir, '.env'), 'FRAME_TEST_VAR=secret\n');
    delete process.env.FRAME_TEST_VAR;
    readEnvFile('.env');
    expect(process.env.FRAME_TEST_VAR).toBeUndefined();
  });
});
