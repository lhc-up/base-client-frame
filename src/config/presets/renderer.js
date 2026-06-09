const path = require('path');
const { deriveMode } = require('../../mode');
const { defineEnvPlugin } = require('./define-env');

function getRendererPreset({ rootDir, env, mode }) {
    const { isDev, isProd } = deriveMode(mode);
    return {
        target: 'web',
        mode,
        entry: path.resolve(rootDir, 'src/renderer/index.js'),
        output: {
            path: path.resolve(rootDir, 'app/renderer'),
            filename: 'index.js',
            publicPath: isProd ? './' : '/',
            assetModuleFilename: 'assets/[name].[hash:8][ext][query]',
        },
        resolve: { extensions: ['.js', '.mjs', '.cjs', '.json'] },
        devtool: isDev ? 'source-map' : false,
        stats: 'none',
        infrastructureLogging: { level: 'warn' },
        module: {
            rules: [
                { test: /\.(png|jpe?g|gif|svg|webp|avif)$/i, type: 'asset/resource' },
                { test: /\.(woff2?|eot|ttf|otf)$/i, type: 'asset/resource' },
                { test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i, type: 'asset/resource' },
            ],
        },
        plugins: [
            defineEnvPlugin(env),
        ],
    };
}

module.exports = { getRendererPreset };
