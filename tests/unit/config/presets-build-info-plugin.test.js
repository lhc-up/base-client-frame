const webpack = require('webpack');
const { buildInfoPlugin } = require('../../../src/config/presets/build-info-plugin');

describe('config/presets/build-info-plugin', () => {
    test('返回 DefinePlugin 实例', () => {
        const plugin = buildInfoPlugin({ target: 'web', version: '1.0.0' });
        expect(plugin).toBeInstanceOf(webpack.DefinePlugin);
    });

    test('注入字段以 __BC_BUILD__.<key> 为 key，值为 JSON 字面量', () => {
        const plugin = buildInfoPlugin({ target: 'web', version: '1.0.0', encrypted: false });
        const defs = plugin.definitions;
        expect(defs['__BC_BUILD__.target']).toBe('"web"');
        expect(defs['__BC_BUILD__.version']).toBe('"1.0.0"');
        expect(defs['__BC_BUILD__.encrypted']).toBe('false');
    });

    test('默认不注入 encryptKey 字段', () => {
        const plugin = buildInfoPlugin({ target: 'app', encryptKey: 'secret' });
        expect(plugin.definitions['__BC_BUILD__.encryptKey']).toBeUndefined();
    });

    test('includeEncryptKey:true 时注入 encryptKey', () => {
        const plugin = buildInfoPlugin({ target: 'app', encryptKey: 'secret' }, { includeEncryptKey: true });
        expect(plugin.definitions['__BC_BUILD__.encryptKey']).toBe('"secret"');
    });

    test('undefined 字段被跳过', () => {
        const plugin = buildInfoPlugin({ target: 'web', platform: undefined });
        expect(plugin.definitions['__BC_BUILD__.platform']).toBeUndefined();
    });
});
