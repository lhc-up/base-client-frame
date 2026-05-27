const path = require('path');
const plugins = require('./plugins.js');
function getMainPreset(root) {
    return {
        mode: process.env.NODE_ENV || 'development',
        target: 'electron-main',
        entry: {
            index: path.resolve(root, 'src/main/index.js')
        },
        output: {
            path: path.resolve(root, 'out/main'),
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

module.exports = getMainPreset;
