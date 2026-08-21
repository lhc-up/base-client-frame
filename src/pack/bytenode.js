const path = require('path');
const fse = require('fs-extra');
const { resolveModule } = require('../core/resolve-module');
const { resolveElectron } = require('../electron/resolve-electron');

function findPackageRoot(entryPath, packageName) {
    let currentDir = path.dirname(entryPath);

    while (true) {
        const packagePath = path.join(currentDir, 'package.json');
        if (fse.existsSync(packagePath)) {
            const packageJson = fse.readJsonSync(packagePath);
            if (packageJson.name === packageName) return currentDir;
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break;
        currentDir = parentDir;
    }

    throw new Error(`[base-client] cannot locate ${packageName} package root`);
}

function assertBytenodeTarget({
    targetPlatform,
    targetArch,
    hostPlatform = process.platform,
    hostArch = process.arch,
} = {}) {
    const platformAliases = { win: 'win32', windows: 'win32', mac: 'darwin', macos: 'darwin' };
    const normalizedTargetPlatform = platformAliases[targetPlatform] || targetPlatform || hostPlatform;
    const normalizedTargetArch = targetArch || hostArch;
    if (normalizedTargetPlatform !== hostPlatform || normalizedTargetArch !== hostArch) {
        throw new Error(
            `[base-client] bytenode must run on the target OS/arch: `
            + `host=${hostPlatform}/${hostArch}, target=${normalizedTargetPlatform}/${normalizedTargetArch}`,
        );
    }
}

async function bytenodeMain({ rootDir, appDir, mergedBuilderConfig, targetPlatform, targetArch }) {
    assertBytenodeTarget({ targetPlatform, targetArch });
    const [bytenode, electronPath] = await Promise.all([
        resolveModule('bytenode', {
            rootDir,
            missingHint: '[base-client] bytenode 未安装，请在项目中 npm i -D bytenode',
            esmCompat: true,
            clearRequireCache: true,
        }),
        resolveElectron(rootDir),
    ]);

    const src = path.join(appDir, 'main/index.js');
    const out = path.join(appDir, 'main/index.jsc');
    const loaderPath = path.join(appDir, 'main/loader.js');
    const bytenodeEntry = require.resolve('bytenode', { paths: [rootDir] });
    const bytenodePackageRoot = findPackageRoot(bytenodeEntry, 'bytenode');
    const runtimeDir = path.join(appDir, 'main/vendor/bytenode');

    await bytenode.compileFile({ filename: src, output: out, electronPath });

    fse.copySync(bytenodePackageRoot, runtimeDir);
    fse.writeFileSync(loaderPath, `require('./vendor/bytenode');\nrequire('./index.jsc');\n`);

    if (fse.existsSync(src)) fse.unlinkSync(src);

    if (!mergedBuilderConfig.extraMetadata) mergedBuilderConfig.extraMetadata = {};
    mergedBuilderConfig.extraMetadata.main = 'main/loader.js';
}

module.exports = { assertBytenodeTarget, bytenodeMain };
