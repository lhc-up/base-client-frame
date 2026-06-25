const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (ctx) => ({
    web: {
        plugins: [
            new HtmlWebpackPlugin({
                template: 'src/renderer/index.html',
                inject: 'body',
            }),
        ],
        devServer: { port: 19099 },
    },
});
