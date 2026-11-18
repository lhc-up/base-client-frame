const webpack = require('webpack');

/**
 * 环境变量约定（.env 与 .env.<name>）
 *
 * - `--env <name>` 指代码对接的后台环境（如 dev / test / prod），与调试 / 打包无关；
 *   调试还是打包由命令区分（dev:web、dev:app 对比 build、pack），两者可任意组合。
 * - `BC_` 开头的变量：在业务代码的整个生命周期可访问，唯一写法是静态的 `process.env.BC_xxx`，
 *   构建期被替换为字面量写进产物。`process.env[name]`、解构、整体引用 `process.env` 等动态写法不支持：
 *   不会被替换，运行时也读不到（dev:app 启动 Electron 时去掉了 BC_* 变量，与打包后一致）。
 * - 其他变量：只在构建期可访问（bc.config.js、electron-builder.config.js 经 ctx.env 读取），不进产物。
 *
 * @param {Record<string, string>} env loadEnv 的结果
 * @returns {import('webpack').DefinePlugin}
 */
function userEnvPlugin(env) {
    const defs = {};
    for (const k of Object.keys(env || {})) {
        if (k.startsWith('BC_')) defs[`process.env.${k}`] = JSON.stringify(env[k]);
    }
    return new webpack.DefinePlugin(defs);
}

module.exports = { userEnvPlugin };
