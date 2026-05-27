const webpack = require('webpack');
const dotenv = require('dotenv');
const env = dotenv.config().parsed;
module.exports = [
    new webpack.DefinePlugin({
        // dotenv以及cross-env中的变量，全部通过webpack定义，提供给业务
        'process.env': JSON.stringify({
            ...env,
            CHILD: process.env.CHILD,
            WIN_CODE_SIGN: process.env.WIN_CODE_SIGN,
            PLATFORM: process.env.PLATFORM,
            ARCH: process.env.ARCH,
            UNPACK: process.env.UNPACK,
            CORE_PKG: process.env.CORE_PKG,
        }),
    })
];