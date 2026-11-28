/**
 * 打包用的 electron-builder：frame 依赖 @base-client/electron-builder（electron-builder 及其内部包的改版，
 * 支持 loong64、linux.installDir、deb.architecture），项目不安装 electron-builder。
 *
 * @returns {{ build: Function, Platform: object, Arch: object }}
 */
function resolveElectronBuilder() {
    return require('@base-client/electron-builder');
}

/**
 * electron-builder 下载 Electron 时，以下环境变量优先于配置里的 electronDownload.mirror
 * （由 app-builder 二进制决定；项目 .npmrc 的 electron_mirror 经 npm run / npx 传入为 npm_config_electron_mirror）。
 */
const MIRROR_ENV_KEYS = ['ELECTRON_MIRROR', 'npm_config_electron_mirror', 'NPM_CONFIG_ELECTRON_MIRROR'];

/**
 * 配置里写了 electronDownload.mirror 时，打包期间把上述环境变量设为同一地址，让配置生效
 * （如龙芯旧世界必须用龙芯镜像：npmmirror 上没有龙芯 Electron），结束后恢复。
 *
 * @param {object} config 合并后的 electron-builder 配置
 * @param {() => Promise<any>} fn
 */
async function withConfigMirror(config, fn) {
    const mirror = config && config.electronDownload && config.electronDownload.mirror;
    if (!mirror) return fn();
    // 先全部保存再设置、逆序恢复：Windows 上环境变量名不区分大小写，npm_config_… 与 NPM_CONFIG_… 是同一个
    const saved = MIRROR_ENV_KEYS.map(key => [key, process.env[key]]);
    for (const key of MIRROR_ENV_KEYS) {
        process.env[key] = mirror;
    }
    try {
        return await fn();
    } finally {
        for (const [key, value] of saved.reverse()) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

/**
 * 执行打包。
 *
 * @param {{ platform: string, types: string[], builderArch: string }} target build-targets.buildTargets 的结果
 * @param {{ config: object, projectDir: string, prepackaged?: string }} options
 */
async function runBuilder(target, { config, projectDir, prepackaged }) {
    const { toBuilderTargetMap } = require('./build-targets');
    const builder = resolveElectronBuilder();
    const options = { targets: toBuilderTargetMap(target, builder), config, projectDir };
    if (prepackaged) options.prepackaged = prepackaged;
    return withConfigMirror(config, () => builder.build(options));
}

module.exports = { resolveElectronBuilder, runBuilder, withConfigMirror, MIRROR_ENV_KEYS };
