const path = require('path');
const fse = require('fs-extra');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { deriveBuildInfo } = require('../../core/build-info');
const { resolveBuildConfig } = require('../../config/bc-config');
const { resolveBuilderConfig } = require('../../config/builder-config');
const { runProductionBuild } = require('../../webpack-runner/run-build');
const { adaptIcon } = require('../../pack/icon');
const { generateShellScripts } = require('../../pack/shell');
const { computeCryptoState } = require('../../pack/encrypt');
const { resolveElectronBuilder } = require('../../electron/resolve-electron-builder');
const { buildTargets, computeUnpackedDir } = require('../../electron/build-targets');
const logger = require('../../core/logger');

module.exports = {
    name: 'pack',
    description: 'app target 打包（出安装包 / 免安装目录）',
    target: TARGETS.APP,
    mode: MODES.PROD,
    needsBcConfig: true,
    needsBuilderConfig: true,
    options: [
        ['--platform <p>', '目标平台：win / mac / linux'],
        ['--arch <a>', '目标架构：ia32 / x64 / armv7l / arm64 / universal / loong64'],
        ['--dir', '仅产 unpacked 目录，跳过 installer 阶段'],
        ['--sign', '签名标志（透传至 cliOptions.sign 与 __BC_BUILD__.sign）'],
    ],
    action: async (ctx) => {
        const rootDir = process.cwd();
        const distDir = path.join(rootDir, 'dist');
        const appDir = path.join(rootDir, 'app');
        const pkgJson = require(path.resolve(rootDir, 'package.json'));

        // 阶段 A · 资源准备
        logger.info('清空 dist/（frame 约定输出目录，如有重要文件请移出）');
        fse.emptyDirSync(distDir);

        const userConfig = ctx.userConfig;
        const cryptoState = computeCryptoState({ rootDir, userConfig });
        const buildInfo = deriveBuildInfo(ctx, pkgJson, cryptoState);

        const mergedBuilderConfig = resolveBuilderConfig(ctx, pkgJson);
        await adaptIcon({ rootDir, distDir, mergedBuilderConfig });
        generateShellScripts({
            rootDir,
            distDir,
            mergedBuilderConfig,
            appName: pkgJson.name,
            appDirName: mergedBuilderConfig.productName ?? pkgJson.name,
            appId: mergedBuilderConfig.appId,
        });

        // 阶段 B · 代码构建
        fse.emptyDirSync(appDir);
        const { main, preload, renderer } = resolveBuildConfig(ctx, pkgJson, buildInfo);
        const { devServer: _r, ...rendererWebpack } = renderer;
        await runProductionBuild([main, preload, rendererWebpack], ctx);

        // ⑩ AES 加密渲染层
        if (cryptoState.encrypted) {
            const { encryptRenderer } = require('../../pack/encrypt');
            await encryptRenderer({ appDir, encryptKey: cryptoState.encryptKey });
            logger.info('AES 加密完成');
        }

        // ⑪ 增量 .asax 包（非 --dir）
        if (userConfig.incremental !== false && !ctx.cliOptions.dir) {
            const { buildIncrementalAsax } = require('../../pack/incremental');
            await buildIncrementalAsax({ appDir, distDir, buildInfo });
            logger.info(`增量包 dist/${buildInfo.env}-v${buildInfo.version}.asax 已产出`);
        }

        // ⑫ bytenode 主进程字节码
        if (userConfig.bytenode !== false) {
            const { bytenodeMain } = require('../../pack/bytenode');
            await bytenodeMain({ rootDir, appDir, mergedBuilderConfig });
            logger.info('bytenode 字节码完成');
        }

        // 阶段 C · 安装包打包
        const targets = buildTargets(ctx.cliOptions);
        const builder = await resolveElectronBuilder(rootDir);
        await builder.build({ ...targets, config: mergedBuilderConfig });

        // --dir 场景校验：unpacked 目录名由 electron-builder 命名约定决定；installer 会用相同 platform/arch 现算路径
        if (ctx.cliOptions.dir) {
            const unpackedRel = path.join('dist', computeUnpackedDir(ctx.cliOptions));
            const unpackedAbs = path.join(rootDir, unpackedRel);
            if (fse.existsSync(unpackedAbs)) {
                logger.info(`unpacked 目录已产出：${unpackedRel}`);
            } else {
                logger.warn(`--dir 未在预期路径 ${unpackedRel} 找到 unpacked 目录；后续 installer 命令将无法复用本次产物`);
            }
        }

        logger.success('pack 完成');
    },
};
