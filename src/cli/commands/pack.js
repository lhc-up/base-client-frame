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
const { resolveElectronBuilder } = require('../../electron/resolve-electron-builder');
const { buildTargets } = require('../../electron/build-targets');
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
        ['--unpack', '仅产 unpacked 目录，跳过 installer 阶段'],
        ['--sign', '签名标志（透传至 cliOptions.sign 与 __BC_BUILD__.sign）'],
        ['--pack-config <path>', '指定 electron-builder.config.js 路径'],
    ],
    action: async (ctx) => {
        const rootDir = process.cwd();
        const distDir = path.join(rootDir, 'dist');
        const appDir = path.join(rootDir, 'app');
        const pkgJson = require(path.resolve(rootDir, 'package.json'));

        // 阶段 A · 资源准备
        fse.emptyDirSync(distDir);
        const buildInfo = deriveBuildInfo(ctx, pkgJson);
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

        // 阶段 C · 安装包打包
        const targets = buildTargets(ctx.cliOptions);
        const builder = resolveElectronBuilder(rootDir);
        await builder.build({ ...targets, config: mergedBuilderConfig });

        logger.success('pack 完成');
    },
};
