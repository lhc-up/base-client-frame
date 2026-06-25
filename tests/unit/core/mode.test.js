const { MODES, deriveMode } = require('../../../src/core/mode');

describe('core/mode', () => {
    test('MODES 是冻结对象，值为 development / production', () => {
        expect(MODES.DEV).toBe('development');
        expect(MODES.PROD).toBe('production');
        expect(Object.isFrozen(MODES)).toBe(true);
    });

    test('deriveMode(development) 返回 isDev=true / isProd=false', () => {
        expect(deriveMode(MODES.DEV)).toEqual({ isDev: true, isProd: false });
    });

    test('deriveMode(production) 返回 isDev=false / isProd=true', () => {
        expect(deriveMode(MODES.PROD)).toEqual({ isDev: false, isProd: true });
    });

    test('deriveMode 收到非法值 fail-fast 抛错', () => {
        expect(() => deriveMode('staging')).toThrow(/mode 必须是/);
        expect(() => deriveMode(undefined)).toThrow(/mode 必须是/);
    });
});
