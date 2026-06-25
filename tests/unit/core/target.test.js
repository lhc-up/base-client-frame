const { TARGETS, deriveTarget } = require('../../../src/core/target');

describe('core/target', () => {
    test('TARGETS 是冻结对象，值为 app / web', () => {
        expect(TARGETS.APP).toBe('app');
        expect(TARGETS.WEB).toBe('web');
        expect(Object.isFrozen(TARGETS)).toBe(true);
    });

    test('deriveTarget(app) 返回 isApp=true / isWeb=false', () => {
        expect(deriveTarget(TARGETS.APP)).toEqual({ isApp: true, isWeb: false });
    });

    test('deriveTarget(web) 返回 isApp=false / isWeb=true', () => {
        expect(deriveTarget(TARGETS.WEB)).toEqual({ isApp: false, isWeb: true });
    });

    test('deriveTarget 收到非法值 fail-fast 抛错', () => {
        expect(() => deriveTarget('mobile')).toThrow(/target 必须是/);
        expect(() => deriveTarget(null)).toThrow(/target 必须是/);
    });
});
