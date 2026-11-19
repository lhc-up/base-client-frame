const { TARGETS } = require('./target');
const logger = require('./logger');

function deriveBuildInfo(ctx, pkgJson, cryptoState = {}) {
    const { target, command, cliOptions = {}, env = {}, isDev = false } = ctx;
    const { encrypted = false, encryptKey } = cryptoState;

    const isApp = target === TARGETS.APP;
    const isPack = command === 'pack';

    // envName 缺失时回退为 env：frame 无法凭空推断展示名，回退值本身即提示。
    // 不回退的话 __BC_BUILD__ 里整个 envName 键会因 JSON.stringify(undefined) 被丢弃，
    // 消费方只能各自兜底，且构建过程毫无提示
    let envName = env.BC_ENV_NAME;
    if (!envName) {
        envName = env.BC_ENV;
        logger.warn(`[build-info] 未声明 BC_ENV_NAME，envName 回退为 env（${envName}）`);
    }

    return {
        target,
        name: pkgJson.name,
        productName: pkgJson.productName ?? pkgJson.name,
        version: pkgJson.version,
        env: env.BC_ENV,
        envName,
        buildTime: Date.now(),
        platform: isPack ? cliOptions.platform : undefined,
        arch: isPack ? cliOptions.arch : undefined,
        dir: isPack ? !!cliOptions.dir : false,
        sign: isPack ? !!cliOptions.sign : false,
        encrypted: isApp ? !!encrypted : false,
        encryptKey: (isApp && encrypted) ? encryptKey : undefined,
        // 本地调试：dev 命令（dev:web、dev:app）启动即为 true，与 --env（对接的后台环境）无关
        isPkgDev: !!isDev,
        // 本地调试时的页面地址（如 http://localhost:8023/），其他命令下为 undefined。
        // 端口可能来自 bc.config.js，由 dev 命令在构建配置求值之后写入
        devUrl: undefined,
    };
}

module.exports = { deriveBuildInfo };
