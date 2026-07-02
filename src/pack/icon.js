const path = require('path');
const fse = require('fs-extra');

const PNG_SIZES = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024];

async function adaptIcon({ rootDir, distDir, mergedBuilderConfig }) {
    const iconSrc = path.join(rootDir, 'build/icon.png');
    if (!fse.existsSync(iconSrc)) return;

    const win = mergedBuilderConfig.win || (mergedBuilderConfig.win = {});
    const mac = mergedBuilderConfig.mac || (mergedBuilderConfig.mac = {});
    const linux = mergedBuilderConfig.linux || (mergedBuilderConfig.linux = {});

    if (win.icon && mac.icon && linux.icon) return;

    const Jimp = require('jimp');
    const png2icons = require('png2icons');

    const iconsDir = path.join(distDir, 'icons');
    fse.ensureDirSync(iconsDir);

    const sourceBuf = fse.readFileSync(iconSrc);
    const sourceImg = await Jimp.read(sourceBuf);
    for (const size of PNG_SIZES) {
        const buf = await sourceImg.clone().resize(size, size).getBufferAsync(Jimp.MIME_PNG);
        fse.writeFileSync(path.join(iconsDir, `${size}.png`), buf);
    }

    const ico = png2icons.createICO(sourceBuf, png2icons.BILINEAR, 0, false, true);
    if (ico) fse.writeFileSync(path.join(iconsDir, 'icon.ico'), ico);

    const icns = png2icons.createICNS(sourceBuf, png2icons.BILINEAR, 0);
    if (icns) fse.writeFileSync(path.join(iconsDir, 'icon.icns'), icns);

    if (!win.icon)   win.icon   = 'dist/icons/icon.ico';
    if (!mac.icon)   mac.icon   = 'dist/icons/icon.icns';
    if (!linux.icon) linux.icon = 'dist/icons';
}

module.exports = { adaptIcon };
