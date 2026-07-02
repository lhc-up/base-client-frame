const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const logger = require('../core/logger');
const { extractStatsSummary } = require('./format-stats');
const { createCompileSpinner } = require('./compile-spinner');

function resolveDevServerOptions(ctx, userDev, { defaultPort }) {
    const host = ctx.cliOptions.host ?? userDev.host ?? 'localhost';
    const port = ctx.cliOptions.port ?? userDev.port ?? defaultPort;
    return {
        historyApiFallback: true,
        ...userDev,
        host,
        port,
        hot: true,
        open: ctx.isWeb,
        devMiddleware: {
            stats: false,
            ...(userDev.devMiddleware || {}),
        },
    };
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

module.exports = { resolveDevServerOptions, runDevServer };
