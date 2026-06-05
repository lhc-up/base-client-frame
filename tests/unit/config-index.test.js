describe('M2 config 模块 API 表面', () => {
    test('导出 loadUserConfig 与 resolveBuildConfig', () => {
        const mod = require('../../src/config');
        expect(typeof mod.loadUserConfig).toBe('function');
        expect(typeof mod.resolveBuildConfig).toBe('function');
    });
});
