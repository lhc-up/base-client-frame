const path = require('path');
const fse = require('fs-extra');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { deriveBuildInfo } = require('../../core/build-info');
const { resolveBuildConfig } = require('../../config/bc-config');
const { runProductionBuild } = require('../../webpack-runner/run-build');
const { computeCryptoState, encryptRenderer } = require('../../pack/encrypt');
const { buildChildAsar } = require('../../pack/child-asar');
const logger = require('../../core/logger');

module.exports = {
    name: 'child',
    description: '产 child 子应用 .asar（宿主动态加载的资源包，跨平台）',
    target: TARGETS.APP,
    mode: MODES.PROD,
    needsBcConfig: true,
    needsBuilderConfig: false,
    options: [],
    action: async (ctx) => {
        const rootDir = process.cwd();
        const distDir = path.join(rootDir, 'dist');
        const appDir = path.join(rootDir, 'app');
        const pkgJson = require(path.resolve(rootDir, 'package.json'));

        // 进场清空 dist + app
        logger.info('清空 dist/（frame 约定输出目录，如有重要文件请移出）');
        fse.emptyDirSync(distDir);
        logger.info('清空 app/');
        fse.emptyDirSync(appDir);

        const cryptoState = computeCryptoState({ rootDir, userConfig: ctx.userConfig });
        const buildInfo = deriveBuildInfo(ctx, pkgJson, cryptoState);

        const { main, preload, renderer } = resolveBuildConfig(ctx, pkgJson, buildInfo);
        const { devServer: _r, ...rendererWebpack } = renderer;
        await runProductionBuild([main, preload, rendererWebpack], ctx);

        if (cryptoState.encrypted) {
            await encryptRenderer({ appDir, encryptKey: cryptoState.encryptKey });
            logger.info('AES 加密完成');
        }

        await buildChildAsar({ appDir, distDir, buildInfo });

        logger.success(`child 完成：dist/child-${buildInfo.name}-${buildInfo.env}-v${buildInfo.version}.asar`);
    },
};
