/**
 * 龙芯（龙架构）打包目标。一个命令打一个包，目标名用 dpkg 的架构名：
 *
 * | --arch      | 世界   | Electron                        | deb Architecture | 状态 |
 * |-------------|--------|---------------------------------|------------------|------|
 * | loongarch64 | 旧世界 | 龙芯镜像 22.3.27（ABI1.0）        | loongarch64      | 可用 |
 * | loong64     | 新世界 | 待定（官方无；需新世界版本）       | loong64          | 尚未支持，选择即报错 |
 *
 * 两个目标在 electron-builder 内部都是 Arch.loong64（CPU 架构相同），区别只在 Electron 与 deb 架构名，
 * 二者必须配套：旧世界的 Electron 只能装在 dpkg 架构为 loongarch64 的系统上。
 * electron-builder 使用 @base-client/app-builder-lib 改版（支持 loong64 与 deb.architecture），不再需要龙芯源的版本。
 *
 * 规则见 docs/build-target-resolution-contract.md「龙芯」。
 */

/** 旧世界：龙芯维护的 Electron 镜像（版本号与官方不同） */
const LOONGARCH64_ELECTRON_VERSION = '22.3.27';

const LOONG_TARGETS = {
    loongarch64: {
        world: '旧世界',
        builderArch: 'loong64',
        debArchitecture: 'loongarch64',
        supported: true,
        electron: {
            electronVersion: LOONGARCH64_ELECTRON_VERSION,
            electronDownload: {
                version: LOONGARCH64_ELECTRON_VERSION,
                mirror: 'http://ftp.loongnix.cn/electron/LoongArch/',
                customDir: `v${LOONGARCH64_ELECTRON_VERSION}`,
                platform: 'linux',
                arch: 'loong64',
            },
        },
    },
    loong64: {
        world: '新世界',
        builderArch: 'loong64',
        debArchitecture: 'loong64',
        supported: false,
        electron: null,
    },
};

/**
 * 目标为尚未支持的龙芯目标（新世界）时抛错。在编译前调用，避免白等。
 *
 * @param {string} arch --arch 的值
 * @throws {Error}
 */
function assertLoongTargetSupported(arch) {
    const target = LOONG_TARGETS[arch];
    if (!target || target.supported) return;
    throw new Error([
        `[base-client] --arch ${arch}（龙芯${target.world}，deb 架构 ${target.debArchitecture}）尚未支持，已停止打包。`,
        '需要新世界版本的 Electron（官方没有龙芯版本），确定来源后再开放。',
        '龙芯旧世界（如 Loongnix 20，dpkg 架构为 loongarch64）请用 --arch loongarch64。',
    ].join('\n'));
}

module.exports = {
    LOONG_TARGETS,
    LOONGARCH64_ELECTRON_VERSION,
    assertLoongTargetSupported,
};
