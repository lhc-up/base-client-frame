const webpack = require('webpack');
const { buildInfoPlugin } = require('../../../src/config/presets/build-info-plugin');

function parseInjected(plugin) {
    return JSON.parse(plugin.definitions.__BC_BUILD__);
}

describe('config/presets/build-info-plugin', () => {
    test('返回 DefinePlugin 实例', () => {
        const plugin = buildInfoPlugin({ target: 'web', version: '1.0.0' });
        expect(plugin).toBeInstanceOf(webpack.DefinePlugin);
    });

    test('整体注入到 __BC_BUILD__ 单一 key（JSON 字面量）', () => {
        const plugin = buildInfoPlugin({ target: 'web', version: '1.0.0', encrypted: false });
        expect(Object.keys(plugin.definitions)).toEqual(['__BC_BUILD__']);
        const obj = parseInjected(plugin);
        expect(obj).toEqual({ target: 'web', version: '1.0.0', encrypted: false });
    });

    test('默认不包含 encryptKey 字段', () => {
        const plugin = buildInfoPlugin({ target: 'app', encryptKey: 'secret' });
        const obj = parseInjected(plugin);
        expect(obj).not.toHaveProperty('encryptKey');
    });

    test('includeEncryptKey:true 时包含 encryptKey', () => {
        const plugin = buildInfoPlugin({ target: 'app', encryptKey: 'secret' }, { includeEncryptKey: true });
        const obj = parseInjected(plugin);
        expect(obj.encryptKey).toBe('secret');
    });

    test('undefined 字段经 JSON.stringify 后被忽略（应用代码读到 undefined，不会 ReferenceError）', () => {
        const plugin = buildInfoPlugin({ target: 'web', platform: undefined, sign: false });
        const obj = parseInjected(plugin);
        expect(obj).not.toHaveProperty('platform');
        expect(obj.sign).toBe(false);
        // 整体注入后，应用代码 __BC_BUILD__.platform 访问的是注入对象的属性，
        // 缺失字段返回 undefined 而非 ReferenceError
    });
});
