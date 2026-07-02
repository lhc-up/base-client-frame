const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const asar = require('@electron/asar');

const tmpRoot = path.join(__dirname, '../../tmp/incremental');

beforeEach(() => { fse.ensureDirSync(tmpRoot); });
afterEach(() => { fse.removeSync(tmpRoot); });

describe('pack/incremental', () => {
    test('打 .asax 到 dist/${env}-v${version}.asax，含除 main 外所有内容 + 派生 package.json', async () => {
        const { buildIncrementalAsax } = require('../../../src/pack/incremental');

        const appDir = path.join(tmpRoot, 'app');
        const distDir = path.join(tmpRoot, 'dist');
        fse.ensureDirSync(path.join(appDir, 'main'));
        fse.ensureDirSync(path.join(appDir, 'renderer'));
        fse.ensureDirSync(path.join(appDir, 'preload'));
        fs.writeFileSync(path.join(appDir, 'main/index.js'), 'main');
        fs.writeFileSync(path.join(appDir, 'renderer/index.js'), 'renderer');
        fs.writeFileSync(path.join(appDir, 'preload/index.js'), 'preload');

        const buildInfo = {
            target: 'app', name: 'demo', productName: 'Demo', version: '1.2.3',
            env: 'prod', envName: undefined, buildTime: 1700000000000,
            platform: 'win', arch: 'x64', dir: false, sign: false, child: false,
            encrypted: true, encryptKey: 'SHOULD_NOT_LEAK',
        };

        await buildIncrementalAsax({ appDir, distDir, buildInfo });

        const asaxPath = path.join(distDir, 'prod-v1.2.3.asax');
        expect(fs.existsSync(asaxPath)).toBe(true);

        const extractDir = path.join(tmpRoot, 'extract');
        asar.extractAll(asaxPath, extractDir);
        expect(fs.existsSync(path.join(extractDir, 'renderer/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'preload/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'main'))).toBe(false);
        const pkg = JSON.parse(fs.readFileSync(path.join(extractDir, 'package.json'), 'utf8'));
        expect(pkg.name).toBe('demo');
        expect(pkg.version).toBe('1.2.3');
        expect(pkg.encryptKey).toBeUndefined();
        expect(pkg.target).toBeUndefined();
    });
});
