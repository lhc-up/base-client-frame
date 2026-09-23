const HtmlWebpackPlugin = require('html-webpack-plugin');
module.exports = (ctx) => ({
    main: {},
    preload: {},
    renderer: {
        entry: {
            update: './src/update/index.js',
        },
        plugins: [
            new HtmlWebpackPlugin({ template: 'src/renderer/index.html', filename: 'index.html', chunks: ['index'] }),
            new HtmlWebpackPlugin({ template: 'src/renderer/index.html', filename: 'update.html', chunks: ['update'] }),
        ],
    },
    encrypt: { key: '0123456789abcdef0123456789abcdef', iv: 'fedcba9876543210' },
    bytenode: true,
    incremental: true,
});
