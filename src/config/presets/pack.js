function getPackPreset(ctx, pkgJson) {
    const { createLayout, toOutputRelative } = require('../../paths');
    const { outputFrom } = require('../../pack/pkg');
    const rootDir = process.cwd();
    const layout = createLayout(rootDir);
    const year = new Date().getFullYear();
    const author = pkgJson.author ?? '';
    const productName = pkgJson.productName ?? pkgJson.name;

    return {
        directories: { output: 'dist' },
        files: [
            { from: outputFrom(layout, rootDir), to: '.' },
            'package.json',
            '!**/node_modules/**',
        ],
        extraMetadata: { main: toOutputRelative(layout, layout.out.main) },

        productName,
        copyright: `Copyright © ${year} ${author}`.trim(),
        artifactName: '${productName}_${os}_${arch}_${env.BC_ENV}_v${version}.${ext}',
    };
}

module.exports = { getPackPreset };
