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
    test('pkgFileName：<name>-<env>-v<version>.asar', () => {
        expect(pkgFileName(buildInfo)).toBe('demo-prod-v1.2.3.asar');
    });

    test('buildPkgAsar：只含描述文件、main/pkg.js、renderer/', async () => {
        const appDir = path.join(tmpRoot, 'app');
        const distDir = path.join(tmpRoot, 'dist');
        fse.outputFileSync(path.join(appDir, 'main/index.js'), 'host');
        fse.outputFileSync(path.join(appDir, 'main/pkg.js'), 'pkg');
        fse.outputFileSync(path.join(appDir, 'preload/index.js'), 'preload');
        fse.outputFileSync(path.join(appDir, 'renderer/index.html'), '<html>');

        const out = await buildPkgAsar({ appDir, distDir, buildInfo });
        expect(out).toBe(path.join(distDir, 'demo-prod-v1.2.3.asar'));

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
        const result = applyPkgToBuilderConfig(config, '/abs/dist/demo-prod-v1.2.3.asar');
        expect(result.files[0]).toEqual({
            from: 'app', to: '.', filter: ['main/**', '!main/pkg.js', '!main/pkg.js.map', 'preload/**'],
        });
        expect(result.files.slice(1)).toEqual(['package.json', '!**/node_modules/**']);
        expect(result.extraResources).toEqual([
            { from: 'addons', to: 'addons' },
            { from: '/abs/dist/demo-prod-v1.2.3.asar', to: 'packages/demo-prod-v1.2.3.asar' },
        ]);
        expect(result.appId).toBe('x');
        expect(config.files[0].filter).toBeUndefined();
    });
});
