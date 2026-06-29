const path = require('path');
const fs = require('fs');
const { resolveBuilderConfig } = require('../../../src/config/builder-config');

const fixtureDir = path.join(__dirname, '../../fixtures/builder-config');
const pkgJson = { name: 'demo', productName: 'Demo App', version: '1.0.0' };

beforeAll(() => {
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(path.join(fixtureDir, 'electron-builder.config.js'), `
        module.exports = ({ env, cliOptions, replace }) => ({
            appId: 'com.demo.app',
            win: {
                certificateFile: cliOptions.sign ? 'build/cert.pfx' : undefined,
            },
            files: replace(['package.json', '!**/node_modules/**']),
        });
    `);
});
afterAll(() => { fs.rmSync(fixtureDir, { recursive: true, force: true }); });

const ctx = (over = {}) => ({
    command: 'pack',
    target: 'app',
    mode: 'production',
    isDev: false, isProd: true, isApp: true, isWeb: false,
    cliOptions: { platform: 'win', arch: 'x64', packConfig: path.join(fixtureDir, 'electron-builder.config.js') },
    env: { BC_ENV: 'prod', WIN_CODE_SIGN_PWD: 'pwd' },
    ...over,
});

describe('config/builder-config', () => {
    test('加载 + 合并 preset 与用户配置', () => {
        const c = resolveBuilderConfig(ctx(), pkgJson);
        expect(c.appId).toBe('com.demo.app');
        expect(c.directories.output).toBe('dist');
        expect(c.productName).toBe('Demo App');
    });

    test('用户 files 用 replace 时整组替换 preset.files', () => {
        const c = resolveBuilderConfig(ctx(), pkgJson);
        expect(c.files).toEqual(['package.json', '!**/node_modules/**']);
    });

    test('--sign 时用户分支启用 certificateFile', () => {
        const c = resolveBuilderConfig(ctx({ cliOptions: { ...ctx().cliOptions, sign: true } }), pkgJson);
        expect(c.win.certificateFile).toBe('build/cert.pfx');
    });

    test('未传 --sign 时 certificateFile 为 undefined', () => {
        const c = resolveBuilderConfig(ctx(), pkgJson);
        expect(c.win.certificateFile).toBeUndefined();
    });

    test('--pack-config 路径不存在时抛错', () => {
        const bad = ctx({ cliOptions: { ...ctx().cliOptions, packConfig: '/nonexistent/eb.config.js' } });
        expect(() => resolveBuilderConfig(bad, pkgJson)).toThrow(/未找到 electron-builder\.config/);
    });

    test('--pack-config 缺省且 cwd 无 electron-builder.config.* 时抛错', () => {
        const emptyDir = path.join(__dirname, '../../fixtures/builder-empty');
        fs.mkdirSync(emptyDir, { recursive: true });
        const oldCwd = process.cwd();
        try {
            process.chdir(emptyDir);
            const noCfg = ctx({ cliOptions: { platform: 'win', arch: 'x64' } });
            expect(() => resolveBuilderConfig(noCfg, pkgJson)).toThrow(/未找到 electron-builder\.config/);
        } finally {
            process.chdir(oldCwd);
            fs.rmSync(emptyDir, { recursive: true, force: true });
        }
    });
});
