const path = require('path');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { deriveBuildInfo } = require('../../core/build-info');
const { resolveBuildConfig } = require('../../config/bc-config');
const { resolveDevServerOptions, runDevServer } = require('../../webpack-runner/run-dev-server');

module.exports = {
    name: 'dev:web',
    aliases: ['dev'],
    description: '启动 web target 开发服务器（浏览器 SPA）',
    target: TARGETS.WEB,
    mode: MODES.DEV,
    needsBcConfig: true,
    needsBuilderConfig: false,
    options: [
        ['--port <n>', 'dev server 端口（默认 9000）'],
        ['--host <host>', 'dev server host（默认 localhost）'],
    ],
    action: async (ctx) => {
        const pkgJson = require(path.resolve(process.cwd(), 'package.json'));
        const buildInfo = deriveBuildInfo(ctx, pkgJson);

        const { web } = resolveBuildConfig(ctx, pkgJson, buildInfo);
        const { devServer: userDev = {}, ...webpackConfig } = web;
        const devServerOptions = resolveDevServerOptions(ctx, userDev, { defaultPort: 9000 });

        const devServer = await runDevServer(webpackConfig, devServerOptions, 'web', ctx);

        const shutdown = async (exitCode = 0) => {
            try { await devServer.stop(); } catch {}
            process.exit(exitCode);
        };
        process.on('SIGINT', () => shutdown(130));
        process.on('SIGTERM', () => shutdown(143));
    },
};
