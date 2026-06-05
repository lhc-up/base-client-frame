const webpack = require('webpack');
const { defineEnvPlugin } = require('../../src/config/presets/define-env');

describe('defineEnvPlugin', () => {
  test('返回 webpack.DefinePlugin 实例', () => {
    const plugin = defineEnvPlugin({ BC_API: 'http://x' });
    expect(plugin).toBeInstanceOf(webpack.DefinePlugin);
  });

  test('只注入 BC_ 前缀键、逐键定义为 process.env.<key>', () => {
    const plugin = defineEnvPlugin({
      BC_API: 'http://api',
      BC_VERSION: '1.0',
      SECRET: 'do-not-leak',
      NODE_ENV: 'not-injected',
    });
    expect(plugin.definitions).toEqual({
      'process.env.BC_API': JSON.stringify('http://api'),
      'process.env.BC_VERSION': JSON.stringify('1.0'),
    });
  });

  test('空 env 与未传 env 都返回空 definitions', () => {
    expect(defineEnvPlugin({}).definitions).toEqual({});
    expect(defineEnvPlugin(undefined).definitions).toEqual({});
  });

  test('不做整体替换 process.env（无 "process.env" 字面键）', () => {
    const plugin = defineEnvPlugin({ BC_API: 'x' });
    expect(plugin.definitions).not.toHaveProperty('process.env');
  });

  test('值用 JSON.stringify 序列化（字符串带引号、数字不带）', () => {
    const plugin = defineEnvPlugin({ BC_STR: 'abc', BC_NUM: 42 });
    expect(plugin.definitions['process.env.BC_STR']).toBe('"abc"');
    expect(plugin.definitions['process.env.BC_NUM']).toBe('42');
  });
});
