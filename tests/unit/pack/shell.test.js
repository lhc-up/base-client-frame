const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const { generateShellScripts } = require('../../../src/pack/shell');

const tmpDir = path.join(__dirname, '../../tmp/shell');
const templatesDir = path.join(__dirname, '../../../src/templates/shell');

beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
});
afterEach(() => {
    fse.removeSync(tmpDir);
});

describe('pack/shell', () => {
    test('生成 4 个脚本到 dist/shell/，替换变量', () => {
        const distDir = path.join(tmpDir, 'dist');
        const mergedBuilderConfig = {};
        generateShellScripts({
            rootDir: tmpDir,
            distDir,
            mergedBuilderConfig,
            appName: 'demo',
            appDirName: 'Demo App',
            appId: 'com.demo.app',
            templatesDir,
        });
        const shellDir = path.join(distDir, 'shell');
        const nsh = fs.readFileSync(path.join(shellDir, 'win-installer.nsh'), 'utf8');
        const pre = fs.readFileSync(path.join(shellDir, 'deb-preinstall.sh'), 'utf8');
        expect(nsh).toContain('"demo"');
        expect(nsh).toContain('"Demo App"');
        expect(nsh).toContain('"com.demo.app"');
        expect(pre).toContain('"demo"');
        expect(nsh).not.toContain('\r\n');
        expect(pre).not.toContain('\r\n');
    });

    test('未设置 nsis.include 时注入 dist/shell/win-installer.nsh', () => {
        const mergedBuilderConfig = {};
        generateShellScripts({
            rootDir: tmpDir,
            distDir: path.join(tmpDir, 'dist'),
            mergedBuilderConfig,
            appName: 'demo', appDirName: 'demo', appId: 'com.demo',
            templatesDir,
        });
        expect(mergedBuilderConfig.nsis.include).toBe('dist/shell/win-installer.nsh');
    });

    test('已设置 nsis.include 时不覆盖', () => {
        const mergedBuilderConfig = { nsis: { include: 'build/custom.nsh' } };
        generateShellScripts({
            rootDir: tmpDir,
            distDir: path.join(tmpDir, 'dist'),
            mergedBuilderConfig,
            appName: 'demo', appDirName: 'demo', appId: 'com.demo',
            templatesDir,
        });
        expect(mergedBuilderConfig.nsis.include).toBe('build/custom.nsh');
    });

    test('未设置 deb.fpm 时注入 3 个 hook', () => {
        const mergedBuilderConfig = {};
        generateShellScripts({
            rootDir: tmpDir,
            distDir: path.join(tmpDir, 'dist'),
            mergedBuilderConfig,
            appName: 'demo', appDirName: 'demo', appId: 'com.demo',
            templatesDir,
        });
        expect(mergedBuilderConfig.deb.fpm).toEqual(expect.arrayContaining([
            '--before-install=dist/shell/deb-preinstall.sh',
            '--after-install=dist/shell/deb-postinstall.sh',
            '--after-remove=dist/shell/deb-postrm.sh',
        ]));
    });

    test('已有 deb.fpm 数组（非空）时不追加', () => {
        const mergedBuilderConfig = { deb: { fpm: ['--my-flag'] } };
        generateShellScripts({
            rootDir: tmpDir,
            distDir: path.join(tmpDir, 'dist'),
            mergedBuilderConfig,
            appName: 'demo', appDirName: 'demo', appId: 'com.demo',
            templatesDir,
        });
        expect(mergedBuilderConfig.deb.fpm).toEqual(['--my-flag']);
    });
});
