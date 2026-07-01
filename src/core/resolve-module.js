const path = require('path');
const { pathToFileURL } = require('url');
const fse = require('fs-extra');

/**
 * 从 rootDir 的 node_modules 中解析并加载一个包。
 *
 * @param {string} pkgName
 * @param {object} [options]
 * @param {string} [options.rootDir=process.cwd()]     用户项目根目录
 * @param {string} [options.missingHint]               包不存在时抛出的错误消息
 * @param {boolean} [options.esmCompat=false]          包若为 ESM，fallback 到 dynamic import
 * @param {boolean} [options.clearRequireCache=false]  加载前清 require.cache
 * @returns {Promise<any>}
 */
async function resolveModule(pkgName, options = {}) {
    const {
        rootDir = process.cwd(),
        missingHint = `[base-client] ${pkgName} 未安装，请在项目中 npm i -D ${pkgName}`,
        esmCompat = false,
        clearRequireCache = false,
    } = options;

    let entryPath;
    try {
        entryPath = require.resolve(pkgName, { paths: [rootDir] });
    } catch {
        throw new Error(missingHint);
    }
    // require.resolve 会回退到 NODE_PATH / 上游 node_modules，且内部有路径缓存（已删的文件仍可能返回旧路径）——
    // 必须校验解析结果落在 rootDir 下且文件实际存在
    const relative = path.relative(rootDir, entryPath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fse.existsSync(entryPath)) {
        throw new Error(missingHint);
    }

    if (clearRequireCache) delete require.cache[entryPath];

    if (!esmCompat) return require(entryPath);

    try {
        const result = require(entryPath);
        // Node 22+ 的 require() 可直接加载 ESM 并返回 namespace 对象（含 __esModule: true）
        if (result && result.__esModule && result.default !== undefined) {
            return result.default;
        }
        return result;
    } catch (e) {
        if (e.code === 'ERR_REQUIRE_ESM') {
            const mod = await import(pathToFileURL(entryPath).href);
            return mod.default || mod;
        }
        throw e;
    }
}

module.exports = { resolveModule };
