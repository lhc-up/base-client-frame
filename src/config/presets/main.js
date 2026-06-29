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
            assetModuleFilename: 'assets/[name].[hash:8][ext][query]',
        },
        externals: { electron: 'commonjs electron' },
        devtool: isDev ? 'source-map' : false,
        resolve: {
            extensions: ['.js', '.mjs', '.cjs', '.json'],
        },
        module: {
            rules: [
                { test: /\.(png|jpe?g|gif|svg|webp|avif)$/i,   type: 'asset/resource' },
                { test: /\.(woff2?|eot|ttf|otf)$/i,            type: 'asset/resource' },
                { test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i, type: 'asset/resource' },
            ],
        },
        plugins: [
            buildInfoPlugin(buildInfo, { includeEncryptKey: true }),
            userEnvPlugin(env),
        ],
    };
}

module.exports = { getMainPreset };
