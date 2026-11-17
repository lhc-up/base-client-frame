const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const asar = require('@electron/asar');

const sourceFixtureDir = path.join(__dirname, '../fixtures/minimal-pack');

/**
 * 「宿主 + 包」模型：在 minimal-pack 基础上补 src/main/pkg.js。
 * 每个用例独立 fixture 目录，避免 asar 文件句柄锁残留影响清理。
 */
function setupFixture(name) {
    const dir = path.join(__dirname, `../fixtures/${name}`);
    fse.removeSync(dir);
    fse.copySync(sourceFixtureDir, dir);
    const pkgPath = path.join(dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.name = name;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));
    fs.writeFileSync(path.join(dir, 'src/main/pkg.js'), 'module.exports = { name: "demo" };\n');
    return dir;
}

function extract(asarPath, dir) {
    const out = path.join(dir, 'dist/_extract');
    asar.extractAll(asarPath, out);
    return out;
}

describe('E2E: pack（宿主 + 包模型）', () => {
    let oldCwd;
    const dirs = [];

    beforeAll(() => { oldCwd = process.cwd(); });
    afterAll(() => {
        process.chdir(oldCwd);
        for (const dir of dirs) {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        }
    });

    test('pack：产出更新包，安装包只带宿主，更新包作为内置包进入 resources/packages', async () => {
        const dir = setupFixture('minimal-pack-pkg');
        dirs.push(dir);
        process.chdir(dir);
        const ebPath = path.join(dir, 'node_modules/electron-builder/out/index.js');
        delete require.cache[ebPath];

        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');
        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64' });

        expect(fs.existsSync(path.join(dir, 'app/main/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'app/main/pkg.js'))).toBe(true);

        const pkgFile = path.join(dir, 'dist/minimal-pack-pkg-prod-v1.0.0.asar');
        expect(fs.existsSync(pkgFile)).toBe(true);
        expect(fs.existsSync(path.join(dir, 'dist/prod-v1.0.0.asax'))).toBe(false);

        const out = extract(pkgFile, dir);
        expect(fs.existsSync(path.join(out, 'main/pkg.js'))).toBe(true);
        expect(fs.existsSync(path.join(out, 'main/index.js'))).toBe(false);
        expect(fs.existsSync(path.join(out, 'preload'))).toBe(false);
        expect(fs.existsSync(path.join(out, 'renderer/index.js'))).toBe(true);
        const descriptor = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
        expect(descriptor).toMatchObject({
            name: 'minimal-pack-pkg', version: '1.0.0', env: 'prod',
            main: 'main/pkg.js', renderer: 'renderer/',
        });
        expect('child' in descriptor).toBe(false);
        expect(descriptor.encryptKey).toBeUndefined();

        const lastCall = require(ebPath)._getLastCall();
        const appFiles = lastCall.config.files.find(f => f && f.from === 'app');
        expect(appFiles.filter).toEqual(expect.arrayContaining(['main/**', '!main/pkg.js', 'preload/**']));
        expect(lastCall.config.extraResources).toEqual(expect.arrayContaining([
            { from: pkgFile, to: 'packages/minimal-pack-pkg-prod-v1.0.0.asar' },
        ]));
    }, 120000);

    test('pack --pkg-only：只产出更新包，不编译宿主、不调用 electron-builder', async () => {
        const dir = setupFixture('minimal-pack-pkg-only');
        dirs.push(dir);
        process.chdir(dir);
        const ebPath = path.join(dir, 'node_modules/electron-builder/out/index.js');
        delete require.cache[ebPath];

        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');
        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64', pkgOnly: true });

        expect(fs.existsSync(path.join(dir, 'dist/minimal-pack-pkg-only-prod-v1.0.0.asar'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'app/main/pkg.js'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'app/main/index.js'))).toBe(false);
        expect(fs.existsSync(path.join(dir, 'app/preload'))).toBe(false);
        expect(fs.existsSync(path.join(dir, 'dist/shell'))).toBe(false);
        expect(require(ebPath)._getLastCall()).toBeFalsy();
    }, 120000);
});
