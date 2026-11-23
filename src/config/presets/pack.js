const { LOONG64_ELECTRON_CONFIG } = require('../../electron/loong64');

/** Electron 下载镜像：electron-builder 默认从 GitHub 下载目标平台的 Electron，国内经常连不上 */
const ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';

/**
 * 环境变量指定的镜像：`ELECTRON_MIRROR`，或项目 `.npmrc` 的 `electron_mirror`
 * （经 `npm run` / `npx` 传入为 `npm_config_electron_mirror`）。electron-builder 也读这两个变量。
 *
 * @returns {string|undefined}
 */
function envElectronMirror() {
    return process.env.ELECTRON_MIRROR || process.env.npm_config_electron_mirror;
}

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
    // 其他架构：默认用 npmmirror；环境变量已指定镜像时不设置，以环境变量为准。项目写了 electronDownload 时合并后以项目为准
    if (ctx.cliOptions?.arch === 'loong64') {
        preset.electronVersion = LOONG64_ELECTRON_CONFIG.electronVersion;
        preset.electronDownload = { ...LOONG64_ELECTRON_CONFIG.electronDownload };
    } else if (!envElectronMirror()) {
        preset.electronDownload = { mirror: ELECTRON_MIRROR };
    }

    return preset;
}

module.exports = { getPackPreset, ELECTRON_MIRROR };
