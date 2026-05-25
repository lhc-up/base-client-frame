const path = require('path');
function getPreloadPreset(root) {
    return {
        mode: process.env.NODE_ENV || 'development',
        target: 'electron-preload',
        entry: path.resolve(root, 'src/preload/index.js'),
        output: {
            path: path.resolve(process.cwd(), 'out/preload'),
            filename: 'index.js'
        },
        // externals: {
        //     electron: 'commonjs electron'
        // },
        module: {
            rules: []
        },
        resolve: {
            extensions: ['.js', '.json']
        }
    };
}

module.exports = getPreloadPreset;