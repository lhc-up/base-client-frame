const { TARGETS } = require('./target');

function deriveBuildInfo(ctx, pkgJson, cryptoState = {}) {
    const { target, command, cliOptions = {}, env = {}, isDev = false } = ctx;
    const { encrypted = false, encryptKey } = cryptoState;

    const isApp = target === TARGETS.APP;
    const isPack = command === 'pack';

    return {
        target,
        name: pkgJson.name,
        productName: pkgJson.productName ?? pkgJson.name,
        version: pkgJson.version,
        env: env.BC_ENV,
        envName: env.BC_ENV_NAME,
        buildTime: Date.now(),
        platform: isPack ? cliOptions.platform : undefined,
        arch: isPack ? cliOptions.arch : undefined,
        dir: isPack ? !!cliOptions.dir : false,
        sign: isPack ? !!cliOptions.sign : false,
        encrypted: isApp ? !!encrypted : false,
        encryptKey: (isApp && encrypted) ? encryptKey : undefined,
        // 本地调试：dev 命令（dev:web、dev:app）启动即为 true，与 --env（对接的后台环境）无关
        dev: !!isDev,
        // 本地调试时的页面地址（如 http://localhost:8023/），其他命令下为 undefined。
        // 端口可能来自 bc.config.js，由 dev 命令在构建配置求值之后写入
        devUrl: undefined,
    };
}

module.exports = { deriveBuildInfo };
