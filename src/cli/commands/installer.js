const path = require('path');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { resolveBuilderConfig } = require('../../config/builder-config');
const { adaptIcon } = require('../../pack/icon');
const { generateShellScripts } = require('../../pack/shell');
const { resolveElectronBuilder } = require('../../electron/resolve-electron-builder');
const { assertLoong64Builder } = require('../../electron/loong64');
const {
    resolveBuildTargetOptions,
    buildTargets,
    computeUnpackedDir,
} = require('../../electron/build-targets');
const logger = require('../../core/logger');

module.exports = {
    name: 'installer',
    description: '复用上次 pack --dir 产出的 unpacked 目录，套 installer 壳（外部签名场景）',
    target: TARGETS.APP,
    mode: MODES.PROD,
    needsBcConfig: false,
    needsBuilderConfig: true,
    resolveCliOptions: resolveBuildTargetOptions,
    options: [
        ['--platform <p>', '目标平台：win / mac / linux'],
        ['--arch <a>', '目标架构'],
        ['--sign', '签名标志（透传至 cliOptions.sign；__BC_BUILD__ 不派生）'],
    ],
    action: async (ctx) => {
        const rootDir = process.cwd();
        const distDir = path.join(rootDir, 'dist');
        const pkgJson = require(path.resolve(rootDir, 'package.json'));

        assertLoong64Builder({
            rootDir,
            arch: ctx.cliOptions.arch,
            command: `npx base-client ${process.argv.slice(2).join(' ')}`,
        });

        // 阶段 A 子集：不清 dist、不派生 __BC_BUILD__、不读 bc.config
        const mergedBuilderConfig = resolveBuilderConfig(ctx, pkgJson);
        await adaptIcon({ rootDir, distDir, mergedBuilderConfig });
        generateShellScripts({
            rootDir, distDir, mergedBuilderConfig,
            appName: pkgJson.name,
            appDirName: mergedBuilderConfig.productName ?? pkgJson.name,
            appId: mergedBuilderConfig.appId,
        });

        // 阶段 C：按 CLI 的 platform/arch 推导上次 pack --dir 的产物路径，作 prepackaged 输入
        //   目录不存在 / 平台错配 → electron-builder 自然抛错，frame 不做前置校验
        const unpackedPath = path.resolve(rootDir, 'dist', computeUnpackedDir(ctx.cliOptions));

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
