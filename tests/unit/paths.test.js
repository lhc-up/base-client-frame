const path = require('path');
const { DESCRIPTOR_FILE, createLayout, resolveLayout, toOutputRelative } = require('../../src/paths');

describe('paths', () => {
    const root = path.resolve('/proj');
    const out = path.join(root, 'app');
    const expectedOut = {
        root: out,
        main: path.join(out, 'main/index.js'),
        pkg: path.join(out, 'main/pkg.js'),
        preload: path.join(out, 'preload/index.js'),
        renderer: path.join(out, 'renderer'),
        rendererPage: path.join(out, 'renderer/index.html'),
        updatePage: path.join(out, 'renderer/update.html'),
    };

    test('createLayout：源码入口与编译产物，全部是绝对路径', () => {
        const layout = createLayout(root);
        expect(layout.src).toEqual({
            main: path.join(root, 'src/main/index.js'),
            pkg: path.join(root, 'src/main/pkg.js'),
            preload: path.join(root, 'src/preload/index.js'),
            renderer: path.join(root, 'src/renderer/index.js'),
            update: path.join(root, 'src/renderer/update/index.js'),
            updateTemplate: path.join(root, 'src/renderer/update/index.ejs'),
        });
        expect(layout.out).toEqual(expectedOut);
    });

    test('toOutputRelative：统一 POSIX 分隔符', () => {
        const layout = createLayout(root);
        expect(toOutputRelative(layout, layout.out.main)).toBe('main/index.js');
        expect(toOutputRelative(layout, layout.out.pkg)).toBe('main/pkg.js');
        expect(toOutputRelative(layout, layout.out.preload)).toBe('preload/index.js');
        expect(toOutputRelative(layout, layout.out.renderer)).toBe('renderer');
        expect(toOutputRelative(layout, layout.out.rendererPage)).toBe('renderer/index.html');
        expect(toOutputRelative(layout, layout.out.updatePage)).toBe('renderer/update.html');
    });

    test('resolveLayout：由主进程产物目录推出产物布局，与构建期一致', () => {
        const layout = createLayout(root);
        expect(resolveLayout(path.dirname(layout.out.main))).toEqual(expectedOut);
    });

    test('DESCRIPTOR_FILE：包描述文件名', () => {
        expect(DESCRIPTOR_FILE).toBe('package.json');
    });
});
