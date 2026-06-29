function derivePackageDescriptor(buildInfo) {
    return {
        name: buildInfo.name,
        productName: buildInfo.productName,
        version: buildInfo.version,
        env: buildInfo.env,
        envName: buildInfo.envName,
        buildTime: buildInfo.buildTime,
        platform: buildInfo.platform,
        arch: buildInfo.arch,
        unpack: buildInfo.unpack,
        sign: buildInfo.sign,
        child: buildInfo.child,
        encrypted: buildInfo.encrypted,
    };
}

module.exports = { derivePackageDescriptor };
