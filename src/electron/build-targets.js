const logger = require('../core/logger');

const PLATFORM_MAP = { win: ['nsis'], mac: ['dmg'], linux: ['deb'] };
const ARCH_LIST = ['ia32', 'x64', 'armv7l', 'arm64', 'universal', 'loong64'];

const HOST_PLATFORM_MAP = { win32: 'win', darwin: 'mac', linux: 'linux' };

function buildTargets({ platform, arch, dir }) {
    let resolvedPlatform = platform;
    if (!resolvedPlatform) {
        resolvedPlatform = HOST_PLATFORM_MAP[process.platform];
        if (!resolvedPlatform) {
            throw new Error(`[base-client] 不支持的平台：宿主 ${process.platform} 未映射；请显式传 --platform`);
        }
        logger.info(`--platform 未指定，使用宿主 ${resolvedPlatform}`);
    }
    if (!PLATFORM_MAP[resolvedPlatform]) throw new Error(`[base-client] 不支持的平台：${resolvedPlatform}`);

    let resolvedArch = arch;
    if (!resolvedArch) {
        resolvedArch = process.arch;
        logger.info(`--arch 未指定，使用宿主 ${resolvedArch}`);
    }
    if (!ARCH_LIST.includes(resolvedArch)) throw new Error(`[base-client] 不支持的架构：${resolvedArch}`);

    const result = {
        [resolvedPlatform]: dir ? ['dir'] : PLATFORM_MAP[resolvedPlatform],
        [resolvedArch]: true,
    };
    logger.debug(`buildTargets 最终：platform=${resolvedPlatform} arch=${resolvedArch} dir=${!!dir}`);
    return result;
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
