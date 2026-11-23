const { buildInfoPlugin } = require('./build-info-plugin');
const { userEnvPlugin } = require('./user-env-plugin');
const { createLayout } = require('../../paths');
const { pageOutputFilenames } = require('./renderer-defaults');

/**
 * 生产构建拆分公共代码：主页面与启动页是同一次构建的两个入口，不拆分时两边共用的库（Vue、组件库等）
 * 在两个入口文件里各打一份，更新包里重复约 1 MB。拆分后的文件与两个页面在同一个包的 renderer/ 下，
 * 页面按相对路径加载。项目写了 `optimization.splitChunks` 时与之合并，以项目为准。
 */
const PROD_SPLIT_CHUNKS = { chunks: 'all' };

function getRendererPreset(ctx, pkgJson, buildInfo) {
    const { mode, isDev, env } = ctx;
    const rootDir = process.cwd();
    const layout = createLayout(rootDir);

    return {
        name: 'renderer',
        target: 'web',
        mode,
        entry: { index: layout.src.renderer },
        output: {
            path: layout.out.renderer,
            ...pageOutputFilenames(isDev),
            publicPath: isDev ? '/' : './',
        },
        devtool: isDev ? 'source-map' : false,
        optimization: isDev ? {} : { splitChunks: { ...PROD_SPLIT_CHUNKS } },
        resolve: {
            extensions: ['.js', '.mjs', '.cjs', '.json'],
        },
        plugins: [
            buildInfoPlugin(buildInfo),
            userEnvPlugin(env),
        ],
        stats: 'none',
        infrastructureLogging: { level: 'warn' },
    };
}

module.exports = { getRendererPreset };
