const fse = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('./logger');

/**
 * 由 frame 在命令启动时生成、不能写在 .env 文件中的变量（与 .env 中的变量一起挂在 ctx.env 上）：
 * - BC_DEV：dev 命令（dev:web、dev:app）启动时为 'true'，即本地调试状态；其他命令下为 undefined。
 * - BC_DEV_URL：本地调试时的页面 dev server 地址（如 'http://localhost:8023/'），只在 dev 命令下有值。
 *   端口可能来自 bc.config.js，因此在构建配置求值之后才写入：bc.config.js 中读不到，业务代码中可以。
 */
const RUNTIME_ENV_KEYS = Object.freeze(['BC_DEV', 'BC_DEV_URL']);

function readEnvFile(file) {
    if (!fse.existsSync(file)) return null;
    const parsed = dotenv.parse(fse.readFileSync(file));
    const reserved = RUNTIME_ENV_KEYS.filter(k => k in parsed);
    if (reserved.length) {
        throw new Error(`[base-client] ${path.basename(file)} 不能声明 ${reserved.join('、')}：由 frame 在启动时生成`);
    }
    return parsed;
}

function loadEnv(envName, { cwd = process.cwd() } = {}) {
    const base = readEnvFile(path.join(cwd, '.env')) || {};
    const specificPath = path.join(cwd, `.env.${envName}`);
    const specific = readEnvFile(specificPath);
    if (!specific) {
        logger.info(`未找到 .env.${envName}，视作空环境`);
    }
    return { ...base, ...(specific || {}) };
}

/**
 * 写入启动后产生的变量：ctx.env 供构建配置与 userEnvPlugin 使用，process.env 与 .env 中的 BC_* 变量处理一致。
 *
 * @param {{ env: Record<string, string> }} ctx
 * @param {string} key RUNTIME_ENV_KEYS 之一
 * @param {string} value
 */
function setRuntimeEnv(ctx, key, value) {
    if (!RUNTIME_ENV_KEYS.includes(key)) throw new Error(`[base-client] ${key} 不是 frame 生成的变量`);
    ctx.env[key] = value;
    process.env[key] = value;
}

module.exports = { loadEnv, setRuntimeEnv, RUNTIME_ENV_KEYS };
