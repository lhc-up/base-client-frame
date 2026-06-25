const path = require('path');
const fse = require('fs-extra');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { deriveBuildInfo } = require('../../core/build-info');
const { resolveBuildConfig } = require('../../config/bc-config');
const { runProductionBuild } = require('../../webpack-runner/run-build');
const logger = require('../../core/logger');

module.exports = {
    name: 'build',
    description: 'web target 生产构建（产物落 dist/）',
    target: TARGETS.WEB,
    mode: MODES.PROD,
    needsBcConfig: true,
    needsBuilderConfig: false,
    options: [],
    action: async (ctx) => {
        const rootDir = process.cwd();
        const distDir = path.join(rootDir, 'dist');

        fse.emptyDirSync(distDir);

        const pkgJson = require(path.resolve(rootDir, 'package.json'));
        const buildInfo = deriveBuildInfo(ctx, pkgJson);

        const { web } = resolveBuildConfig(ctx, pkgJson, buildInfo);
        const { devServer: _ignored, ...webpackConfig } = web;
        webpackConfig.name = webpackConfig.name || 'web';

        await runProductionBuild([webpackConfig], ctx);

        logger.success('build 完成');
    },
};
