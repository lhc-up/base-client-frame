const { resolveModule } = require('../core/resolve-module');

function resolveElectron(rootDir) {
    return resolveModule('electron', {
        rootDir,
        missingHint: `[base-client] 在 ${rootDir} 中未找到 electron 包，请在项目中安装 electron`,
        clearRequireCache: true,
        // esmCompat: false —— electron 是可执行文件包，不会转 ESM
    });
}

module.exports = { resolveElectron };
