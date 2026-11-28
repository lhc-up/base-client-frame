const logger = require('../core/logger');
const { LOONG_TARGETS } = require('./loong');

const PLATFORM_MAP = { win: ['nsis'], mac: ['dmg'], linux: ['deb'] };

/**
 * --arch 可选值。龙芯分两个目标（一个命令打一个包，见 electron/loong.js）：
 * loongarch64 为旧世界，loong64 为新世界；二者在 electron-builder 内部都是 Arch.loong64。
 */
const ARCH_LIST = ['ia32', 'x64', 'armv7l', 'arm64', 'universal', 'loongarch64', 'loong64'];

const HOST_PLATFORM_MAP = { win32: 'win', darwin: 'mac', linux: 'linux' };

function resolveBuildTargetOptions(options = {}) {
    const { platform, arch } = options;
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

    return { ...options, platform: resolvedPlatform, arch: resolvedArch };
}

/** frame 的架构名 → electron-builder 的架构名（龙芯两个目标都是 loong64） */
function toBuilderArchName(arch) {
    return LOONG_TARGETS[arch] ? LOONG_TARGETS[arch].builderArch : arch;
}

/**
 * 打包目标：平台、electron-builder 的 target 类型与架构名。
 *
 * @returns {{ platform: string, types: string[], builderArch: string }}
 */
function buildTargets(options) {
    const { platform, arch, dir } = resolveBuildTargetOptions(options);
    logger.debug(`buildTargets 最终：platform=${platform} arch=${arch} dir=${!!dir}`);
    return {
        platform,
        types: dir ? ['dir'] : PLATFORM_MAP[platform],
        builderArch: toBuilderArchName(arch),
    };
}

/**
 * 转成 electron-builder 的 targets（Map<Platform, Map<Arch, string[]>>）。
 *
 * @param {{ platform: string, types: string[], builderArch: string }} target buildTargets 的结果
 * @param {{ Platform: object, Arch: object }} lib electron-builder
 */
function toBuilderTargetMap(target, lib) {
    const platformMap = { win: lib.Platform.WINDOWS, mac: lib.Platform.MAC, linux: lib.Platform.LINUX };
    return platformMap[target.platform].createTarget(target.types, lib.Arch[target.builderArch]);
}

// electron-builder 对 dir target 的固定命名约定：
//   win/linux：{platform}[-{arch}]-unpacked（arch=x64 时省略 arch 段；arch 为 electron-builder 的架构名）
//   mac：mac[-{arch}]（无 -unpacked 后缀，因 .app 本身就是打包形态）
function computeUnpackedDir(options) {
    const { platform, arch } = resolveBuildTargetOptions(options);
    const builderArch = toBuilderArchName(arch);
    if (platform === 'mac') {
        return builderArch === 'x64' ? 'mac' : `mac-${builderArch}`;
    }
    const archSuffix = builderArch === 'x64' ? '' : `-${builderArch}`;
    return `${platform}${archSuffix}-unpacked`;
}

module.exports = {
    resolveBuildTargetOptions,
    buildTargets,
    toBuilderTargetMap,
    toBuilderArchName,
    computeUnpackedDir,
    PLATFORM_MAP,
    ARCH_LIST,
};
