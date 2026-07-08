const path = require('path');
const { buildInfoPlugin } = require('./build-info-plugin');
const { userEnvPlugin } = require('./user-env-plugin');

function getPreloadPreset(ctx, pkgJson, buildInfo) {
    const { mode, isDev, env } = ctx;
    const rootDir = process.cwd();

    return {
        name: 'preload',
        target: 'electron-preload',
        mode,
        entry: path.resolve(rootDir, 'src/preload/index.js'),
        output: {
            path: path.resolve(rootDir, 'app/preload'),
            filename: 'index.js',
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
