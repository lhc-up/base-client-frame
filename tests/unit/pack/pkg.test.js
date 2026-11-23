const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const asar = require('@electron/asar');
const {
    buildPkgAsar,
    stageResources,
    applyPkgToBuilderConfig,
    pkgFileName,
} = require('../../../src/pack/pkg');

const tmpRoot = path.join(__dirname, '../../tmp/pkg');

beforeEach(() => { fse.ensureDirSync(tmpRoot); });
afterEach(() => { fse.removeSync(tmpRoot); });

const buildInfo = {
    target: 'app', name: 'demo', productName: 'Demo', version: '1.2.3',
    env: 'prod', envName: undefined, buildTime: 1700000000000,
    platform: 'win', arch: 'x64', dir: false, sign: false,
    encrypted: false, encryptKey: 'SHOULD_NOT_LEAK',
};

describe('pack/pkg', () => {
    test('pkgFileName：<name>-<env>-v<version>.asax', () => {
        expect(pkgFileName(buildInfo)).toBe('demo-prod-v1.2.3.asax');
    });

    test('buildPkgAsar：只含描述文件、main/pkg.js、renderer/；描述文件记录包内入口', async () => {
        const appDir = path.join(tmpRoot, 'app');
        const distDir = path.join(tmpRoot, 'dist');
        fse.outputFileSync(path.join(appDir, 'main/index.js'), 'host');
        fse.outputFileSync(path.join(appDir, 'main/pkg.js'), 'pkg');
        fse.outputFileSync(path.join(appDir, 'preload/index.js'), 'preload');
        fse.outputFileSync(path.join(appDir, 'renderer/index.html'), '<html>');
        fse.outputFileSync(path.join(appDir, 'renderer/update.html'), '<html>');

        const out = await buildPkgAsar({ appDir, distDir, buildInfo });
        expect(out).toBe(path.join(distDir, 'demo-prod-v1.2.3.asax'));

        const extractDir = path.join(tmpRoot, 'extract');
        asar.extractAll(out, extractDir);
        expect(fs.readFileSync(path.join(extractDir, 'main/pkg.js'), 'utf8')).toBe('pkg');
        expect(fs.existsSync(path.join(extractDir, 'renderer/index.html'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'main/index.js'))).toBe(false);
        expect(fs.existsSync(path.join(extractDir, 'preload'))).toBe(false);

        const descriptor = JSON.parse(fs.readFileSync(path.join(extractDir, 'package.json'), 'utf8'));
        expect(descriptor).toMatchObject({
            name: 'demo', version: '1.2.3', env: 'prod',
            main: 'main/pkg.js', renderer: 'renderer/index.html', update: 'renderer/update.html',
        });
        expect(descriptor.encryptKey).toBeUndefined();
    });

    test('buildPkgAsar：没有启动页时描述文件不写 update', async () => {
        const appDir = path.join(tmpRoot, 'app');
        // @electron/asar 按路径缓存归档头，换一个输出目录避免读到上一个用例的缓存
        const distDir = path.join(tmpRoot, 'dist-no-update');
        fse.outputFileSync(path.join(appDir, 'main/pkg.js'), 'pkg');
        fse.outputFileSync(path.join(appDir, 'renderer/index.html'), '<html>');

        const out = await buildPkgAsar({ appDir, distDir, buildInfo });
        const extractDir = path.join(tmpRoot, 'extract');
        asar.extractAll(out, extractDir);
        const descriptor = JSON.parse(fs.readFileSync(path.join(extractDir, 'package.json'), 'utf8'));
        expect(descriptor.renderer).toBe('renderer/index.html');
        expect('update' in descriptor).toBe(false);
    });

    test('buildPkgAsar：缺包主进程或主页面时明确报错', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(appDir);
        await expect(buildPkgAsar({ appDir, distDir: path.join(tmpRoot, 'dist'), buildInfo }))
            .rejects.toThrow(/未找到包产物 main\/pkg\.js/);
        fse.outputFileSync(path.join(appDir, 'main/pkg.js'), 'pkg');
        await expect(buildPkgAsar({ appDir, distDir: path.join(tmpRoot, 'dist'), buildInfo }))
            .rejects.toThrow(/未找到包产物 renderer\/index\.html/);
    });

    test('applyPkgToBuilderConfig：只改写 app→. 项，整理好的目录整体复制，保留业务配置', () => {
        const rootDir = path.join(tmpRoot, 'proj');
        const config = {
            files: [{ from: 'app', to: '.' }, 'package.json', '!**/node_modules/**'],
            extraResources: [{ from: 'addons', to: 'addons' }],
            appId: 'x',
        };
        const result = applyPkgToBuilderConfig(config, path.join(rootDir, 'dist/resources'), rootDir);
        expect(result.files[0]).toEqual({
            from: 'app', to: '.', filter: ['main/**', '!main/pkg.js', '!main/pkg.js.map', 'preload/**'],
        });
        expect(result.files.slice(1)).toEqual(['package.json', '!**/node_modules/**']);
        expect(result.extraResources).toEqual([
            { from: 'addons', to: 'addons' },
            { from: 'dist/resources', to: '.' },
        ]);
        expect(result.appId).toBe('x');
        expect(config.files[0].filter).toBeUndefined();
    });

    describe('stageResources', () => {
        const rootDir = path.join(tmpRoot, 'proj');
        const distDir = path.join(rootDir, 'dist');
        const pkgPath = path.join(distDir, 'demo-prod-v1.2.3.asax');

        beforeEach(() => { fse.outputFileSync(pkgPath, 'self'); });

        /** 目录下全部文件的相对路径（POSIX） */
        function listFiles(dir) {
            const out = [];
            const walk = sub => {
                for (const name of fs.readdirSync(path.join(dir, sub))) {
                    const rel = sub ? `${sub}/${name}` : name;
                    if (fs.statSync(path.join(dir, rel)).isDirectory()) {
                        walk(rel);
                    } else {
                        out.push(rel);
                    }
                }
            };
            walk('');
            return out.sort();
        }

        test('resources/ 整体复制，packages/ 中 .asax 改名为 .asar，放入自身包', () => {
            fse.outputFileSync(path.join(rootDir, 'resources/addons/a.node'), 'x');
            fse.outputFileSync(path.join(rootDir, 'resources/icons/512x512.png'), 'x');
            fse.outputFileSync(path.join(rootDir, 'resources/packages/child-prod-v1.0.0.asax'), 'child');
            fse.outputFileSync(path.join(rootDir, 'resources/packages/other-prod-v2.0.0.asar'), 'other');

            const stageDir = stageResources({ rootDir, distDir, pkgPath });

            expect(stageDir).toBe(path.join(distDir, 'resources'));
            expect(listFiles(stageDir)).toEqual([
                'addons/a.node',
                'icons/512x512.png',
                'packages/child-prod-v1.0.0.asar',
                'packages/demo-prod-v1.2.3.asar',
                'packages/other-prod-v2.0.0.asar',
            ]);
            expect(fs.readFileSync(path.join(stageDir, 'packages/demo-prod-v1.2.3.asar'), 'utf8')).toBe('self');
            // 项目 resources/ 不被改动
            expect(fs.existsSync(path.join(rootDir, 'resources/packages/child-prod-v1.0.0.asax'))).toBe(true);
        });

        test('版本管理占位与系统生成的文件不复制，同目录业务文件照常复制', () => {
            fse.outputFileSync(path.join(rootDir, 'resources/packages/.gitkeep'), '');
            fse.outputFileSync(path.join(rootDir, 'resources/addons/.gitkeep'), '');
            fse.outputFileSync(path.join(rootDir, 'resources/addons/.gitignore'), '');
            fse.outputFileSync(path.join(rootDir, 'resources/icons/.DS_Store'), '');
            fse.outputFileSync(path.join(rootDir, 'resources/icons/Thumbs.db'), '');
            fse.outputFileSync(path.join(rootDir, 'resources/icons/desktop.ini'), '');
            fse.outputFileSync(path.join(rootDir, 'resources/icons/512x512.png'), 'x');
            fse.outputFileSync(path.join(rootDir, 'resources/addons/.env'), 'x');

            const stageDir = stageResources({ rootDir, distDir, pkgPath });

            expect(listFiles(stageDir)).toEqual([
                'addons/.env',
                'icons/512x512.png',
                'packages/demo-prod-v1.2.3.asar',
            ]);
        });

        test('没有 resources/ 时只放入自身包', () => {
            const stageDir = stageResources({ rootDir, distDir, pkgPath });
            expect(listFiles(stageDir)).toEqual(['packages/demo-prod-v1.2.3.asar']);
        });

        test('重复整理时先清掉上一次的内容', () => {
            fse.outputFileSync(path.join(distDir, 'resources/stale.txt'), 'x');
            const stageDir = stageResources({ rootDir, distDir, pkgPath });
            expect(listFiles(stageDir)).toEqual(['packages/demo-prod-v1.2.3.asar']);
        });

        test('同一个包同时有 .asax 与 .asar 时报错', () => {
            fse.outputFileSync(path.join(rootDir, 'resources/packages/child-prod-v1.0.0.asar'), 'x');
            fse.outputFileSync(path.join(rootDir, 'resources/packages/child-prod-v1.0.0.asax'), 'x');
            expect(() => stageResources({ rootDir, distDir, pkgPath }))
                .toThrow(/落盘名冲突：packages\/child-prod-v1\.0\.0\.asar/);
        });

        test('内置包与自身包同名时报错（.asax 与 .asar 都算）', () => {
            fse.outputFileSync(path.join(rootDir, 'resources/packages/demo-prod-v1.2.3.asax'), 'x');
            expect(() => stageResources({ rootDir, distDir, pkgPath }))
                .toThrow(/与自身包同名的包，落盘名冲突：packages\/demo-prod-v1\.2\.3\.asar/);
            fse.removeSync(path.join(rootDir, 'resources/packages/demo-prod-v1.2.3.asax'));
            fse.outputFileSync(path.join(rootDir, 'resources/packages/demo-prod-v1.2.3.asar'), 'x');
            expect(() => stageResources({ rootDir, distDir, pkgPath }))
                .toThrow(/与自身包同名的包/);
        });
    });
});
