const HtmlWebpackPlugin = require('html-webpack-plugin');
module.exports = (ctx) => ({
    main: {},
    preload: {},
    renderer: {
        entry: {
            renderer: './src/renderer/index.js',
            update: './src/update/index.js',
        },
        plugins: [
            new HtmlWebpackPlugin({ template: 'src/renderer/index.html', filename: 'renderer/index.html', chunks: ['renderer'] }),
            new HtmlWebpackPlugin({ template: 'src/renderer/index.html', filename: 'update/index.html', chunks: ['update'] }),
        ],
    },
    encrypt: true,
    bytenode: true,
    incremental: true,
});
