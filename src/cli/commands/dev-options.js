function resolveDevServerOptions({ cliOptions = {}, userDevServer = {} }) {
    const host = cliOptions.host ?? userDevServer.host ?? 'localhost';
    const port = cliOptions.port ?? userDevServer.port ?? 8023;
    const options = {
        historyApiFallback: true,
        ...userDevServer,
        host,
        port,
        hot: true,
        devMiddleware: {
            stats: false,
            ...(userDevServer.devMiddleware || {}),
        },
    };
    return { options, host, port };
}

module.exports = { resolveDevServerOptions };
