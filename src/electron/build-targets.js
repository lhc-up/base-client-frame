const PLATFORM_MAP = { win: ['nsis'], mac: ['dmg'], linux: ['deb'] };
const ARCH_LIST = ['ia32', 'x64', 'armv7l', 'arm64', 'universal', 'loong64'];

function buildTargets({ platform, arch, dir }) {
    if (!platform) throw new Error('[base-client] 缺少 --platform');
    if (!PLATFORM_MAP[platform]) throw new Error(`[base-client] 不支持的平台：${platform}`);
    if (!arch) throw new Error('[base-client] 缺少 --arch');
    if (!ARCH_LIST.includes(arch)) throw new Error(`[base-client] 不支持的架构：${arch}`);
    return {
        [platform]: dir ? ['dir'] : PLATFORM_MAP[platform],
        [arch]: true,
    };
}

// electron-builder 对 dir target 的固定命名约定：
//   win/linux：{platform}[-{arch}]-unpacked（arch=x64 时省略 arch 段）
//   mac：mac[-{arch}]（无 -unpacked 后缀，因 .app 本身就是打包形态）
function computeUnpackedDir({ platform, arch }) {
    if (platform === 'mac') {
        return arch === 'x64' ? 'mac' : `mac-${arch}`;
    }
    const archSuffix = arch === 'x64' ? '' : `-${arch}`;
    return `${platform}${archSuffix}-unpacked`;
}

module.exports = { buildTargets, computeUnpackedDir, PLATFORM_MAP, ARCH_LIST };
