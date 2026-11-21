const path = require('path');

/**
 * 龙芯（loong64）打包。
 *
 * - 官方 Electron 没有 loong64 版本，改用龙芯维护的镜像（版本号与官方不同，见 `LOONG64_ELECTRON_VERSION`）。
 * - 官方 electron-builder（准确地说是它依赖的 builder-util）不认识 loong64：不报错，而是回退到构建机架构，
 *   打出一个「装着龙芯 Electron、标成 amd64」的 deb，龙芯机器装不上。所以打包前必须确认装的是龙芯版。
 *
 * 规则见 docs/build-target-resolution-contract.md「龙芯（loong64）」。
 */

const LOONG64_ELECTRON_VERSION = '22.3.27';
const LOONG64_BUILDER_VERSION = '24.13.3';
const LOONG64_REGISTRY = 'https://registry.loongnix.cn:4873/';

/** 合并进打包预设的 Electron 下载配置（项目配置仍可覆盖） */
const LOONG64_ELECTRON_CONFIG = {
    electronVersion: LOONG64_ELECTRON_VERSION,
    electronDownload: {
        version: LOONG64_ELECTRON_VERSION,
        mirror: 'http://ftp.loongnix.cn/electron/LoongArch/',
        customDir: `v${LOONG64_ELECTRON_VERSION}`,
        platform: 'linux',
        arch: 'loong64',
    },
};

/**
 * 项目里装的 electron-builder 是否支持 loong64：看它实际使用的 builder-util 的 `Arch` 是否有 loong64。
 *
 * @param {string} rootDir 项目根目录
 * @returns {boolean} electron-builder 未安装时返回 true（交给后续的「未安装」报错处理）
 */
function builderSupportsLoong64(rootDir) {
    let builderEntry;
    try {
        builderEntry = require.resolve('electron-builder', { paths: [rootDir] });
    } catch {
        return true;
    }
    const builderUtilEntry = require.resolve('builder-util', { paths: [path.dirname(builderEntry)] });
    const { Arch } = require(builderUtilEntry);
    return Boolean(Arch) && Object.prototype.hasOwnProperty.call(Arch, 'loong64');
}

/**
 * 不支持时的报错：把完整的处理步骤写进 message，照着控制台输出做即可。
 *
 * @param {string} command 本次执行的命令，用于提示重新执行
 * @returns {string}
 */
function unsupportedMessage(command) {
    return [
        '[base-client] 打包 loong64 需要龙芯版 electron-builder，当前项目装的是官方版，已停止打包。',
        '官方版不认识 loong64，会改用构建机架构，打出一个标成 amd64、龙芯机器装不上的安装包。',
        '',
        '请在龙芯构建机（Linux）的项目根目录依次执行：',
        '  1. rm -rf node_modules/electron-builder node_modules/builder-util package-lock.json',
        `  2. npm i electron-builder@${LOONG64_BUILDER_VERSION} -D --registry=${LOONG64_REGISTRY}`,
        `  3. ${command}`,
        '',
        '打完包后恢复官方版（否则本地调试 dev:app 可能因 Electron 架构不对而报 SIGSEGV）：',
        '  4. git checkout -- package.json package-lock.json',
        '  5. rm -rf node_modules && npm i',
    ].join('\n');
}

/**
 * 目标架构为 loong64 时，确认项目装的是龙芯版 electron-builder，否则抛出带完整处理步骤的错误。
 *
 * @param {{ rootDir: string, arch: string, command: string }} options
 * @throws {Error} 目标为 loong64 且 electron-builder 不支持 loong64
 */
function assertLoong64Builder({ rootDir, arch, command }) {
    if (arch !== 'loong64') return;
    if (builderSupportsLoong64(rootDir)) return;
    throw new Error(unsupportedMessage(command));
}

module.exports = {
    LOONG64_ELECTRON_CONFIG,
    LOONG64_ELECTRON_VERSION,
    builderSupportsLoong64,
    assertLoong64Builder,
};
