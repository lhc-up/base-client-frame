const path = require('path');
const { buildInfoPlugin } = require('./build-info-plugin');
const { userEnvPlugin } = require('./user-env-plugin');

function getWebPreset(ctx, pkgJson, buildInfo) {
    const { mode, isDev, env } = ctx;
    const rootDir = process.cwd();

    return {
        target: 'web',
        mode,
        entry: path.resolve(rootDir, 'src/renderer/index.js'),
        output: {
            path: path.resolve(rootDir, 'dist'),
            filename: 'index.js',
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

module.exports = { getWebPreset };
