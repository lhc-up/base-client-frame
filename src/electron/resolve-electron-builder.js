const { resolveModule } = require('../core/resolve-module');

function resolveElectronBuilder(rootDir) {
    return resolveModule('electron-builder', {
        rootDir,
        missingHint: '[base-client] electron-builder 未安装，请在项目中 npm i -D electron-builder',
        esmCompat: true,
    });
}

module.exports = { resolveElectronBuilder };
