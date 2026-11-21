const { LOONG64_ELECTRON_CONFIG } = require('../../electron/loong64');

function getPackPreset(ctx, pkgJson) {
    const { createLayout, toOutputRelative } = require('../../paths');
    const { outputFrom } = require('../../pack/pkg');
    const rootDir = process.cwd();
    const layout = createLayout(rootDir);
    const year = new Date().getFullYear();
    const author = pkgJson.author ?? '';
    const productName = pkgJson.productName ?? pkgJson.name;

    const preset = {
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

    // 龙芯：官方 Electron 没有 loong64，改用龙芯镜像（见 electron/loong64.js）
    if (ctx.cliOptions?.arch === 'loong64') {
        preset.electronVersion = LOONG64_ELECTRON_CONFIG.electronVersion;
        preset.electronDownload = { ...LOONG64_ELECTRON_CONFIG.electronDownload };
    }

    return preset;
}

module.exports = { getPackPreset };
