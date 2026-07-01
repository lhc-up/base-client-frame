const path = require('path');
const fs = require('fs');
const { resolveModule } = require('../core/resolve-module');

async function bytenodeMain({ rootDir, appDir, mergedBuilderConfig }) {
    const bytenode = await resolveModule('bytenode', {
        rootDir,
        missingHint: '[base-client] bytenode 未安装，请在项目中 npm i -D bytenode',
        esmCompat: true,
        clearRequireCache: true,
    });

    const src = path.join(appDir, 'main/index.js');
    const out = path.join(appDir, 'main/index.jsc');
    const loaderPath = path.join(appDir, 'main/loader.js');

    bytenode.compileFile({ filename: src, output: out });

    fs.writeFileSync(loaderPath, `require('bytenode');\nrequire('./index.jsc');\n`);

    if (fs.existsSync(src)) fs.unlinkSync(src);

    if (!mergedBuilderConfig.extraMetadata) mergedBuilderConfig.extraMetadata = {};
    mergedBuilderConfig.extraMetadata.main = 'main/loader.js';
}

module.exports = { bytenodeMain };
