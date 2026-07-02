const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const asar = require('@electron/asar');
const { buildChildAsar } = require('../../../src/pack/child-asar');

const tmpRoot = path.join(__dirname, '../../tmp/child-asar');

beforeEach(() => { fse.ensureDirSync(tmpRoot); });
afterEach(() => {
    // Windows 下 asar 内部句柄可能延迟释放，cleanup 失败不影响后续测试
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

describe('pack/child-asar', () => {
    test('打 child-${name}-${env}-v${version}.asar，含完整 app/（含 main），根有 package.json 派生子集', async () => {
        const appDir = path.join(tmpRoot, 'app');
        const distDir = path.join(tmpRoot, 'dist');
        fse.ensureDirSync(path.join(appDir, 'main'));
        fse.ensureDirSync(path.join(appDir, 'preload'));
        fse.ensureDirSync(path.join(appDir, 'renderer'));
        fs.writeFileSync(path.join(appDir, 'main/index.js'), 'main');
        fs.writeFileSync(path.join(appDir, 'preload/index.js'), 'preload');
        fs.writeFileSync(path.join(appDir, 'renderer/index.js'), 'renderer');

        const buildInfo = {
            target: 'app', name: 'plugin-x', productName: 'PluginX', version: '0.2.0',
            env: 'prod', envName: undefined, buildTime: 1700000000000,
            platform: undefined, arch: undefined, dir: false, sign: false, child: true,
            encrypted: false, encryptKey: undefined,
        };

        await buildChildAsar({ appDir, distDir, buildInfo });

        const asarPath = path.join(distDir, 'child-plugin-x-prod-v0.2.0.asar');
        expect(fs.existsSync(asarPath)).toBe(true);

        const extractDir = path.join(tmpRoot, 'extract');
        asar.extractAll(asarPath, extractDir);
        expect(fs.existsSync(path.join(extractDir, 'main/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'preload/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'renderer/index.js'))).toBe(true);

        const pkg = JSON.parse(fs.readFileSync(path.join(extractDir, 'package.json'), 'utf8'));
        expect(pkg.name).toBe('plugin-x');
        expect(pkg.child).toBe(true);
        expect(pkg.encryptKey).toBeUndefined();
        expect(pkg.platform).toBeUndefined();
    });
});
