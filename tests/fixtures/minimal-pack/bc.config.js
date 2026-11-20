const HtmlWebpackPlugin = require('html-webpack-plugin');

// 启动页（src/renderer/update/）由 frame 按规范加入
module.exports = (ctx) => ({
    main: {},
    preload: {},
    renderer: {
        plugins: [new HtmlWebpackPlugin({ template: 'src/renderer/index.html', filename: 'index.html', chunks: ['index'] })],
    },
    encrypt: false,
    bytenode: false,
});
