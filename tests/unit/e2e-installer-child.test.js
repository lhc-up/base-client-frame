const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const asar = require('@electron/asar');

const sourceFixtureDir = path.join(__dirname, '../fixtures/minimal-pack');

describe('E2E: pack --unpack → installer 链路（独立 fixture）', () => {
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

    test('pack --unpack：dist/<platform>-unpacked/ + dist/.frame-state.json', async () => {
        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');

        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64', unpack: true });

        expect(fs.existsSync(path.join(installerFixtureDir, 'dist/win-unpacked'))).toBe(true);

        const statePath = path.join(installerFixtureDir, 'dist/.frame-state.json');
        expect(fs.existsSync(statePath)).toBe(true);
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        expect(state.lastUnpack.platform).toBe('win');
        expect(state.lastUnpack.arch).toBe('x64');
        expect(state.lastUnpack.env).toBe('prod');
        expect(state.lastUnpack.version).toBe('1.0.0');
        expect(state.lastUnpack.unpackedPath).toMatch(/win-unpacked/);

        const asaxPath = path.join(installerFixtureDir, 'dist/prod-v1.0.0.asax');
        expect(fs.existsSync(asaxPath)).toBe(false);
    }, 120000);

    test('installer：读 frame-state，调 electron-builder.build 时 prepackaged 含 unpacked 绝对路径', async () => {
        const packCmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');
        await runCommand(packCmd, { env: 'prod', platform: 'win', arch: 'x64', unpack: true });

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
    }, 120000);
});
