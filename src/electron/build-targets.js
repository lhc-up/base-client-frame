const PLATFORM_MAP = { win: ['nsis'], mac: ['dmg'], linux: ['deb'] };
const ARCH_LIST = ['ia32', 'x64', 'armv7l', 'arm64', 'universal', 'loong64'];

function buildTargets({ platform, arch, unpack }) {
    if (!platform) throw new Error('[base-client] 缺少 --platform');
    if (!PLATFORM_MAP[platform]) throw new Error(`[base-client] 不支持的平台：${platform}`);
    if (!arch) throw new Error('[base-client] 缺少 --arch');
    if (!ARCH_LIST.includes(arch)) throw new Error(`[base-client] 不支持的架构：${arch}`);
    return {
        [platform]: unpack ? ['dir'] : PLATFORM_MAP[platform],
        [arch]: true,
    };
}

module.exports = { buildTargets, PLATFORM_MAP, ARCH_LIST };
