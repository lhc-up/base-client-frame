const webpack = require('webpack');
const { RUNTIME_ENV_KEYS } = require('../../core/env');

/**
 * 环境变量约定
 *
 * 变量来源有两类，都挂在 ctx.env 上：
 * - .env 与 .env.<name>（同名变量后者覆盖）。`--env <name>` 指代码对接的后台环境（如 dev / test / prod），
 *   与是否本地调试无关，两者可任意组合（如 pack --env test）。
 * - 命令启动后由 frame 生成、无法提前写进 .env 的变量（见 core/env.js 的 RUNTIME_ENV_KEYS）：
 *   BC_DEV（dev 命令启动即本地调试，值为 'true'）、BC_DEV_URL（本地调试时的页面地址）。
 *
 * 访问规则：
 * - `BC_` 开头：业务代码整个生命周期可访问，唯一写法是静态的 `process.env.BC_xxx`，构建期被替换为字面量写进产物。
 *   `process.env[name]`、解构、整体引用 `process.env` 等动态写法不支持：不会被替换，运行时也读不到
 *   （dev:app 启动 Electron 时去掉了 BC_* 变量，与打包后一致）。
 * - 其他变量：只在构建期可访问（bc.config.js、electron-builder.config.js 经 ctx.env 读取），不进产物。
 */

function toDefinitions(env) {
    const defs = {};
    // frame 生成的变量始终定义：非 dev 命令下替换为 undefined，不会回落到运行时的 process.env
    for (const k of RUNTIME_ENV_KEYS) defs[`process.env.${k}`] = 'undefined';
    for (const k of Object.keys(env || {})) {
        if (k.startsWith('BC_')) defs[`process.env.${k}`] = JSON.stringify(env[k]);
    }
    return defs;
}

/**
 * 按 env 替换 `process.env.BC_xxx`。
 *
 * definitions 在 webpack 应用插件时才从 env 计算：BC_DEV_URL 在构建配置求值之后才写入 ctx.env。
 */
class UserEnvPlugin extends webpack.DefinePlugin {
    constructor(env) {
        super({});
        this.env = env;
    }

    get definitions() {
        return toDefinitions(this.env);
    }

    set definitions(_) {
        // DefinePlugin 构造时会赋值，忽略：以 env 为准
    }
}

/**
 * @param {Record<string, string>} env ctx.env（同一对象引用，后续写入的变量也会生效）
 * @returns {import('webpack').DefinePlugin}
 */
function userEnvPlugin(env) {
    return new UserEnvPlugin(env);
}

module.exports = { userEnvPlugin };
