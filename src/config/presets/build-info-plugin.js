const webpack = require('webpack');

function buildInfoPlugin(buildInfo, { includeEncryptKey = false } = {}) {
    const obj = { ...buildInfo };
    if (!includeEncryptKey) delete obj.encryptKey;
    return new webpack.DefinePlugin({
        __BC_BUILD__: JSON.stringify(obj),
    });
}

module.exports = { buildInfoPlugin };
