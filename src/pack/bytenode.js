const path = require('path');
const fs = require('fs');

async function bytenodeMain({ rootDir, appDir, mergedBuilderConfig }) {
    let bytenodeEntry;
    try {
        bytenodeEntry = require.resolve('bytenode', { paths: [rootDir] });
    } catch (err) {
        throw new Error(`[base-client] bytenode 未安装，请在项目中 npm i -D bytenode`);
    }
    // require.resolve 会回退到上游 node_modules，且内部有路径缓存（已删的文件仍可能返回旧路径）——
    // 必须校验解析结果落在 rootDir 下且文件实际存在
    const relative = path.relative(rootDir, bytenodeEntry);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(bytenodeEntry)) {
        throw new Error(`[base-client] bytenode 未安装，请在项目中 npm i -D bytenode`);
    }
    delete require.cache[bytenodeEntry];
    const bytenode = require(bytenodeEntry);

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
