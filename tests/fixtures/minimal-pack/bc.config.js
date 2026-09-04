const HtmlWebpackPlugin = require('html-webpack-plugin');
module.exports = (ctx) => ({
    main: {},
    preload: {},
    renderer: [
        {
            name: 'update',
            entry: () => ({ update: './src/update/index.js' }),
            output: { path: require('path').resolve(__dirname, 'app/update') },
        },
        {
            plugins: [new HtmlWebpackPlugin({ template: 'src/renderer/index.html', filename: 'renderer/index.html', chunks: ['renderer'] })],
        },
    ],
    encrypt: false,
    bytenode: false,
    incremental: false,
});
