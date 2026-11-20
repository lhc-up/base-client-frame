/**
 * 构建用 Node 版本检查：frame 命令启动时的第一步，依据 frame 自身 `package.json` 的 `engines.node`。
 *
 * npm 不强制执行 `engines`（只在安装时警告），版本不对时构建会以难以理解的错误失败，因此在入口处拦下。
 *
 * 本文件在版本检查通过之前运行，必须能在旧版 Node 上执行：只用 Node 14 也支持的语法与 API，
 * 也不 require 其他模块（eslint.config.js 中按 Node 14 检查）。
 *
 * 只认识 `engines` 当前用到的三种写法：`^x.y.z`、`>=x.y.z`、`||`。遇到其他写法时跳过检查并警告，不误拦。
 */

function parseVersion(text) {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(text).trim());
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(a, b) {
    for (let i = 0; i < 3; i += 1) {
        if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    }
    return 0;
}

/**
 * @returns {boolean|null} 是否满足；写法不认识时为 null
 */
function satisfiesComparator(version, comparator) {
    const text = comparator.trim();
    if (text.indexOf('>=') === 0) {
        const min = parseVersion(text.slice(2));
        return min ? compareVersions(version, min) >= 0 : null;
    }
    if (text.charAt(0) === '^') {
        const base = parseVersion(text.slice(1));
        if (!base || base[0] === 0) return null;
        return version[0] === base[0] && compareVersions(version, base) >= 0;
    }
    return null;
}

/**
 * @param {string} version 如 process.version
 * @param {string} range 如 `^20.19.0 || ^22.13.0 || >=24`
 * @returns {boolean|null} 是否满足；版本或范围写法不认识时为 null
 */
function satisfies(version, range) {
    const parsed = parseVersion(version);
    if (!parsed || typeof range !== 'string' || !range.trim()) return null;
    let unknown = false;
    const parts = range.split('||');
    for (let i = 0; i < parts.length; i += 1) {
        // `>=24` 这类省略次版本的写法补齐为 `>=24.0.0`
        const comparator = parts[i].trim().replace(/^(>=|\^)(\d+)$/, '$1$2.0.0').replace(/^(>=|\^)(\d+\.\d+)$/, '$1$2.0');
        const result = satisfiesComparator(parsed, comparator);
        if (result === true) return true;
        if (result === null) unknown = true;
    }
    return unknown ? null : false;
}

/**
 * 检查当前 Node 是否满足构建要求。不满足时输出错误并返回 false；写法不认识时警告并放行。
 *
 * @param {Object} option
 * @param {string} option.version 当前 Node 版本
 * @param {string} option.range engines.node
 * @param {{ error: Function, warn: Function }} [option.output]
 * @returns {boolean} 是否可以继续
 */
function ensureNodeVersion({ version, range, output = console }) {
    const result = satisfies(version, range);
    if (result === true) return true;
    if (result === null) {
        output.warn(`[base-client] 无法解析构建 Node 版本要求「${range}」，跳过检查`);
        return true;
    }
    output.error(`[base-client] 当前 Node ${version} 不满足构建要求 ${range}。`
        + '\n请切换 Node 版本（如 nvm use 22.15.1）后重试。');
    return false;
}

module.exports = { satisfies, ensureNodeVersion };
