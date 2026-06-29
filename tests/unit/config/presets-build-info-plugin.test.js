const webpack = require('webpack');
const { buildInfoPlugin } = require('../../../src/config/presets/build-info-plugin');

describe('config/presets/build-info-plugin', () => {
    test('返回 DefinePlugin 实例', () => {
        const plugin = buildInfoPlugin({ target: 'web', version: '1.0.0' });
        expect(plugin).toBeInstanceOf(webpack.DefinePlugin);
    });

    test('逐字段注入 __BC_BUILD__.<k>（每个值单独 JSON.stringify）', () => {
        const plugin = buildInfoPlugin({ target: 'web', version: '1.0.0', encrypted: false });
        expect(plugin.definitions).toEqual({
            '__BC_BUILD__.target': '"web"',
            '__BC_BUILD__.version': '"1.0.0"',
            '__BC_BUILD__.encrypted': 'false',
        });
    });

    test('默认不包含 encryptKey 字段', () => {
        const plugin = buildInfoPlugin({ target: 'app', encryptKey: 'secret' });
        expect(plugin.definitions).not.toHaveProperty('__BC_BUILD__.encryptKey');
    });

    test('includeEncryptKey:true 时包含 encryptKey', () => {
        const plugin = buildInfoPlugin({ target: 'app', encryptKey: 'secret' }, { includeEncryptKey: true });
        expect(plugin.definitions['__BC_BUILD__.encryptKey']).toBe('"secret"');
    });

    test('undefined 字段被序列化为 undefined 字面量（webpack 字面替换后，应用代码读到 undefined）', () => {
        const plugin = buildInfoPlugin({ target: 'web', platform: undefined, sign: false });
        // JSON.stringify(undefined) 返回 undefined（JS 值），webpack DefinePlugin 将其字面替换
        expect(plugin.definitions['__BC_BUILD__.platform']).toBeUndefined();
        expect(plugin.definitions['__BC_BUILD__.sign']).toBe('false');
    });
});
