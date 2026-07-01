const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const { adaptIcon } = require('../../../src/pack/icon');

const tmpRoot = path.join(__dirname, '../../tmp/icon');

beforeEach(() => { fse.ensureDirSync(tmpRoot); });
afterEach(() => { fse.removeSync(tmpRoot); });

describe('pack/icon (skip conditions)', () => {
    test('build/icon.png 不存在 → 整步跳过，不创建 dist/icons', async () => {
        const distDir = path.join(tmpRoot, 'dist');
        const mergedBuilderConfig = {};
        await adaptIcon({ rootDir: tmpRoot, distDir, mergedBuilderConfig });
        expect(fs.existsSync(path.join(distDir, 'icons'))).toBe(false);
        expect(mergedBuilderConfig.win?.icon).toBeUndefined();
        expect(mergedBuilderConfig.mac?.icon).toBeUndefined();
        expect(mergedBuilderConfig.linux?.icon).toBeUndefined();
    });

    test('三平台 icon 全已显式覆盖 → 整步跳过', async () => {
        fse.ensureDirSync(path.join(tmpRoot, 'build'));
        const Jimp = require('jimp');
        const img = new Jimp(1, 1, 0x000000ff);
        await img.writeAsync(path.join(tmpRoot, 'build/icon.png'));

        const distDir = path.join(tmpRoot, 'dist');
        const mergedBuilderConfig = {
            win: { icon: 'a.ico' },
            mac: { icon: 'b.icns' },
            linux: { icon: 'c' },
        };
        await adaptIcon({ rootDir: tmpRoot, distDir, mergedBuilderConfig });
        expect(fs.existsSync(path.join(distDir, 'icons'))).toBe(false);
        expect(mergedBuilderConfig.win.icon).toBe('a.ico');
        expect(mergedBuilderConfig.mac.icon).toBe('b.icns');
        expect(mergedBuilderConfig.linux.icon).toBe('c');
    });
});

describe('pack/icon (active path)', () => {
    beforeEach(async () => {
        fse.ensureDirSync(path.join(tmpRoot, 'build'));
        const iconSrc = path.join(tmpRoot, 'build/icon.png');
        const Jimp = require('jimp');
        const img = new Jimp(1024, 1024, 0x64C832ff);
        await img.writeAsync(iconSrc);
    }, 30000);

    test('生成 ico + icns + 多尺寸 PNG 到 dist/icons/，并按需注入', async () => {
        const distDir = path.join(tmpRoot, 'dist');
        const mergedBuilderConfig = {};
        await adaptIcon({ rootDir: tmpRoot, distDir, mergedBuilderConfig });

        const iconsDir = path.join(distDir, 'icons');
        expect(fs.existsSync(path.join(iconsDir, 'icon.ico'))).toBe(true);
        expect(fs.existsSync(path.join(iconsDir, 'icon.icns'))).toBe(true);
        expect(fs.existsSync(path.join(iconsDir, '256.png'))).toBe(true);
        expect(fs.existsSync(path.join(iconsDir, '512.png'))).toBe(true);
        expect(fs.existsSync(path.join(iconsDir, '1024.png'))).toBe(true);

        expect(mergedBuilderConfig.win.icon).toBe('dist/icons/icon.ico');
        expect(mergedBuilderConfig.mac.icon).toBe('dist/icons/icon.icns');
        expect(mergedBuilderConfig.linux.icon).toBe('dist/icons');
    }, 30000);

    test('已写 win.icon 时不覆盖；mac/linux 仍生成并注入', async () => {
        const distDir = path.join(tmpRoot, 'dist');
        const mergedBuilderConfig = { win: { icon: 'user.ico' } };
        await adaptIcon({ rootDir: tmpRoot, distDir, mergedBuilderConfig });
        expect(mergedBuilderConfig.win.icon).toBe('user.ico');
        expect(mergedBuilderConfig.mac.icon).toBe('dist/icons/icon.icns');
        expect(mergedBuilderConfig.linux.icon).toBe('dist/icons');
        expect(fs.existsSync(path.join(distDir, 'icons/icon.ico'))).toBe(true);
    }, 30000);
});
