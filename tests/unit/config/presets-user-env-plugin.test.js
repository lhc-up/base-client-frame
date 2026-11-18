const webpack = require('webpack');
const { userEnvPlugin } = require('../../../src/config/presets/user-env-plugin');

describe('config/presets/user-env-plugin', () => {
    test('返回 DefinePlugin 实例', () => {
        const plugin = userEnvPlugin({ BC_ENV: 'prod' });
        expect(plugin).toBeInstanceOf(webpack.DefinePlugin);
    });

    test('仅注入 BC_ 前缀键，非 BC_ 跳过', () => {
        const plugin = userEnvPlugin({
            BC_ENV: 'prod',
            BC_API_BASE: 'https://api',
            WIN_CODE_SIGN_PWD: 'secret',
            HOME: '/home/user',
        });
        const defs = plugin.definitions;
        expect(defs['process.env.BC_ENV']).toBe('"prod"');
        expect(defs['process.env.BC_API_BASE']).toBe('"https://api"');
        expect(defs['process.env.WIN_CODE_SIGN_PWD']).toBeUndefined();
        expect(defs['process.env.HOME']).toBeUndefined();
    });

    test('env 为 undefined 时只定义 frame 生成的变量，均为 undefined', () => {
        const plugin = userEnvPlugin(undefined);
        expect(plugin.definitions).toEqual({
            'process.env.BC_DEV': 'undefined',
            'process.env.BC_DEV_URL': 'undefined',
        });
    });

    test('构造之后写入 env 的变量也会生效（BC_DEV_URL 在构建配置求值之后写入）', () => {
        const env = { BC_DEV: 'true' };
        const plugin = userEnvPlugin(env);
        env.BC_DEV_URL = 'http://localhost:8023/';
        expect(plugin.definitions['process.env.BC_DEV']).toBe('"true"');
        expect(plugin.definitions['process.env.BC_DEV_URL']).toBe('"http://localhost:8023/"');
    });
});
