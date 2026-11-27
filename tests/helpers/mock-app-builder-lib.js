/**
 * 测试用的 @base-client/app-builder-lib：记录 build 调用，dir 目标时按真实命名规则建出 unpacked 目录。
 *
 * _getLastCall() 返回便于断言的形状：{ [platform]: types, [arch]: true, config, prepackaged, projectDir }。
 * 用法：jest.mock('@base-client/app-builder-lib', () => require('../helpers/mock-app-builder-lib'));
 */
const path = require('path');
const fs = require('fs');

const Arch = { ia32: 0, x64: 1, armv7l: 2, arm64: 3, universal: 4, loong64: 5 };
for (const [name, value] of Object.entries(Arch)) Arch[value] = name;

function makePlatform(name, cliName) {
    return {
        name,
        cliName,
        createTarget(types, arch) {
            return new Map([[this, new Map([[arch, types]])]]);
        },
    };
}

const Platform = {
    WINDOWS: makePlatform('windows', 'win'),
    MAC: makePlatform('mac', 'mac'),
    LINUX: makePlatform('linux', 'linux'),
};

let lastBuildCall = null;

class Packager {
    constructor(options) {
        this.options = options;
    }
}

async function build(options) {
    const [[platform, archMap]] = [...options.targets.entries()];
    const [[arch, types]] = [...archMap.entries()];
    const archName = Arch[arch];
    lastBuildCall = {
        [platform.cliName]: types,
        [archName]: true,
        config: options.config,
        prepackaged: options.prepackaged,
        projectDir: options.projectDir,
    };
    const rootDir = options.projectDir || process.cwd();
    if (types.includes('dir')) {
        const dirName = platform.cliName === 'mac'
            ? (archName === 'x64' ? 'mac' : `mac-${archName}`)
            : `${platform.cliName}${archName === 'x64' ? '' : `-${archName}`}-unpacked`;
        const unpackedDir = path.join(rootDir, 'dist', dirName);
        fs.mkdirSync(unpackedDir, { recursive: true });
        fs.writeFileSync(path.join(unpackedDir, 'placeholder.txt'), 'unpacked');
        return [];
    }
    return [path.join(rootDir, 'dist', 'fake-installer')];
}

module.exports = {
    Arch,
    Platform,
    Packager,
    build,
    _getLastCall: () => lastBuildCall,
    _clearLastCall: () => { lastBuildCall = null; },
};
