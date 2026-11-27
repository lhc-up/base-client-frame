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
            appInstallDir: '/opt/com.demo.app',
            appId: 'com.demo.app',
            templatesDir,
        });
        const shellDir = path.join(distDir, 'shell');
        const nsh = fs.readFileSync(path.join(shellDir, 'win-installer.nsh'), 'utf8');
        const pre = fs.readFileSync(path.join(shellDir, 'deb-preinstall.sh'), 'utf8');
        const post = fs.readFileSync(path.join(shellDir, 'deb-postinstall.sh'), 'utf8');
        expect(nsh).toContain('Page Custom OsCheckFail OsCheckFailLeave');
        expect(nsh).not.toContain('customInit');
        expect(nsh).not.toMatch(/\{\{[A-Z_]+\}\}/);
        expect(pre).toContain('APP_NAME=demo');
        expect(post).toContain('APP_INSTALL_DIR=/opt/com.demo.app');
        expect(post).toContain('"$APP_INSTALL_DIR/chrome-sandbox"');
        expect(post).not.toContain('/opt/$APP_DIR_NAME');
        // 桌面快捷方式：属主改为该用户、权限 755，不再 4777
        expect(post).toContain('chmod 755');
        expect(post).not.toContain('4777');
        // 升级自旧目录：去掉指向其他目录的同名 update-alternatives 候选
        expect(post).toContain('update-alternatives --list "$APP_NAME"');
        expect(post).toContain('update-alternatives --remove "$APP_NAME" "$OTHER"');
        expect(nsh).not.toContain('\r\n');
        expect(pre).not.toContain('\r\n');
    });

    test('未设置 nsis.include 时注入 dist/shell/win-installer.nsh', () => {
        const mergedBuilderConfig = {};
        generateShellScripts({
            rootDir: tmpDir,
            distDir: path.join(tmpDir, 'dist'),
            mergedBuilderConfig,
            appName: 'demo', appInstallDir: '/opt/com.demo', appId: 'com.demo',
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
            appName: 'demo', appInstallDir: '/opt/com.demo', appId: 'com.demo',
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
            appName: 'demo', appInstallDir: '/opt/com.demo', appId: 'com.demo',
            templatesDir,
        });
        expect(mergedBuilderConfig.deb.fpm).toEqual(expect.arrayContaining([
            '--before-install=dist/shell/deb-preinstall.sh',
            '--after-install=dist/shell/deb-postinstall.sh',
            '--after-remove=dist/shell/deb-postrm.sh',
        ]));
    });

    test('项目 deb.fpm 中的其他参数保留，frame 的脚本参数照样补上；项目已写的脚本参数不重复', () => {
        const mergedBuilderConfig = { deb: { fpm: ['--replaces=guojiajiance', '--after-remove=custom.sh'] } };
        generateShellScripts({
            rootDir: tmpDir,
            distDir: path.join(tmpDir, 'dist'),
            mergedBuilderConfig,
            appName: 'demo', appInstallDir: '/opt/com.demo', appId: 'com.demo',
            templatesDir,
        });
        expect(mergedBuilderConfig.deb.fpm).toEqual([
            '--replaces=guojiajiance',
            '--after-remove=custom.sh',
            '--before-install=dist/shell/deb-preinstall.sh',
            '--after-install=dist/shell/deb-postinstall.sh',
        ]);
    });
});
