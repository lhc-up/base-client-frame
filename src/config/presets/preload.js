const path = require('path');
const { buildInfoPlugin } = require('./build-info-plugin');
const { userEnvPlugin } = require('./user-env-plugin');
const { createLayout } = require('../../paths');

function getPreloadPreset(ctx, pkgJson, buildInfo) {
    const { mode, isDev, env } = ctx;
    const rootDir = process.cwd();
    const layout = createLayout(rootDir);

    return {
        name: 'preload',
        target: 'electron-preload',
        mode,
        entry: { index: layout.src.preload },
        output: {
            path: path.dirname(layout.out.preload),
            filename: '[name].js',
        },
        externals: { electron: 'commonjs electron' },
        devtool: isDev ? 'source-map' : false,
        resolve: {
            extensions: ['.js', '.mjs', '.cjs', '.json'],
        },
        plugins: [
            buildInfoPlugin(buildInfo),
            userEnvPlugin(env),
        ],
    };
}

module.exports = { getPreloadPreset };
