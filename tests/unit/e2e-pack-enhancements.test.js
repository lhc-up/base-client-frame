const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const crypto = require('crypto');
const asar = require('@electron/asar');

const fixtureDir = path.join(__dirname, '../fixtures/minimal-pack-full');

describe('E2E: pack 完整能力（encrypt + bytenode + 更新包 + 多入口）', () => {
    let oldCwd;
    const KEY = '0123456789abcdef0123456789abcdef';
    const IV = 'fedcba9876543210';

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

    test('pack 全开：渲染层加密 + bytenode loader + 更新包含 update 入口', async () => {
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

        // 3. 渲染层加密
        const rendererJsPath = path.join(fixtureDir, 'app/renderer/index.js');
        const rendererBuf = fs.readFileSync(rendererJsPath);
        const iv = Buffer.from(IV, 'utf8');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(KEY, 'utf8'), iv);
        const decrypted = Buffer.concat([decipher.update(rendererBuf), decipher.final()]);
        expect(decrypted.length).toBeGreaterThan(0);
        expect(decrypted.toString('utf8')).toMatch(/(function|require|module|var|const)/);

        // 4. update 入口也产出且加密
        expect(fs.existsSync(path.join(fixtureDir, 'app/renderer/update.js'))).toBe(true);
        const updateBuf = fs.readFileSync(path.join(fixtureDir, 'app/renderer/update.js'));
        const decipher2 = crypto.createDecipheriv('aes-256-cbc', Buffer.from(KEY, 'utf8'), iv);
        Buffer.concat([decipher2.update(updateBuf), decipher2.final()]);

        // 5. 更新包产出：描述文件 + main/pkg.js + renderer/，不含宿主主进程与 preload
        const pkgName = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'package.json'), 'utf8')).name;
        const pkgPath = path.join(fixtureDir, `dist/${pkgName}-prod-v1.0.0.asar`);
        expect(fs.existsSync(pkgPath)).toBe(true);
        const extractDir = path.join(fixtureDir, 'dist/_extract');
        asar.extractAll(pkgPath, extractDir);
        expect(fs.existsSync(path.join(extractDir, 'renderer/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'renderer/update.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'main/pkg.js'))).toBe(true);
        expect(fs.existsSync(path.join(extractDir, 'main/index.jsc'))).toBe(false);
        expect(fs.existsSync(path.join(extractDir, 'preload'))).toBe(false);

        // 6. 更新包内 package.json 不含 encryptKey
        const pkgDescriptor = JSON.parse(fs.readFileSync(path.join(extractDir, 'package.json'), 'utf8'));
        expect(pkgDescriptor.encryptKey).toBeUndefined();
        expect(pkgDescriptor.encryptIv).toBeUndefined();
        expect(pkgDescriptor.encrypted).toBe(true);
    }, 120000);

    test('pack --dir：仍产出更新包（作为内置包）', async () => {
        const cmd = require('../../src/cli/commands/pack');
        const { runCommand } = require('../../src/cli/index');

        await runCommand(cmd, { env: 'prod', platform: 'win', arch: 'x64', dir: true });

        const pkgName = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'package.json'), 'utf8')).name;
        expect(fs.existsSync(path.join(fixtureDir, `dist/${pkgName}-prod-v1.0.0.asar`))).toBe(true);
        expect(fs.existsSync(path.join(fixtureDir, 'dist/prod-v1.0.0.asax'))).toBe(false);
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
        fs.writeFileSync(cfgPath, original
            .replace("encrypt: { key: '0123456789abcdef0123456789abcdef', iv: 'fedcba9876543210' }", 'encrypt: false')
            .replace('bytenode: true', 'bytenode: false'));
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

        // renderer/index.js 是原 webpack 文本产物（未加密）
        const rendererJs = fs.readFileSync(path.join(offFixtureDir, 'app/renderer/index.js'), 'utf8');
        expect(rendererJs).toMatch(/function|require|module|var|const/);
        // main/index.js 仍存在（bytenode 跳过）
        expect(fs.existsSync(path.join(offFixtureDir, 'app/main/index.js'))).toBe(true);
        expect(fs.existsSync(path.join(offFixtureDir, 'app/main/loader.js'))).toBe(false);
    }, 120000);
});
