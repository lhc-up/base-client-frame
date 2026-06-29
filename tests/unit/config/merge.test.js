const { customMerge, replace } = require('../../../src/config/merge');

describe('config/merge', () => {
    test('标量：用户值覆盖 preset 值', () => {
        const out = customMerge({ appId: 'A' }, { appId: 'B' });
        expect(out.appId).toBe('B');
    });

    test('对象：递归深合并', () => {
        const out = customMerge({ win: { icon: 'a.ico' } }, { win: { target: 'nsis' } });
        expect(out.win).toEqual({ icon: 'a.ico', target: 'nsis' });
    });

    test('数组默认追加', () => {
        const out = customMerge({ files: ['a', 'b'] }, { files: ['c', 'd'] });
        expect(out.files).toEqual(['a', 'b', 'c', 'd']);
    });

    test('replace 标记的数组整组替换', () => {
        const out = customMerge({ files: ['a', 'b'] }, { files: replace(['c']) });
        expect(out.files).toEqual(['c']);
    });

    test('replace 返回值仍是 Array', () => {
        const arr = replace(['x', 'y']);
        expect(Array.isArray(arr)).toBe(true);
        expect(arr).toEqual(['x', 'y']);
    });

    test('preset 缺数组、user 用 replace 也整组生效', () => {
        const out = customMerge({}, { fpm: replace(['--x']) });
        expect(out.fpm).toEqual(['--x']);
    });

    test('user 缺该字段时 preset 透传', () => {
        const out = customMerge({ productName: 'A' }, {});
        expect(out.productName).toBe('A');
    });
});
