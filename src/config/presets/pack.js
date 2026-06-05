function getPackPreset({ rootDir, env, mode, cliOptions, pkgJson }) {
    const year = new Date().getFullYear();
    const author = pkgJson.author ?? '';

    const base = {
        directories: { output: 'dist' },
        files: [
            { from: 'app', to: '.' },
            'package.json',
            '!**/node_modules/**',
        ],
        extraMetadata: { main: 'main/index.js' },

        productName: pkgJson.productName ?? pkgJson.name,
        copyright: `Copyright © ${year} ${author}`,
        artifactName: '${productName}_${os}_${arch}_${env.BC_ENV}_v${version}.${ext}',
    };

    if (cliOptions.arch === 'loong64') {
        base.electronDownload = {
            version: '22.3.27',
            mirror: 'http://ftp.loongnix.cn/electron/LoongArch/',
            customDir: 'v22.3.27',
            platform: 'linux',
            arch: 'loong64',
        };
        base.electronVersion = '22.3.27';
    }

    return base;
}

module.exports = { getPackPreset };
