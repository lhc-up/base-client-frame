const webpack = require('webpack');

function toDefinitions(buildInfo, includeEncryptKey) {
    const defs = {};
    const baseObj = {};
    for (const [k, v] of Object.entries(buildInfo)) {
        if (k === 'encryptKey' && !includeEncryptKey) continue;
        defs[`__BC_BUILD__.${k}`] = JSON.stringify(v);
        baseObj[k] = v;
    }
    // 基对象定义：支撑用户 `typeof __BC_BUILD__ !== 'undefined'` 判断
    defs['__BC_BUILD__'] = JSON.stringify(baseObj);
    return defs;
}

/**
 * 逐字段替换 `__BC_BUILD__.<字段>`。
 *
 * definitions 在 webpack 应用插件时才从 buildInfo 计算：`devUrl` 依赖 dev server 端口（可能来自 bc.config.js），
 * 在构建配置求值之后才由 dev 命令写入 buildInfo。
 */
class BuildInfoPlugin extends webpack.DefinePlugin {
    constructor(buildInfo, includeEncryptKey) {
        super({});
        this.buildInfo = buildInfo;
        this.includeEncryptKey = includeEncryptKey;
    }

    get definitions() {
        return toDefinitions(this.buildInfo, this.includeEncryptKey);
    }

    set definitions(_) {
        // DefinePlugin 构造时会赋值，忽略：以 buildInfo 为准
    }
}

/**
 * @param {Object} buildInfo deriveBuildInfo 的结果（同一对象引用，后续写入的字段也会生效）
 * @param {{ includeEncryptKey?: boolean }} [options]
 * @returns {import('webpack').DefinePlugin}
 */
function buildInfoPlugin(buildInfo, { includeEncryptKey = false } = {}) {
    return new BuildInfoPlugin(buildInfo, includeEncryptKey);
}

module.exports = { buildInfoPlugin };
