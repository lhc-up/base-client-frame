const { MODES, deriveMode } = require('../../src/mode');

describe('MODES 常量', () => {
    test('DEV / PROD 是 development / production 字面量', () => {
        expect(MODES.DEV).toBe('development');
        expect(MODES.PROD).toBe('production');
    });

    test('被 Object.freeze 锁定，赋值/新增都不生效', () => {
        expect(Object.isFrozen(MODES)).toBe(true);
        try { MODES.DEV = 'x'; } catch (_) { /* 严格模式下抛错，非严格静默 */ }
        try { MODES.STAGING = 'staging'; } catch (_) { /* 同上 */ }
        expect(MODES.DEV).toBe('development');
        expect(MODES.STAGING).toBeUndefined();
    });
});

describe('deriveMode', () => {
    test('mode=development → { isDev: true, isProd: false }', () => {
        expect(deriveMode('development')).toEqual({ isDev: true, isProd: false });
    });

    test('mode=production → { isDev: false, isProd: true }', () => {
        expect(deriveMode('production')).toEqual({ isDev: false, isProd: true });
    });

    test('mode=MODES.DEV / MODES.PROD 与字面量一致', () => {
        expect(deriveMode(MODES.DEV)).toEqual({ isDev: true, isProd: false });
        expect(deriveMode(MODES.PROD)).toEqual({ isDev: false, isProd: true });
    });

    test.each([
        undefined,
        null,
        '',
        'dev',
        'prod',
        'staging',
        'Production',
        0,
        {},
    ])('非法 mode (%p) → 抛错', (bad) => {
        expect(() => deriveMode(bad)).toThrow(/mode 必须是/);
    });

    test('抛错信息包含两个合法取值，便于调试', () => {
        try {
            deriveMode('dev');
            throw new Error('未抛错');
        } catch (e) {
            expect(e.message).toMatch(/development/);
            expect(e.message).toMatch(/production/);
            expect(e.message).toMatch(/"dev"/);
        }
    });

    test('返回的对象互斥（isDev 与 isProd 不会同时为 true）', () => {
        const dev = deriveMode('development');
        const prod = deriveMode('production');
        expect(dev.isDev && dev.isProd).toBe(false);
        expect(prod.isDev && prod.isProd).toBe(false);
    });
});
