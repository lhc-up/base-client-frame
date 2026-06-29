const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (ctx) => ({
    main: {},
    preload: {},
    renderer: {
        plugins: [
            new HtmlWebpackPlugin({
                template: 'src/renderer/index.html',
                filename: 'renderer/index.html',
                chunks: ['renderer'],
            }),
        ],
        devServer: { port: 19023 },
    },
});
