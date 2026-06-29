function getPackPreset(ctx, pkgJson) {
    const year = new Date().getFullYear();
    const author = pkgJson.author ?? '';
    const productName = pkgJson.productName ?? pkgJson.name;

    return {
        directories: { output: 'dist' },
        files: [
            { from: 'app', to: '.' },
            'package.json',
            '!**/node_modules/**',
        ],
        extraMetadata: { main: 'main/index.js' },

        productName,
        copyright: `Copyright © ${year} ${author}`.trim(),
        artifactName: '${productName}_${os}_${arch}_${env.BC_ENV}_v${version}.${ext}',
    };
}

module.exports = { getPackPreset };
