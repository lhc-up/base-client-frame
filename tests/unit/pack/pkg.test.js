const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const asar = require('@electron/asar');
const {
    buildPkgAsar,
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

    test('buildPkgAsar：只含描述文件、main/pkg.js、renderer/', async () => {
        const appDir = path.join(tmpRoot, 'app');
        const distDir = path.join(tmpRoot, 'dist');
        fse.outputFileSync(path.join(appDir, 'main/index.js'), 'host');
        fse.outputFileSync(path.join(appDir, 'main/pkg.js'), 'pkg');
        fse.outputFileSync(path.join(appDir, 'preload/index.js'), 'preload');
        fse.outputFileSync(path.join(appDir, 'renderer/index.html'), '<html>');

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
            name: 'demo', version: '1.2.3', env: 'prod', main: 'main/pkg.js', renderer: 'renderer/',
        });
        expect(descriptor.encryptKey).toBeUndefined();
    });

    test('buildPkgAsar：缺 main/pkg.js 时明确报错', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(appDir);
        await expect(buildPkgAsar({ appDir, distDir: path.join(tmpRoot, 'dist'), buildInfo }))
            .rejects.toThrow(/src\/main\/pkg\.js/);
    });

    test('applyPkgToBuilderConfig：只改写 app→. 项，追加内置包，保留业务配置', () => {
        const config = {
            files: [{ from: 'app', to: '.' }, 'package.json', '!**/node_modules/**'],
            extraResources: [{ from: 'addons', to: 'addons' }],
            appId: 'x',
        };
        const result = applyPkgToBuilderConfig(config, '/abs/dist/demo-prod-v1.2.3.asax');
        expect(result.files[0]).toEqual({
            from: 'app', to: '.', filter: ['main/**', '!main/pkg.js', '!main/pkg.js.map', 'preload/**'],
        });
        expect(result.files.slice(1)).toEqual(['package.json', '!**/node_modules/**']);
        expect(result.extraResources).toEqual([
            { from: 'addons', to: 'addons' },
            { from: '/abs/dist/demo-prod-v1.2.3.asax', to: 'packages/demo-prod-v1.2.3.asar' },
        ]);
        expect(result.appId).toBe('x');
        expect(config.files[0].filter).toBeUndefined();
    });

    test('applyPkgToBuilderConfig：项目 resources/ 整体复制，packages/ 中 .asax 改名为 .asar', () => {
        const rootDir = path.join(tmpRoot, 'proj');
        fse.outputFileSync(path.join(rootDir, 'resources/addons/a.node'), 'x');
        fse.outputFileSync(path.join(rootDir, 'resources/icons/512x512.png'), 'x');
        fse.outputFileSync(path.join(rootDir, 'resources/packages/child-prod-v1.0.0.asax'), 'x');
        fse.outputFileSync(path.join(rootDir, 'resources/packages/other-prod-v2.0.0.asar'), 'x');
        fse.outputFileSync(path.join(rootDir, 'resources/packages/.gitkeep'), '');
        const result = applyPkgToBuilderConfig({ files: [] }, '/abs/dist/demo-prod-v1.2.3.asax', rootDir);
        expect(result.extraResources).toEqual([
            { from: 'resources', to: '.', filter: ['**/*', '!packages/**'] },
            { from: 'resources/packages/child-prod-v1.0.0.asax', to: 'packages/child-prod-v1.0.0.asar' },
            { from: 'resources/packages/other-prod-v2.0.0.asar', to: 'packages/other-prod-v2.0.0.asar' },
            { from: '/abs/dist/demo-prod-v1.2.3.asax', to: 'packages/demo-prod-v1.2.3.asar' },
        ]);
    });

    test('applyPkgToBuilderConfig：没有 resources/ 时只追加自身包', () => {
        const result = applyPkgToBuilderConfig({ files: [] }, '/abs/dist/demo-prod-v1.2.3.asax', path.join(tmpRoot, 'none'));
        expect(result.extraResources).toEqual([{ from: '/abs/dist/demo-prod-v1.2.3.asax', to: 'packages/demo-prod-v1.2.3.asar' }]);
    });

    test('applyPkgToBuilderConfig：内置包与自身包、或 .asax 与 .asar 落盘名冲突时报错', () => {
        const rootDir = path.join(tmpRoot, 'proj');
        fse.outputFileSync(path.join(rootDir, 'resources/packages/demo-prod-v1.2.3.asax'), 'x');
        expect(() => applyPkgToBuilderConfig({ files: [] }, '/abs/dist/demo-prod-v1.2.3.asax', rootDir))
            .toThrow(/与自身包落盘名冲突/);
        fse.removeSync(path.join(rootDir, 'resources/packages/demo-prod-v1.2.3.asax'));
        fse.outputFileSync(path.join(rootDir, 'resources/packages/child-prod-v1.0.0.asar'), 'x');
        fse.outputFileSync(path.join(rootDir, 'resources/packages/child-prod-v1.0.0.asax'), 'x');
        expect(() => applyPkgToBuilderConfig({ files: [] }, '/abs/dist/demo-prod-v1.2.3.asax', rootDir))
            .toThrow(/落盘名冲突：packages\/child-prod-v1\.0\.0\.asar/);
    });
});
