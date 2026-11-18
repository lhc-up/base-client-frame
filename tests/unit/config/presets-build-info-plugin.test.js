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
            '__BC_BUILD__': '{"target":"web","version":"1.0.0","encrypted":false}',
            '__BC_BUILD__.target': '"web"',
            '__BC_BUILD__.version': '"1.0.0"',
            '__BC_BUILD__.encrypted': 'false',
        });
    });

    test('构造之后写入 buildInfo 的字段也会生效（devUrl 在构建配置求值之后写入）', () => {
        const buildInfo = { target: 'app', dev: true, devUrl: undefined };
        const plugin = buildInfoPlugin(buildInfo);
        buildInfo.devUrl = 'http://localhost:8023/';
        expect(plugin.definitions['__BC_BUILD__.dev']).toBe('true');
        expect(plugin.definitions['__BC_BUILD__.devUrl']).toBe('"http://localhost:8023/"');
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

    test('同时定义基对象 __BC_BUILD__（支撑 typeof 判断）', () => {
        const plugin = buildInfoPlugin({ target: 'web', version: '1.0.0', encrypted: false });
        expect(plugin.definitions).toHaveProperty('__BC_BUILD__');
        // 基对象定义是完整 buildInfo 的 JSON.stringify
        const base = JSON.parse(plugin.definitions['__BC_BUILD__']);
        expect(base).toEqual({ target: 'web', version: '1.0.0', encrypted: false });
    });

    test('基对象定义默认剔除 encryptKey', () => {
        const plugin = buildInfoPlugin({ target: 'app', version: '1.0.0', encryptKey: 'secret' });
        const base = JSON.parse(plugin.definitions['__BC_BUILD__']);
        expect(base).not.toHaveProperty('encryptKey');
    });

    test('includeEncryptKey:true 时基对象也含 encryptKey', () => {
        const plugin = buildInfoPlugin(
            { target: 'app', version: '1.0.0', encryptKey: 'secret' },
            { includeEncryptKey: true },
        );
        const base = JSON.parse(plugin.definitions['__BC_BUILD__']);
        expect(base.encryptKey).toBe('secret');
    });
});
