const path = require('path');
const { defineEnvPlugin } = require('./define-env');

function getMainPreset({ rootDir, env, mode }) {
  return {
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
    resolve: { extensions: ['.js', '.mjs', '.cjs', '.json'] },
    devtool: mode === 'development' ? 'source-map' : false,
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

module.exports = { getMainPreset };
