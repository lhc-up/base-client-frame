const path = require('path');

/**
 * 解析项目布局。唯一事实来源，全部是绝对路径；改布局只改这里。
 *
 * 编译产物布局由 frame 固定，业务不得覆盖（`bc-config` 会校验 `output`）：
 * main / pkg / preload / renderer 的相对关系同时被 electron-builder 配置、更新包描述文件
 * 与运行时 preload 定位依赖，分散定义会漂移。
 *
 * @param {string} rootDir 项目根目录
 */
function createLayout(rootDir) {
    const src = path.resolve(rootDir, 'src');
    const out = path.resolve(rootDir, 'app');

    return {
        // 源码入口
        src: {
            main: path.join(src, 'main/index.js'),
            pkg: path.join(src, 'main/pkg.js'),
            preload: path.join(src, 'preload/index.js'),
        },
        // 编译产物（打包后 app.asar 内同构）
        out: {
            root: out,
            main: path.join(out, 'main/index.js'),
            pkg: path.join(out, 'main/pkg.js'),
            preload: path.join(out, 'preload/index.js'),
            renderer: path.join(out, 'renderer'),
        },
    };
}

/**
 * 绝对路径 → 相对 `out.root` 的 POSIX 形式，用于 electron-builder 配置、更新包描述文件与 files 过滤。
 *
 * @param {ReturnType<typeof createLayout>} layout
 * @param {string} absolute
 */
function toOutputRelative(layout, absolute) {
    return path.relative(layout.out.root, absolute).split(path.sep).join('/');
}

/**
 * 运行时：由主进程产物目录推出 preload 路径。
 *
 * 主进程编译产物在 `<out>/main/index.js`，preload 在 `<out>/preload/index.js`；
 * dev 与打包后（app.asar 内）同构，`__dirname` 都是 `<out>/main`。
 *
 * @param {string} mainDir 主进程产物目录（业务侧传 `__dirname`）
 */
function resolvePreload(mainDir) {
    return path.join(mainDir, '..', 'preload/index.js');
}

module.exports = { createLayout, toOutputRelative, resolvePreload };
