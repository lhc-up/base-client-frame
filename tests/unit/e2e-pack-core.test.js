const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

/** 生产环境的入口 js 带 contenthash（`<name>.<hash8>.js`），按入口名找到唯一的那个文件 */
function entryJs(dir, name) {
    const pattern = new RegExp(`^${name}\\.[0-9a-f]{8}\\.js$`);
    const files = fs.readdirSync(dir).filter(file => pattern.test(file));
    expect(files).toHaveLength(1);
    return path.join(dir, files[0]);
}

const sourceFixtureDir = path.join(__dirname, '../fixtures/minimal-pack');
const fixtureDir = path.join(__dirname, '../fixtures/minimal-pack-core');

describe('E2E: pack 核心阶段编排（mock electron-builder）', () => {
    let oldCwd;

    beforeAll(() => {
        fse.copySync(sourceFixtureDir, fixtureDir);
        const pkgPath = path.join(fixtureDir, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        pkg.name = 'minimal-pack-core';
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));
        oldCwd = process.cwd();
        process.chdir(fixtureDir);
    });

    afterAll(() => {
        process.chdir(oldCwd);
        try { fs.rmSync(fixtureDir, { recursive: true, force: true }); } catch {}
    });

    beforeEach(() => {
        const ebPath = path.join(fixtureDir, 'node_modules/electron-builder/out/index.js');
        delete require.cache[ebPath];
    });

    test('pack 跑通：app/ 宿主 + 包产物 + dist/shell/* + 调 electron-builder.build', async () => {
        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');
        const infoSpy = jest.spyOn(require('../../src/core/logger'), 'info').mockImplementation(() => {});
        try {
            await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64' });

            expect(fs.existsSync(path.join(fixtureDir, 'app/main/index.js'))).toBe(true);
            expect(fs.existsSync(path.join(fixtureDir, 'app/preload/index.js'))).toBe(true);
            expect(fs.existsSync(entryJs(path.join(fixtureDir, 'app/renderer'), 'index'))).toBe(true);
            expect(fs.existsSync(entryJs(path.join(fixtureDir, 'app/renderer'), 'update'))).toBe(true);
            expect(fs.existsSync(path.join(fixtureDir, 'app/renderer/update.html'))).toBe(true);

            expect(fs.existsSync(path.join(fixtureDir, 'dist/shell/win-installer.nsh'))).toBe(true);
            expect(fs.existsSync(path.join(fixtureDir, 'dist/shell/deb-preinstall.sh'))).toBe(true);

            const builderPath = path.join(fixtureDir, 'node_modules/electron-builder/out/index.js');
            const builder = require(builderPath);
            const lastCall = builder._getLastCall();
            expect(lastCall).toBeTruthy();
            expect(lastCall.win).toEqual(['nsis']);
            expect(lastCall.x64).toBe(true);
            expect(lastCall.config.appId).toBe('com.test.minimal');
            expect(lastCall.config.productName).toBe('MinimalPack');
            expect(lastCall.config.nsis.include).toBe('dist/shell/win-installer.nsh');

            expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/清空 dist\//));
        } finally {
            infoSpy.mockRestore();
        }
    }, 60000);

    test('pack --dir 时 targets 改为 dir', async () => {
        fse.removeSync(path.join(fixtureDir, 'app'));
        try { fs.rmSync(path.join(fixtureDir, 'dist'), { recursive: true, force: true }); } catch {}

        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');
        const builderPath = path.join(fixtureDir, 'node_modules/electron-builder/out/index.js');
        delete require.cache[builderPath];

        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64', dir: true });

        const builder = require(builderPath);
        const lastCall = builder._getLastCall();
        expect(lastCall.win).toEqual(['dir']);
    }, 60000);
});
