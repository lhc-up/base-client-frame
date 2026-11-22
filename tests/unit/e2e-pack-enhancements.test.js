const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const asar = require('@electron/asar');

/** 生产环境的入口 js 带 contenthash（`<name>.<hash8>.js`），按入口名找到唯一的那个文件 */
function entryJs(dir, name) {
    const pattern = new RegExp(`^${name}\\.[0-9a-f]{8}\\.js$`);
    const files = fs.readdirSync(dir).filter(file => pattern.test(file));
    expect(files).toHaveLength(1);
    return path.join(dir, files[0]);
}

const fixtureDir = path.join(__dirname, '../fixtures/minimal-pack-full');

describe('E2E: pack 完整能力（bytenode + 更新包 + 多入口；产物加密暂不支持）', () => {
    let oldCwd;

    beforeAll(() => {
        oldCwd = process.cwd();
        process.chdir(fixtureDir);
    });
    afterAll(() => {
        process.chdir(oldCwd);
        fse.removeSync(path.join(fixtureDir, 'app'));
        fse.removeSync(path.join(fixtureDir, 'dist'));
    });

    beforeEach(() => {
        fse.removeSync(path.join(fixtureDir, 'app'));
        fse.removeSync(path.join(fixtureDir, 'dist'));
        // bc.config.js / electron-builder mock 都需要重新 require
        delete require.cache[path.join(fixtureDir, 'bc.config.js')];
        delete require.cache[path.join(fixtureDir, 'electron-builder.config.js')];
        delete require.cache[path.join(fixtureDir, 'node_modules/electron-builder/out/index.js')];
    });

    test('pack 全开：bytenode loader + 更新包含 update 入口，页面 js 为明文', async () => {
        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');

        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64' });

        // 1. bytenode 路径 A：main/index.js 删除、index.jsc 与 loader.js 产出
        expect(fs.existsSync(path.join(fixtureDir, 'app/main/index.js'))).toBe(false);
        expect(fs.existsSync(path.join(fixtureDir, 'app/main/index.jsc'))).toBe(true);
        const loader = fs.readFileSync(path.join(fixtureDir, 'app/main/loader.js'), 'utf8');
        expect(loader).toContain(`require('./vendor/bytenode')`);
        expect(loader).toContain(`require('./index.jsc')`);
        expect(fs.existsSync(path.join(fixtureDir, 'app/main/vendor/bytenode/package.json'))).toBe(true);

        // 2. extraMetadata.main 被 frame 注入
        const builder = require(path.join(fixtureDir, 'node_modules/electron-builder/out/index.js'));
        const lastCall = builder._getLastCall();
        expect(lastCall.config.extraMetadata.main).toBe('main/loader.js');

        // 3. 不写 encrypt 时不加密：页面与 preload 的 js 都是 webpack 明文产物
        const rendererJs = fs.readFileSync(entryJs(path.join(fixtureDir, 'app/renderer'), 'index'), 'utf8');
        expect(rendererJs).toMatch(/(function|require|module|var|const)/);
        const preloadJs = fs.readFileSync(path.join(fixtureDir, 'app/preload/index.js'), 'utf8');
        expect(preloadJs).toMatch(/(function|require|module|var|const)/);

        // 4. update 入口也产出，同样是明文
        const updateJs = fs.readFileSync(entryJs(path.join(fixtureDir, 'app/renderer'), 'update'), 'utf8');
        expect(updateJs).toMatch(/(function|require|module|var|const)/);

        // 5. 更新包产出：描述文件 + main/pkg.js + renderer/，不含宿主主进程与 preload
        const pkgName = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'package.json'), 'utf8')).name;
        const pkgPath = path.join(fixtureDir, `dist/${pkgName}-prod-v1.0.0.asax`);
        expect(fs.existsSync(pkgPath)).toBe(true);
        const extractDir = path.join(fixtureDir, 'dist/_extract');
        asar.extractAll(pkgPath, extractDir);
        expect(fs.existsSync(entryJs(path.join(extractDir, 'renderer'), 'index'))).toBe(true);
        expect(fs.existsSync(entryJs(path.join(extractDir, 'renderer'), 'update'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'main/pkg.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'main/index.jsc'))).toBe(false);
        expect(fs.existsSync(path.join(extractDir, 'preload'))).toBe(false);

        // 6. 更新包内 package.json 不含 encryptKey
        const pkgDescriptor = JSON.parse(fs.readFileSync(path.join(extractDir, 'package.json'), 'utf8'));
        expect(pkgDescriptor.encryptKey).toBeUndefined();
        expect(pkgDescriptor.encryptIv).toBeUndefined();
        expect(pkgDescriptor.encrypted).toBe(false);
    }, 120000);

    test('pack --dir：仍产出更新包（作为内置包）', async () => {
        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');

        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64', dir: true });

        const pkgName = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'package.json'), 'utf8')).name;
        expect(fs.existsSync(path.join(fixtureDir, `dist/${pkgName}-prod-v1.0.0.asax`))).toBe(true);
    }, 120000);

});

describe('E2E: pack 关闭加密 + 关闭 bytenode（独立 fixture）', () => {
    const offFixtureDir = path.join(__dirname, '../fixtures/minimal-pack-off');
    let oldCwd;

    beforeAll(() => {
        // 用独立 fixture，避开 require.cache 干扰
        fse.copySync(fixtureDir, offFixtureDir);
        const cfgPath = path.join(offFixtureDir, 'bc.config.js');
        const original = fs.readFileSync(cfgPath, 'utf8');
        fs.writeFileSync(cfgPath, original.replace('bytenode: true', 'encrypt: false,\n    bytenode: false'));
        // package.json 改名避免 require 缓存歧义
        const pkgPath = path.join(offFixtureDir, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        pkg.name = 'minimal-pack-off';
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));

        oldCwd = process.cwd();
        process.chdir(offFixtureDir);
    });

    afterAll(() => {
        process.chdir(oldCwd);
        fse.removeSync(offFixtureDir);
    });

    beforeEach(() => {
        delete require.cache[path.join(offFixtureDir, 'node_modules/electron-builder/out/index.js')];
    });

    test('encrypt:false + bytenode:false 时跳过加密、不写 loader.js', async () => {
        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');

        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64' });

        // renderer 入口 js 是原 webpack 文本产物（未加密）
        const rendererJs = fs.readFileSync(entryJs(path.join(offFixtureDir, 'app/renderer'), 'index'), 'utf8');
        expect(rendererJs).toMatch(/function|require|module|var|const/);
        // main/index.js 仍存在（bytenode 跳过）
        expect(fs.existsSync(path.join(offFixtureDir, 'app/main/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(offFixtureDir, 'app/main/loader.js'))).toBe(false);
    }, 120000);
});
