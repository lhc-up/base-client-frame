const path = require('path');
const fse = require('fs-extra');
const { buildInfoPlugin } = require('./build-info-plugin');
const { userEnvPlugin } = require('./user-env-plugin');
const { createLayout } = require('../../paths');

/**
 * 校验项目提供了包主进程入口。
 *
 * @param {string} [rootDir]
 * @throws {Error} 缺少 `src/main/pkg.js`
 */
function assertPkgEntry(rootDir = process.cwd()) {
    const { src } = createLayout(rootDir);
    if (!fse.existsSync(src.pkg)) {
        const rel = path.relative(rootDir, src.pkg).split(path.sep).join('/');
        throw new Error(`[base-client] 未找到 ${rel}：客户端由宿主与包组成，包主进程入口必需`);
    }
}

/**
 * 主进程预设：一次编译、两个入口。
 *
 * - `index`：宿主主进程 `src/main/index.js` → `app/main/index.js`
 * - `pkg`：包主进程 `src/main/pkg.js` → `app/main/pkg.js`
 *
 * `pack --pkg-only` 只保留 `pkg` 入口。两个入口共用同一组构建常量（`__BC_BUILD__`）：
 * 包会随更新包分发，包代码不得引用 `__BC_BUILD__.encryptKey` 或整体引用 `__BC_BUILD__`。
 */
function getMainPreset(ctx, pkgJson, buildInfo) {
    const { mode, isDev, env, cliOptions = {} } = ctx;
    const rootDir = process.cwd();
    const layout = createLayout(rootDir);
    const pkgEntry = layout.src.pkg;
    const entry = cliOptions.pkgOnly
        ? { pkg: pkgEntry }
        : { index: layout.src.main, pkg: pkgEntry };

    return {
        name: 'main',
        target: 'electron-main',
        mode,
        entry,
        output: {
            path: path.dirname(layout.out.main),
            filename: '[name].js',
            libraryTarget: 'commonjs2',
        },
        // 数组形式：业务追加的 externals（对象或函数）按合并规则与之拼接，不会覆盖 electron
        externals: [{ electron: 'commonjs electron' }],
        devtool: isDev ? 'source-map' : false,
        resolve: {
            extensions: ['.js', '.mjs', '.cjs', '.json'],
        },
        plugins: [
            buildInfoPlugin(buildInfo, { includeEncryptKey: true }),
            userEnvPlugin(env),
        ],
    };
}

module.exports = { getMainPreset, assertPkgEntry };
