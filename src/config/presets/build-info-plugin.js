const webpack = require('webpack');

function buildInfoPlugin(buildInfo, { includeEncryptKey = false } = {}) {
    const defs = {};
    for (const [k, v] of Object.entries(buildInfo)) {
        if (k === 'encryptKey' && !includeEncryptKey) continue;
        defs[`__BC_BUILD__.${k}`] = JSON.stringify(v);
    }
    return new webpack.DefinePlugin(defs);
}

module.exports = { buildInfoPlugin };
