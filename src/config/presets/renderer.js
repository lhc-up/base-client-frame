const path = require('path');
function getRendererPreset(root) {
    return {
        mode: process.env.NODE_ENV || 'development',
        target: 'web',
        entry: path.resolve(root, 'src/renderer/index.js'),
        output: {
            path: path.resolve(root, 'out/renderer'),
            filename: 'index.js'
        },
        devServer: {
            port: 9000,
            hot: true
        },
        module: {
            rules: []
        },
        resolve: {
            extensions: ['.js', '.json', '.vue'],
            alias: {
                // '@': path.resolve(root, userSrcDir, 'renderer')
            }
        }
    };
}

module.exports = getRendererPreset;
