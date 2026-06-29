const path = require('path');

function resolveElectronBuilder(rootDir) {
    let entryPath;
    try {
        entryPath = require.resolve('electron-builder', { paths: [rootDir] });
    } catch (err) {
        throw new Error(`[base-client] electron-builder 未安装，请在项目中 npm i -D electron-builder`);
    }
    // require.resolve 会回退到上游 node_modules——必须校验解析路径落在 rootDir 下
    const relative = path.relative(rootDir, entryPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`[base-client] electron-builder 未安装，请在项目中 npm i -D electron-builder`);
    }
    return require(entryPath);
}

module.exports = { resolveElectronBuilder };
