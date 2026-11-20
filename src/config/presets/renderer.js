const { buildInfoPlugin } = require('./build-info-plugin');
const { userEnvPlugin } = require('./user-env-plugin');
const { createLayout } = require('../../paths');

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
            filename: '[name].js',
            publicPath: isDev ? '/' : './',
        },
        devtool: isDev ? 'source-map' : false,
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
