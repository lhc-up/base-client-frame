const path = require('path');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { resolveBuilderConfig } = require('../../config/builder-config');
const { adaptIcon } = require('../../pack/icon');
const { generateShellScripts } = require('../../pack/shell');
const { readFrameState } = require('../../pack/frame-state');
const { resolveElectronBuilder } = require('../../electron/resolve-electron-builder');
const { buildTargets } = require('../../electron/build-targets');
const logger = require('../../core/logger');

module.exports = {
    name: 'installer',
    description: '复用上次 pack --unpack 产出的 unpacked 目录，套 installer 壳（外部签名场景）',
    target: TARGETS.APP,
    mode: MODES.PROD,
    needsBcConfig: false,
    needsBuilderConfig: true,
    options: [
        ['--platform <p>', '目标平台：win / mac / linux'],
        ['--arch <a>', '目标架构'],
        ['--sign', '签名标志（透传至 cliOptions.sign；__BC_BUILD__ 不派生）'],
    ],
    action: async (ctx) => {
        const rootDir = process.cwd();
        const distDir = path.join(rootDir, 'dist');
        const pkgJson = require(path.resolve(rootDir, 'package.json'));

        // 阶段 A 子集：不清 dist、不派生 __BC_BUILD__、不读 bc.config
        const mergedBuilderConfig = resolveBuilderConfig(ctx, pkgJson);
        await adaptIcon({ rootDir, distDir, mergedBuilderConfig });
        generateShellScripts({
            rootDir, distDir, mergedBuilderConfig,
            appName: pkgJson.name,
            appDirName: mergedBuilderConfig.productName ?? pkgJson.name,
            appId: mergedBuilderConfig.appId,
        });

        // 阶段 C：读 frame-state → prepackaged 透传
        const state = readFrameState(distDir);
        const unpackedPath = state?.lastUnpack?.unpackedPath
            ? path.resolve(rootDir, state.lastUnpack.unpackedPath)
            : undefined;

        const targets = buildTargets(ctx.cliOptions);
        const builder = await resolveElectronBuilder(rootDir);
        await builder.build({
            ...targets,
            config: mergedBuilderConfig,
            prepackaged: unpackedPath,
        });

        logger.success('installer 完成');
    },
};
