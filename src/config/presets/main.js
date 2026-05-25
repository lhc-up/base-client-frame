const path = require('path');
function getMainPreset(root) {
    return {
        mode: process.env.NODE_ENV || 'development',
        target: 'electron-main',
        entry: {
            main: path.resolve(root, 'src/main/index.js'),
        },
        output: {
            path: path.resolve(root, 'out/main'),
            libraryTarget: 'commonjs2',
            filename: 'index.js'
        },
        node: {
            // fs: 'empty',
            // __dirname: false
        },
        // externals: {
        //     electron: 'commonjs electron'
        // },
        module: {
            rules: []
        },
        resolve: {
            extensions: ['.js', '.mjs', '.cjs', '.json'],
        }
    }
}

module.exports = getMainPreset;
