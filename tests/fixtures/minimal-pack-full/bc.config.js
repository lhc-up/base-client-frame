const HtmlWebpackPlugin = require('html-webpack-plugin');

// 启动页（src/renderer/update/）由 frame 按规范加入
module.exports = (ctx) => ({
    main: {},
    preload: {},
    renderer: {
        plugins: [
            new HtmlWebpackPlugin({ template: 'src/renderer/index.html', filename: 'index.html', chunks: ['index'] }),
        ],
    },
    // 产物加密暂不支持（运行时没有解密），不写 encrypt 即不加密
    bytenode: true,
});
