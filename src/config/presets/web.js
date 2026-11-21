const path = require('path');
const { buildInfoPlugin } = require('./build-info-plugin');
const { userEnvPlugin } = require('./user-env-plugin');
const { createLayout } = require('../../paths');
const { pageOutputFilenames } = require('./renderer-defaults');

function getWebPreset(ctx, pkgJson, buildInfo) {
    const { mode, isDev, env } = ctx;
    const rootDir = process.cwd();

    return {
        target: 'web',
        mode,
        entry: createLayout(rootDir).src.renderer,
        output: {
            path: path.resolve(rootDir, 'dist'),
            ...pageOutputFilenames(isDev),
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
