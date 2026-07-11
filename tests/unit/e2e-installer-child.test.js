const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const asar = require('@electron/asar');

const sourceFixtureDir = path.join(__dirname, '../fixtures/minimal-pack');

describe('E2E: pack --dir → installer 链路（独立 fixture）', () => {
    const installerFixtureDir = path.join(__dirname, '../fixtures/minimal-pack-installer');
    let oldCwd;

    beforeAll(() => {
        fse.copySync(sourceFixtureDir, installerFixtureDir);
        const pkgPath = path.join(installerFixtureDir, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        pkg.name = 'minimal-pack-installer';
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));
        oldCwd = process.cwd();
        process.chdir(installerFixtureDir);
    });
    afterAll(() => {
        process.chdir(oldCwd);
        try { fs.rmSync(installerFixtureDir, { recursive: true, force: true }); } catch {}
    });

    beforeEach(() => {
        fse.removeSync(path.join(installerFixtureDir, 'app'));
        try { fs.rmSync(path.join(installerFixtureDir, 'dist'), { recursive: true, force: true }); } catch {}
        const ebPath = path.join(installerFixtureDir, 'node_modules/electron-builder/out/index.js');
        delete require.cache[ebPath];
    });

    test('pack --dir：产出 dist/<platform>-unpacked/，不产 .asax', async () => {
        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');

        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64', dir: true });

        expect(fs.existsSync(path.join(installerFixtureDir, 'dist/win-unpacked'))).toBe(true);

        const asaxPath = path.join(installerFixtureDir, 'dist/prod-v1.0.0.asax');
        expect(fs.existsSync(asaxPath)).toBe(false);
    }, 120000);

    test('installer：按 CLI 的 platform/arch 推导 unpacked 路径，作 prepackaged 透传', async () => {
        const packCmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');
        await runCommand(packCmd, { env: 'prod', platform: 'win', arch: 'x64', dir: true });

        const ebPath = path.join(installerFixtureDir, 'node_modules/electron-builder/out/index.js');
        delete require.cache[ebPath];

        const installerCmd = require('../../src/cli/commands/installer');
        await runCommand(installerCmd, { env: 'prod', platform: 'win', arch: 'x64' });

        const builder = require(ebPath);
        const lastCall = builder._getLastCall();
        expect(lastCall.win).toEqual(['nsis']);
        expect(lastCall.prepackaged).toBeDefined();
        expect(lastCall.prepackaged).toContain('win-unpacked');
    }, 120000);
});

describe('E2E: child 命令独立（独立 fixture 避免 asar 文件句柄锁残留）', () => {
    const childFixtureDir = path.join(__dirname, '../fixtures/minimal-pack-child');
    let oldCwd;

    beforeAll(() => {
        fse.copySync(sourceFixtureDir, childFixtureDir);
        const pkgPath = path.join(childFixtureDir, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        pkg.name = 'minimal-pack-child';
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));
        oldCwd = process.cwd();
        process.chdir(childFixtureDir);
    });
    afterAll(() => {
        process.chdir(oldCwd);
        try { fs.rmSync(childFixtureDir, { recursive: true, force: true }); } catch {}
    });

    test('child：产 dist/child-${name}-${env}-v${version}.asar，含完整 app/', async () => {
        const cmd = require('../../src/cli/commands/child');
        const { runCommand } = require('../../src/cli/index');
        const infoSpy = jest.spyOn(require('../../src/core/logger'), 'info').mockImplementation(() => {});
        try {
            await runCommand(cmd, { env: 'prod' });

            const asarPath = path.join(childFixtureDir, 'dist/child-minimal-pack-child-prod-v1.0.0.asar');
            expect(fs.existsSync(asarPath)).toBe(true);

            const extractDir = path.join(childFixtureDir, 'dist/_extract');
            asar.extractAll(asarPath, extractDir);
            expect(fs.existsSync(path.join(extractDir, 'main/index.js'))).toBe(true);
            expect(fs.existsSync(path.join(extractDir, 'preload/index.js'))).toBe(true);
            expect(fs.existsSync(path.join(extractDir, 'renderer/index.js'))).toBe(true);

            const pkg = JSON.parse(fs.readFileSync(path.join(extractDir, 'package.json'), 'utf8'));
            expect(pkg.name).toBe('minimal-pack-child');
            expect(pkg.child).toBe(true);
            expect(pkg.encryptKey).toBeUndefined();
            expect(pkg.platform).toBeUndefined();

            expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/清空 dist\//));
            expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/清空 app\//));
        } finally {
            infoSpy.mockRestore();
        }
    }, 120000);
});
