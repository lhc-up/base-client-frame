const { TARGETS } = require('./target');

function deriveBuildInfo(ctx, pkgJson, cryptoState = {}) {
    const { target, command, cliOptions = {}, env = {} } = ctx;
    const { encrypted = false, encryptKey } = cryptoState;

    const isApp = target === TARGETS.APP;
    const isPack = command === 'pack';
    const isChild = command === 'child';

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
        child: isChild,
        encrypted: isApp ? !!encrypted : false,
        encryptKey: (isApp && encrypted) ? encryptKey : undefined,
    };
}

module.exports = { deriveBuildInfo };
