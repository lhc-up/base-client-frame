const { customMerge, replace } = require('../../src/config/pack');

describe('replace', () => {
    test('返回值仍是数组', () => {
        const tagged = replace(['a', 'b']);
        expect(Array.isArray(tagged)).toBe(true);
        expect([...tagged]).toEqual(['a', 'b']);
    });

    test('对原数组无影响（浅拷贝）', () => {
        const src = ['a', 'b'];
        const tagged = replace(src);
        expect(tagged).not.toBe(src);
        expect(src).toEqual(['a', 'b']);
    });
});

describe('customMerge 默认行为', () => {
    test('标量：user 覆盖 preset', () => {
        const r = customMerge({ appId: 'p', productName: 'P' }, { appId: 'user' });
        expect(r).toEqual({ appId: 'user', productName: 'P' });
    });

    test('对象：深合并', () => {
        const r = customMerge(
            { win: { icon: 'a.ico', requestedExecutionLevel: 'asInvoker' } },
            { win: { icon: 'b.ico' } }
        );
        expect(r.win).toEqual({ icon: 'b.ico', requestedExecutionLevel: 'asInvoker' });
    });

    test('数组：默认追加（preset + user）', () => {
        const r = customMerge(
            { extraResources: [{ from: 'a', to: 'a' }] },
            { extraResources: [{ from: 'b', to: 'b' }] }
        );
        expect(r.extraResources).toEqual([
            { from: 'a', to: 'a' },
            { from: 'b', to: 'b' },
        ]);
    });
});

describe('customMerge + replace 整组替换', () => {
    test('user 用 replace 标记 → 替换预设的数组（不追加）', () => {
        const r = customMerge(
            { files: ['preset/a', 'preset/b'] },
            { files: replace(['user/x', '!**/node_modules/**']) }
        );
        expect(r.files).toEqual(['user/x', '!**/node_modules/**']);
    });

    test('REPLACE 标记不出现在最终输出对象上（不泄漏给 electron-builder）', () => {
        const r = customMerge(
            { files: ['preset/a'] },
            { files: replace(['user/x']) }
        );
        const REPLACE = Object.getOwnPropertySymbols(r.files).find(
            (s) => s.toString().includes('replace')
        );
        expect(REPLACE).toBeUndefined();
    });

    test('user 未用 replace → 走默认追加路径，行为不变', () => {
        const r = customMerge(
            { files: ['preset/a'] },
            { files: ['user/x'] }
        );
        expect(r.files).toEqual(['preset/a', 'user/x']);
    });
});
