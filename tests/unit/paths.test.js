const path = require('path');
const { createLayout, toOutputRelative, resolvePreload } = require('../../src/paths');

describe('paths', () => {
    const root = path.resolve('/proj');

    test('createLayout：源码与产物按同名产物分组，全部是绝对路径', () => {
        const layout = createLayout(root);
        expect(layout.src).toEqual({
            main: path.join(root, 'src/main/index.js'),
            pkg: path.join(root, 'src/main/pkg.js'),
            preload: path.join(root, 'src/preload/index.js'),
        });
        expect(layout.out).toEqual({
            root: path.join(root, 'app'),
            main: path.join(root, 'app/main/index.js'),
            pkg: path.join(root, 'app/main/pkg.js'),
            preload: path.join(root, 'app/preload/index.js'),
            renderer: path.join(root, 'app/renderer'),
        });
    });

    test('toOutputRelative：统一 POSIX 分隔符', () => {
        const layout = createLayout(root);
        expect(toOutputRelative(layout, layout.out.main)).toBe('main/index.js');
        expect(toOutputRelative(layout, layout.out.pkg)).toBe('main/pkg.js');
        expect(toOutputRelative(layout, layout.out.preload)).toBe('preload/index.js');
        expect(toOutputRelative(layout, layout.out.renderer)).toBe('renderer');
    });

    test('resolvePreload：由主进程产物目录推出 preload 路径', () => {
        const layout = createLayout(root);
        expect(resolvePreload(path.dirname(layout.out.main))).toBe(layout.out.preload);
    });
});
