const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const logger = require('../core/logger');
const { extractStatsSummary } = require('./format-stats');
const { createCompileSpinner } = require('./compile-spinner');
const { resolveFreePort } = require('./free-port');

function resolveDevServerOptions(ctx, userDev, { defaultPort }) {
    const host = ctx.cliOptions.host ?? userDev.host ?? 'localhost';
    const port = ctx.cliOptions.port ?? userDev.port ?? defaultPort;
    const hot = userDev.hot ?? true;
    const open = userDev.open ?? ctx.isWeb;
    logger.debug(`devServer 最终配置：host=${host} port=${port} hot=${hot} open=${open}`);
    return {
        historyApiFallback: true,
        ...userDev,
        host,
        port,
        hot,
        open,
        devMiddleware: {
            stats: false,
            ...(userDev.devMiddleware || {}),
        },
    };
}

/**
 * 配置的端口被占用时换成可用端口（见 free-port.js）。须在创建 webpack 编译器之前调用。
 *
 * @param {Object} devServerOptions resolveDevServerOptions 的结果
 * @returns {Promise<Object>} 端口为实际可用端口的新配置
 */
async function withFreePort(devServerOptions) {
    const port = await resolveFreePort({ port: devServerOptions.port, host: devServerOptions.host, warn: logger.warn });
    return { ...devServerOptions, port };
}

async function runDevServer(webpackConfig, devServerOptions, name, ctx) {
    const compiler = webpack(webpackConfig);
    const spinner = createCompileSpinner('编译中...', 1);

    compiler.hooks.done.tap('base-client', (stats) => {
        const sum = extractStatsSummary(stats, name);
        spinner.clear();
        if (sum.errorCount > 0) {
            logger.compileFailure(sum.name);
            console.error(stats.toString({ colors: true }));
            spinner.tickInitial();
            return;
        }
        logger.compileSuccess(sum.name, sum.ms, sum.totalSize);
        logger.compileWarning(sum.name, sum.warningCount);
        const url = `http://${devServerOptions.host}:${devServerOptions.port}`;
        logger.footer({ env: ctx.env, url, target: ctx.target });
        spinner.tickInitial();
    });

    const server = new WebpackDevServer(devServerOptions, compiler);
    spinner.start();
    await server.start();
    return server;
}

module.exports = { resolveDevServerOptions, withFreePort, runDevServer };
