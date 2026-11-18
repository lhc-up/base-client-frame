const path = require('path');
const webpack = require('webpack');
const ConstDependency = require('webpack/lib/dependencies/ConstDependency');
const logger = require('../../core/logger');

const PLUGIN_NAME = 'BaseClientUserEnvPlugin';
const JS_TYPES = ['javascript/auto', 'javascript/dynamic', 'javascript/esm'];

/**
 * 环境变量约定（.env 与 .env.<name>）
 *
 * - `--env <name>` 指代码对接的后台环境（如 dev / test / prod），与是否本地调试无关；
 *   是否本地调试只由命令决定（dev:web、dev:app 对比 build、pack），两者可任意组合。
 * - `BC_` 开头的变量：在业务代码的整个生命周期可访问，唯一写法是静态的 `process.env.BC_xxx`，
 *   构建期一律替换为字面量：已声明的替换为其值；未声明的替换为 `undefined` 并输出构建警告
 *   （变量名写错、某个环境文件漏写时能在构建期发现，而不是运行时页面报 `process is not defined`
 *   或主进程读到系统环境变量）。可选的变量在 .env 中声明为空值（`BC_xxx=`）即可。
 *   `process.env[name]`、解构、整体引用 `process.env` 等动态写法不支持：不会被替换，运行时也读不到
 *   （dev:app 启动 Electron 时去掉了 BC_* 变量，与打包后一致）。
 * - 其他变量：只在构建期可访问（bc.config.js、electron-builder.config.js 经 ctx.env 读取），不进产物。
 * - frame 产生的信息（版本、构建时间、是否本地调试、本地调试地址等）不在这里，见 `__BC_BUILD__`（build-info-plugin）。
 */

function toDefinitions(env) {
    const defs = {};
    for (const k of Object.keys(env || {})) {
        if (k.startsWith('BC_')) defs[`process.env.${k}`] = JSON.stringify(env[k]);
    }
    return defs;
}

class UserEnvPlugin extends webpack.DefinePlugin {
    constructor(env) {
        super(toDefinitions(env));
        this.declared = new Set(Object.keys(env || {}).filter(k => k.startsWith('BC_')));
    }

    apply(compiler) {
        // 已声明的变量由 DefinePlugin 替换；它的 expression 钩子先于下面的成员链钩子执行
        super.apply(compiler);

        compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation, { normalModuleFactory }) => {
            /** 未声明的变量名 → 首次出现的位置 */
            const undeclared = new Map();

            const handler = (parser) => {
                /**
                 * `process.env.BC_xxx` 以及其后带属性 / 方法的写法（如 `.length`、`.trim()`）：
                 * 只把 `process.env.BC_xxx` 这一段替换为 `undefined`。
                 */
                const replace = (expression, members) => {
                    const name = members[1];
                    if (members[0] !== 'env' || typeof name !== 'string' || !name.startsWith('BC_')) return undefined;
                    if (this.declared.has(name)) return undefined;
                    let node = expression;
                    for (let i = members.length; i > 2; i--) node = node.object;
                    const dep = new ConstDependency('undefined', node.range);
                    dep.loc = node.loc;
                    parser.state.module.addPresentationalDependency(dep);
                    if (!undeclared.has(name)) {
                        const resource = parser.state.module.resource || '';
                        const line = node.loc ? node.loc.start.line : '?';
                        undeclared.set(name, `${path.relative(compiler.context, resource)}:${line}`);
                    }
                    return true;
                };
                parser.hooks.expressionMemberChain.for('process').tap(PLUGIN_NAME,
                    (expression, members) => (members.length === 2 ? replace(expression, members) : undefined));
                parser.hooks.unhandledExpressionMemberChain.for('process').tap(PLUGIN_NAME, replace);
            };
            for (const type of JS_TYPES) normalModuleFactory.hooks.parser.for(type).tap(PLUGIN_NAME, handler);

            compilation.hooks.afterSeal.tap(PLUGIN_NAME, () => {
                for (const [name, where] of undeclared) {
                    const msg = `${name} 未在 .env / .env.<env> 中声明，已替换为 undefined（${where}）`;
                    compilation.warnings.push(new webpack.WebpackError(msg));
                    logger.warn(msg);
                }
            });
        });
    }
}

/**
 * @param {Record<string, string>} env loadEnv 的结果
 * @returns {import('webpack').DefinePlugin}
 */
function userEnvPlugin(env) {
    return new UserEnvPlugin(env);
}

module.exports = { userEnvPlugin };
