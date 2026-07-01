const path = require('path');
const cp = require('child_process');
const webpack = require('webpack');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { deriveBuildInfo } = require('../../core/build-info');
const { resolveBuildConfig } = require('../../config/bc-config');
const { resolveDevServerOptions, runDevServer } = require('../../webpack-runner/run-dev-server');
const { resolveElectron } = require('../../electron/resolve-electron');
const { resolveMainEntry } = require('../../electron/resolve-main-entry');
const { killElectron } = require('../../electron/kill-electron');
const logger = require('../../core/logger');
const { extractStatsSummary } = require('../../webpack-runner/format-stats');

function compileMainPreload(mainConfig, preloadConfig) {
    return new Promise((resolve, reject) => {
        const compiler = webpack([mainConfig, preloadConfig], (err, multiStats) => {
            const finalize = (action) => compiler.close(() => action());

            if (err) {
                logger.compileFailure('main+preload');
                return finalize(() => reject(err));
            }
            const stats = multiStats.stats;
            let failed = false;
            for (let i = 0; i < stats.length; i += 1) {
                const sum = extractStatsSummary(stats[i], i === 0 ? 'main' : 'preload');
                if (sum.errorCount > 0) {
                    logger.compileFailure(sum.name);
                    console.error(stats[i].toString({ colors: true }));
                    failed = true;
                } else {
                    logger.compileSuccess(sum.name, sum.ms, sum.totalSize);
                    logger.compileWarning(sum.name, sum.warningCount);
                }
            }
            if (failed) return finalize(() => reject(new Error('main / preload 编译失败')));
            finalize(() => resolve());
        });
    });
}

module.exports = {
    name: 'dev:app',
    description: '启动 Electron 三进程开发环境（main+preload 一次性编译，renderer HMR）',
    target: TARGETS.APP,
    mode: MODES.DEV,
    needsBcConfig: true,
    needsBuilderConfig: false,
    options: [
        ['--port <n>', 'renderer dev-server 端口（默认 8023）'],
        ['--host <host>', 'renderer dev-server host（默认 localhost）'],
    ],
    action: async (ctx) => {
        const rootDir = process.cwd();
        const pkgJson = require(path.resolve(rootDir, 'package.json'));
        const buildInfo = deriveBuildInfo(ctx, pkgJson);

        const { main, preload, renderer } = resolveBuildConfig(ctx, pkgJson, buildInfo);

        const { devServer: userDev = {}, ...rendererWebpack } = renderer;
        const devServerOptions = resolveDevServerOptions(ctx, userDev, { defaultPort: 8023 });
        const devUrl = `http://${devServerOptions.host}:${devServerOptions.port}`;

        const [, devServer] = await Promise.all([
            compileMainPreload(main, preload),
            runDevServer(rendererWebpack, devServerOptions, 'renderer', ctx),
        ]);

        const electronExe = await resolveElectron(rootDir);
        const mainEntry = resolveMainEntry(rootDir);
        const child = cp.spawn(electronExe, [mainEntry], {
            stdio: 'inherit',
            env: {
                ...process.env,
                NODE_ENV: 'development',
                RENDERER_DEV_URL: devUrl,
            },
        });

        const shutdown = async (exitCode = 0) => {
            killElectron(child);
            try { await devServer.stop(); } catch {}
            process.exit(exitCode);
        };

        child.on('close', (code) => shutdown(code ?? 0));
        process.on('SIGINT', () => shutdown(130));
    },
};
