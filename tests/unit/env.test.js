const fs = require('fs');
const os = require('os');
const path = require('path');

const { readEnvFile, initEnv } = require('../../src/env');

test('模块导出 readEnvFile 与 initEnv', () => {
  const mod = require('../../src/env');
  expect(typeof mod.readEnvFile).toBe('function');
  expect(typeof mod.initEnv).toBe('function');
});

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

describe('initEnv', () => {
  let tmp;
  beforeEach(() => { tmp = withTempCwd(); });
  afterEach(() => { tmp.cleanup(); });

  test('.env.<name> 不存在时抛错', () => {
    expect(() => initEnv('prod')).toThrow(/\.env\.prod/);
  });

  test('只有 .env.<name>，返回 specific', () => {
    fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'BC_API=https://prod\n');
    expect(initEnv('prod')).toEqual({ BC_API: 'https://prod' });
  });

  test('.env 与 .env.<name> 合并；specific 覆盖 base', () => {
    fs.writeFileSync(
      path.join(tmp.dir, '.env'),
      'SHARED=common\nBC_API=base\n'
    );
    fs.writeFileSync(
      path.join(tmp.dir, '.env.prod'),
      'BC_API=prod-only\nBC_VERSION=1.0\n'
    );
    expect(initEnv('prod')).toEqual({
      SHARED: 'common',
      BC_API: 'prod-only',
      BC_VERSION: '1.0',
    });
  });

  test('默认 envName = prod', () => {
    fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'X=1\n');
    expect(initEnv()).toEqual({ X: '1' });
  });

  test('支持非 prod 的环境名（dev/test/custom）', () => {
    fs.writeFileSync(path.join(tmp.dir, '.env.staging'), 'X=staging\n');
    expect(initEnv('staging')).toEqual({ X: 'staging' });
  });

  test('initEnv 也不污染 process.env', () => {
    fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'FRAME_INIT_VAR=leaked\n');
    delete process.env.FRAME_INIT_VAR;
    initEnv('prod');
    expect(process.env.FRAME_INIT_VAR).toBeUndefined();
  });
});
