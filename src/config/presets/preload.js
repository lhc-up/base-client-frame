const path = require('path');
const plugins = require('./plugins.js');
function getPreloadPreset(root) {
    return {
        mode: process.env.NODE_ENV || 'development',
        target: 'electron-preload',
        entry: {
            index: path.resolve(root, 'src/preload/index.js')
        },
        output: {
            path: path.resolve(root, 'out/preload'),
            libraryTarget: 'commonjs2',
            filename: 'index.js'
        },
        externals: {
            electron: 'commonjs electron'
        },
        resolve: {
            extensions: ['.js', '.mjs', '.cjs', '.json']
        },
        plugins: [...plugins]
    };
}

module.exports = getPreloadPreset;
