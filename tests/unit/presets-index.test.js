describe('presets/index 汇出', () => {
    test('四个 API 都是 function', () => {
        const mod = require('../../src/config/presets');
        expect(typeof mod.getMainPreset).toBe('function');
        expect(typeof mod.getPreloadPreset).toBe('function');
        expect(typeof mod.getRendererPreset).toBe('function');
        expect(typeof mod.defineEnvPlugin).toBe('function');
    });

    test('三 getter 入参一致 { rootDir, env, mode }、出参均为对象', () => {
        const { getMainPreset, getPreloadPreset, getRendererPreset } =
            require('../../src/config/presets');
        const args = { rootDir: '/tmp/proj', env: { BC_X: '1' }, mode: 'production' };
        for (const get of [getMainPreset, getPreloadPreset, getRendererPreset]) {
            expect(typeof get(args)).toBe('object');
        }
    });
});
