const path = require('path');

const platformMap = { win: ['nsis'], mac: ['dmg'], linux: ['deb'] };
const archList = ['ia32', 'x64', 'armv7l', 'arm64', 'universal', 'loong64'];

function buildTargets({ platform, arch, unpack } = {}) {
    if (!platform) throw new Error('缺少 --platform');
    if (!platformMap[platform]) throw new Error(`不支持的平台：${platform}`);
    if (!arch) throw new Error('缺少 --arch');
    if (!archList.includes(arch)) throw new Error(`不支持的架构：${arch}`);

    return {
        [platform]: unpack ? ['dir'] : platformMap[platform],
        [arch]: true,
    };
}

function resolveElectronBuilder(rootDir) {
    try {
        return require.resolve('electron-builder', {
            paths: [path.join(rootDir, 'node_modules')],
        });
    } catch (_) {
        throw new Error('electron-builder 未安装，请在项目中 npm i -D electron-builder');
    }
}

module.exports = { buildTargets, resolveElectronBuilder };
