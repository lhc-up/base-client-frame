const path = require('path');

function resolveElectron(rootDir) {
    let entryPath;
    try {
        entryPath = require.resolve('electron', { paths: [rootDir] });
    } catch (err) {
        throw new Error(`[base-client] 在 ${rootDir} 中未找到 electron 包，请在项目中安装 electron`);
    }
    // require.resolve 会回退到 NODE_PATH / 上游 node_modules——必须校验解析路径落在 rootDir 下
    const relative = path.relative(rootDir, entryPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`[base-client] 在 ${rootDir} 中未找到 electron 包，请在项目中安装 electron`);
    }
    delete require.cache[entryPath];
    return require(entryPath);
}

module.exports = { resolveElectron };
