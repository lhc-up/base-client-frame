const path = require('path');
const { deriveMode } = require('../../mode');
const { defineEnvPlugin } = require('./define-env');

function getPreloadPreset({ rootDir, env, mode }) {
    const { isDev } = deriveMode(mode);
    return {
        target: 'electron-preload',
        mode,
        entry: path.resolve(rootDir, 'src/preload/index.js'),
        output: {
            path: path.resolve(rootDir, 'app/preload'),
            filename: 'index.js',
            // libraryTarget: 'commonjs2',
            assetModuleFilename: 'assets/[name].[hash:8][ext][query]',
        },
        externals: { electron: 'commonjs electron' },
        resolve: { extensions: ['.js', '.mjs', '.cjs', '.json'] },
        devtool: isDev ? 'source-map' : false,
        module: {
            rules: [
                { test: /\.(png|jpe?g|gif|svg|webp|avif)$/i, type: 'asset/resource' },
                { test: /\.(woff2?|eot|ttf|otf)$/i, type: 'asset/resource' },
                { test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i, type: 'asset/resource' },
            ],
        },
        plugins: [defineEnvPlugin(env)],
    };
}

module.exports = { getPreloadPreset };
