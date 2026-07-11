const path = require('path');
const fs = require('fs');
const { resolveBuilderConfig } = require('../../../src/config/builder-config');
const logger = require('../../../src/core/logger');

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
    // 对象式 fixture（H1 新增）
    fs.writeFileSync(path.join(fixtureDir, 'electron-builder.config.object.js'), `
        module.exports = {
            appId: 'com.demo.object',
            productName: 'Demo Object',
        };
    `);
    // M2 fixture：用户显式改 directories.output
    fs.writeFileSync(path.join(fixtureDir, 'electron-builder.config.custom-output.js'), `
        module.exports = () => ({
            appId: 'com.demo.custom',
            directories: { output: 'pack' },
        });
    `);
    // M2 fixture：用户显式配 dist（与约定一致，验证不误 warn）
    fs.writeFileSync(path.join(fixtureDir, 'electron-builder.config.explicit-dist.js'), `
        module.exports = () => ({
            appId: 'com.demo.explicit-dist',
            directories: { output: 'dist' },
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

    test('用户 electron-builder.config 导出对象式时正确加载', () => {
        const c = resolveBuilderConfig(
            ctx({ cliOptions: { platform: 'win', arch: 'x64', packConfig: path.join(fixtureDir, 'electron-builder.config.object.js') } }),
            pkgJson,
        );
        expect(c.appId).toBe('com.demo.object');
        // 对象式导出无法用 replace()，preset 的 files 应按 customMerge 默认（追加）规则保留
        expect(c.files).toEqual([
            { from: 'app', to: '.' },
            'package.json',
            '!**/node_modules/**',
        ]);
        // 对象式 fixture 显式配了 productName，customMerge 应让用户值覆盖 preset 的 pkgJson 派生值
        expect(c.productName).toBe('Demo Object');
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

    describe('directories.output 归位（M2）', () => {
        let warnSpy;
        beforeEach(() => {
            warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        });

        test('用户未配 directories.output → 采用 preset 默认 dist、不 warn', () => {
            const c = resolveBuilderConfig(ctx(), pkgJson);
            expect(c.directories.output).toBe('dist');
            expect(warnSpy).not.toHaveBeenCalled();
        });

        test('用户显式配 dist（与约定一致）→ 保持 dist、不 warn', () => {
            const c = resolveBuilderConfig(
                ctx({ cliOptions: { platform: 'win', arch: 'x64', packConfig: path.join(fixtureDir, 'electron-builder.config.explicit-dist.js') } }),
                pkgJson,
            );
            expect(c.directories.output).toBe('dist');
            expect(warnSpy).not.toHaveBeenCalled();
        });

        test('用户显式配非 dist（如 pack）→ 覆盖回 dist 并 logger.warn', () => {
            const c = resolveBuilderConfig(
                ctx({ cliOptions: { platform: 'win', arch: 'x64', packConfig: path.join(fixtureDir, 'electron-builder.config.custom-output.js') } }),
                pkgJson,
            );
            expect(c.directories.output).toBe('dist');
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringMatching(/directories\.output.*pack.*dist/),
            );
        });
    });

    test('electron-builder.config.mjs 单独存在（无 .js/.cjs）时不命中 → throw 未找到', () => {
        const mjsOnlyDir = path.join(__dirname, '../../fixtures/builder-mjs-only');
        fs.mkdirSync(mjsOnlyDir, { recursive: true });
        fs.writeFileSync(path.join(mjsOnlyDir, 'electron-builder.config.mjs'), `export default () => ({});`);
        const oldCwd = process.cwd();
        try {
            process.chdir(mjsOnlyDir);
            const noCfg = ctx({ cliOptions: { platform: 'win', arch: 'x64' } });
            expect(() => resolveBuilderConfig(noCfg, pkgJson)).toThrow(/未找到 electron-builder\.config/);
        } finally {
            process.chdir(oldCwd);
            fs.rmSync(mjsOnlyDir, { recursive: true, force: true });
        }
    });
});
