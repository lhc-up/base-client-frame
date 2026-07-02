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
            assetModuleFilename: 'assets/[name].[hash:8][ext][query]',
        },
        devtool: isDev ? 'source-map' : false,
        resolve: {
            extensions: ['.js', '.mjs', '.cjs', '.json'],
        },
        module: {
            rules: [
                { test: /\.(png|jpe?g|gif|svg|webp|avif|ico|hdr)$/i,   type: 'asset/resource' },
                { test: /\.(woff2?|eot|ttf|otf)$/i,            type: 'asset/resource' },
                { test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i, type: 'asset/resource' },
            ],
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
