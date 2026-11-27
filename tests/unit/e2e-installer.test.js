const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

// frame 直接依赖 @base-client/app-builder-lib：用记录调用的假实现代替
jest.mock('@base-client/app-builder-lib', () => require('../helpers/mock-app-builder-lib'));

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
        require('@base-client/app-builder-lib')._clearLastCall();
    });

    test('pack --dir：产出 dist/<platform>-unpacked/ 与更新包', async () => {
        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');

        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64', dir: true });

        expect(fs.existsSync(path.join(installerFixtureDir, 'dist/win-unpacked'))).toBe(true);

        expect(fs.existsSync(path.join(installerFixtureDir, 'dist/minimal-pack-installer-prod-v1.0.0.asax'))).toBe(true);
    }, 120000);

    test('installer：按 CLI 的 platform/arch 推导 unpacked 路径，作 prepackaged 透传', async () => {
        const packCmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');
        await runCommand(packCmd, { env: 'prod', platform: 'win', arch: 'x64', dir: true });
        require('@base-client/app-builder-lib')._clearLastCall();

        const installerCmd = require('../../src/cli/commands/installer');
        await runCommand(installerCmd, { env: 'prod', platform: 'win', arch: 'x64' });

        const builder = require('@base-client/app-builder-lib');
        const lastCall = builder._getLastCall();
        expect(lastCall.win).toEqual(['nsis']);
        expect(lastCall.prepackaged).toBeDefined();
        expect(lastCall.prepackaged).toContain('win-unpacked');
    }, 120000);
});
