const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

// frame 依赖 @base-client/electron-builder：用记录调用的假实现代替
jest.mock('@base-client/electron-builder', () => require('../helpers/mock-electron-builder'));
const asar = require('@electron/asar');

/** 生产环境的入口 js 带 contenthash（`<name>.<hash8>.js`），按入口名找到唯一的那个文件 */
function entryJs(dir, name) {
    const pattern = new RegExp(`^${name}\\.[0-9a-f]{8}\\.js$`);
    const files = fs.readdirSync(dir).filter(file => pattern.test(file));
    expect(files).toHaveLength(1);
    return path.join(dir, files[0]);
}

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
    fs.writeFileSync(path.join(dir, 'src/main/pkg.js'), 'module.exports = { name: "demo", dev: __BC_BUILD__.isPkgDev, devUrl: __BC_BUILD__.devUrl };\n');
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
        require('@base-client/electron-builder')._clearLastCall();

        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');
        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64' });

        expect(fs.existsSync(path.join(dir, 'app/main/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'app/main/pkg.js'))).toBe(true);
        // 打包不是本地调试：dev 为 false、devUrl 为 undefined，均替换为字面量
        const pkgOut = fs.readFileSync(path.join(dir, 'app/main/pkg.js'), 'utf8');
        expect(pkgOut).toMatch(/dev:\s*(false|!1)/);
        expect(pkgOut).toMatch(/devUrl:\s*(undefined|void 0)/);
        expect(pkgOut).not.toContain('__BC_BUILD__');

        const pkgFile = path.join(dir, 'dist/minimal-pack-pkg-prod-v1.0.0.asax');
        expect(fs.existsSync(pkgFile)).toBe(true);

        const out = extract(pkgFile, dir);
        expect(fs.existsSync(path.join(out, 'main/pkg.js'))).toBe(true);
        expect(fs.existsSync(path.join(out, 'main/index.js'))).toBe(false);
        expect(fs.existsSync(path.join(out, 'preload'))).toBe(false);
        expect(fs.existsSync(entryJs(path.join(out, 'renderer'), 'index'))).toBe(true);
        const descriptor = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
        expect(descriptor).toMatchObject({
            name: 'minimal-pack-pkg', version: '1.0.0', env: 'prod',
            main: 'main/pkg.js', renderer: 'renderer/index.html', update: 'renderer/update.html',
        });
        expect('child' in descriptor).toBe(false);
        expect(descriptor.encryptKey).toBeUndefined();

        const lastCall = require('@base-client/electron-builder')._getLastCall();
        const appFiles = lastCall.config.files.find(f => f && f.from === 'app');
        expect(appFiles.filter).toEqual(expect.arrayContaining(['main/**', '!main/pkg.js', 'preload/**']));
        expect(lastCall.config.extraResources).toEqual(expect.arrayContaining([
            { from: 'dist/resources', to: '.' },
        ]));
        expect(fs.existsSync(path.join(dir, 'dist/resources/packages/minimal-pack-pkg-prod-v1.0.0.asar'))).toBe(true);
    }, 120000);

    test('pack --pkg-only：只产出更新包，不编译宿主、不调用 electron-builder', async () => {
        const dir = setupFixture('minimal-pack-pkg-only');
        dirs.push(dir);
        process.chdir(dir);
        require('@base-client/electron-builder')._clearLastCall();

        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');
        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64', pkgOnly: true });

        expect(fs.existsSync(path.join(dir, 'dist/minimal-pack-pkg-only-prod-v1.0.0.asax'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'app/main/pkg.js'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'app/main/index.js'))).toBe(false);
        expect(fs.existsSync(path.join(dir, 'app/preload'))).toBe(false);
        expect(fs.existsSync(path.join(dir, 'dist/shell'))).toBe(false);
        expect(require('@base-client/electron-builder')._getLastCall()).toBeFalsy();
    }, 120000);
});
