const webpack = require('webpack');

function buildInfoPlugin(buildInfo, { includeEncryptKey = false } = {}) {
    const defs = {};
    const baseObj = {};
    for (const [k, v] of Object.entries(buildInfo)) {
        if (k === 'encryptKey' && !includeEncryptKey) continue;
        defs[`__BC_BUILD__.${k}`] = JSON.stringify(v);
        baseObj[k] = v;
    }
    // 基对象定义：支撑用户 `typeof __BC_BUILD__ !== 'undefined'` 判断
    defs['__BC_BUILD__'] = JSON.stringify(baseObj);
    return new webpack.DefinePlugin(defs);
}

module.exports = { buildInfoPlugin };
