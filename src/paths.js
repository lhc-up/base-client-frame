const path = require('path');

/**
 * 项目布局。唯一事实来源：源码入口、编译产物、包内入口的位置只在这里定义，改布局只改这里。
 *
 * 编译产物布局由 frame 固定，业务不得覆盖（`bc-config` 会校验 `output`）：
 * 它同时被 webpack 配置、electron-builder 配置、包描述文件与运行时依赖，分散定义会漂移。
 */

/** 包描述文件名：包根目录下（以及本地调试时 dev server 根地址下）的描述文件 */
const DESCRIPTOR_FILE = 'package.json';

/**
 * 编译产物（以产物根目录为基准）。dev 与打包后（app.asar 内）同构。
 *
 * @param {string} out 产物根目录
 */
function outputLayout(out) {
    return {
        root: out,
        // 宿主主进程
        main: path.join(out, 'main/index.js'),
        // 包主进程
        pkg: path.join(out, 'main/pkg.js'),
        preload: path.join(out, 'preload/index.js'),
        // 页面产物目录（整体进入包）
        renderer: path.join(out, 'renderer'),
        // 主页面
        rendererPage: path.join(out, 'renderer/index.html'),
        // 启动页
        updatePage: path.join(out, 'renderer/update.html'),
    };
}

/**
 * 构建期：解析项目布局，全部是绝对路径。
 *
 * @param {string} rootDir 项目根目录
 */
function createLayout(rootDir) {
    const src = path.resolve(rootDir, 'src');

    return {
        // 源码入口
        src: {
            main: path.join(src, 'main/index.js'),
            pkg: path.join(src, 'main/pkg.js'),
            preload: path.join(src, 'preload/index.js'),
            renderer: path.join(src, 'renderer/index.js'),
            // 启动页（可选：没有该文件就不构建启动页）
            update: path.join(src, 'renderer/update/index.js'),
            updateTemplate: path.join(src, 'renderer/update/index.ejs'),
        },
        // 编译产物（打包后 app.asar 内同构）
        out: outputLayout(path.resolve(rootDir, 'app')),
    };
}

/**
 * 运行期：由主进程产物所在目录（业务侧传 `__dirname`）解析产物布局。
 *
 * @param {string} mainDir 主进程产物目录
 */
function resolveLayout(mainDir) {
    // 主进程产物相对产物根目录的所在目录（如 main），据此从 mainDir 回到产物根目录
    const mainDirInOut = path.dirname(outputLayout('').main);
    const out = path.resolve(mainDir, path.relative(mainDirInOut, ''));
    return outputLayout(out);
}

/**
 * 绝对路径 → 相对产物根目录的 POSIX 形式，用于 electron-builder 配置、包描述文件与 files 过滤。
 *
 * @param {ReturnType<typeof createLayout>} layout
 * @param {string} absolute
 */
function toOutputRelative(layout, absolute) {
    return path.relative(layout.out.root, absolute).split(path.sep).join('/');
}

module.exports = { DESCRIPTOR_FILE, createLayout, resolveLayout, toOutputRelative };
