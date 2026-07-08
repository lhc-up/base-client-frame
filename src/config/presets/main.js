const path = require('path');
const { buildInfoPlugin } = require('./build-info-plugin');
const { userEnvPlugin } = require('./user-env-plugin');

function getMainPreset(ctx, pkgJson, buildInfo) {
    const { mode, isDev, env } = ctx;
    const rootDir = process.cwd();

    return {
        name: 'main',
        target: 'electron-main',
        mode,
        entry: path.resolve(rootDir, 'src/main/index.js'),
        output: {
            path: path.resolve(rootDir, 'app/main'),
            filename: 'index.js',
            libraryTarget: 'commonjs2',
        },
        externals: { electron: 'commonjs electron' },
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

module.exports = { getMainPreset };
