/**
 * 打包用的 electron-builder：frame 直接依赖 @base-client/app-builder-lib（改版，见其 README），
 * 项目不再安装 electron-builder。返回 build、Packager、Platform、Arch（Arch 由 app-builder-lib 从
 * @base-client/builder-util 转出，与 Platform 同源）。
 *
 * @returns {{ build: Function, Packager: Function, Platform: object, Arch: object }}
 */
function resolveAppBuilderLib() {
    return require('@base-client/app-builder-lib');
}

/**
 * 执行打包。
 *
 * @param {{ platform: string, types: string[], builderArch: string }} target build-targets.buildTargets 的结果
 * @param {{ config: object, projectDir: string, prepackaged?: string }} options
 */
async function runBuilder(target, { config, projectDir, prepackaged }) {
    const { toBuilderTargetMap } = require('./build-targets');
    const lib = resolveAppBuilderLib();
    const options = { targets: toBuilderTargetMap(target, lib), config, projectDir };
    if (prepackaged) options.prepackaged = prepackaged;
    return lib.build(options, new lib.Packager(options));
}

module.exports = { resolveAppBuilderLib, runBuilder };
