const path = require('path');
const { resolveBuildConfig } = require('../../../src/config/bc-config');

const fixtureDir = path.join(__dirname, '../../fixtures/bc-config-web');
const pkgJson = { name: 'demo', version: '1.0.0' };
const baseCtx = (over = {}) => ({
    command: 'dev:web',
    target: 'web',
    mode: 'development',
    isDev: true, isProd: false, isApp: false, isWeb: true,
    cliOptions: { config: path.join(fixtureDir, 'bc.config.js') },
    env: { BC_ENV: 'prod' },
    ...over,
});

describe('config/bc-config', () => {
    test('resolveBuildConfig 返回 { web } 当 target=web', () => {
        const { web } = resolveBuildConfig(baseCtx(), pkgJson, { target: 'web', encrypted: false });
        expect(web).toBeDefined();
        expect(web.target).toBe('web');
        expect(web.output.path).toContain('dist');
    });

    test('用户 web.devServer 透传至 web 配置', () => {
        const { web } = resolveBuildConfig(baseCtx(), pkgJson, { target: 'web' });
        expect(web.devServer).toEqual({ port: 9876 });
    });

    test('用户 plugins 与预设 plugins 合并（追加）', () => {
        const userConfigPath = path.join(__dirname, '../../fixtures/bc-config-web-with-plugin/bc.config.js');
        const fs = require('fs');
        fs.mkdirSync(path.dirname(userConfigPath), { recursive: true });
        fs.writeFileSync(userConfigPath, `module.exports = () => ({ web: { plugins: [{ apply: () => {} }] } });`);
        try {
            const { web } = resolveBuildConfig(
                baseCtx({ cliOptions: { config: userConfigPath } }),
                pkgJson,
                { target: 'web' },
            );
            // 预设有 2 个 DefinePlugin + 用户的 1 个 = 3 个
            expect(web.plugins.length).toBe(3);
        } finally {
            fs.rmSync(path.dirname(userConfigPath), { recursive: true, force: true });
        }
    });

    test('--config 路径不存在时抛错', () => {
        expect(() => resolveBuildConfig(
            baseCtx({ cliOptions: { config: '/nonexistent/bc.config.js' } }),
            pkgJson,
            { target: 'web' },
        )).toThrow(/未找到 bc\.config/);
    });

    test('--config 缺省且 cwd 无 bc.config.* 时抛错', () => {
        const emptyDir = path.join(__dirname, '../../fixtures/bc-config-empty');
        const fs = require('fs');
        fs.mkdirSync(emptyDir, { recursive: true });
        const oldCwd = process.cwd();
        try {
            process.chdir(emptyDir);
            expect(() => resolveBuildConfig(
                baseCtx({ cliOptions: {} }),
                pkgJson,
                { target: 'web' },
            )).toThrow(/未找到 bc\.config/);
        } finally {
            process.chdir(oldCwd);
            fs.rmSync(emptyDir, { recursive: true, force: true });
        }
    });

    test('bc.config.mjs 单独存在（无 .js/.cjs）时不命中 → throw 未找到', () => {
        const mjsOnlyDir = path.join(__dirname, '../../fixtures/bc-config-mjs-only');
        const fs = require('fs');
        fs.mkdirSync(mjsOnlyDir, { recursive: true });
        fs.writeFileSync(path.join(mjsOnlyDir, 'bc.config.mjs'), `export default () => ({});`);
        const oldCwd = process.cwd();
        try {
            process.chdir(mjsOnlyDir);
            expect(() => resolveBuildConfig(
                baseCtx({ cliOptions: {} }),
                pkgJson,
                { target: 'web' },
            )).toThrow(/未找到 bc\.config/);
        } finally {
            process.chdir(oldCwd);
            fs.rmSync(mjsOnlyDir, { recursive: true, force: true });
        }
    });
});

describe('config/bc-config (app target)', () => {
    const fs = require('fs');
    const fixtureDir = path.join(__dirname, '../../fixtures/bc-config-app');

    beforeAll(() => {
        fs.mkdirSync(fixtureDir, { recursive: true });
        fs.writeFileSync(path.join(fixtureDir, '.env.prod'), 'BC_ENV=prod\n');
        fs.writeFileSync(path.join(fixtureDir, 'bc.config.js'), `
            module.exports = (ctx) => ({
                main: { plugins: [{ apply: () => {} }] },
                preload: {},
                renderer: { devServer: { port: 8023 } },
            });
        `);
    });
    afterAll(() => { fs.rmSync(fixtureDir, { recursive: true, force: true }); });

    const appCtx = () => ({
        command: 'dev:app',
        target: 'app',
        mode: 'development',
        isDev: true, isProd: false, isApp: true, isWeb: false,
        cliOptions: { config: path.join(fixtureDir, 'bc.config.js') },
        env: { BC_ENV: 'prod' },
    });

    test('target=app 时返回 { main, preload, renderer }', () => {
        const cfgs = resolveBuildConfig(
            appCtx(),
            { name: 'demo', version: '1.0.0' },
            { target: 'app', name: 'demo', version: '1.0.0', env: 'prod', encrypted: false },
        );
        expect(cfgs.main).toBeDefined();
        expect(cfgs.preload).toBeDefined();
        expect(cfgs.renderer).toBeDefined();
        expect(cfgs.web).toBeUndefined();
    });

    test('renderer.devServer 透传至 renderer 配置', () => {
        const { renderer } = resolveBuildConfig(
            appCtx(),
            { name: 'demo', version: '1.0.0' },
            { target: 'app' },
        );
        expect(renderer.devServer).toEqual({ port: 8023 });
    });

    test('main.plugins 用户值 + 预设值合并（追加）', () => {
        const { main } = resolveBuildConfig(
            appCtx(),
            { name: 'demo', version: '1.0.0' },
            { target: 'app' },
        );
        expect(main.plugins.length).toBe(3);
    });
});

describe('bc.config 导出形态兼容（M1/FB-010）', () => {
    const fs = require('fs');
    const cases = path.join(__dirname, '../../fixtures/bc-config-shapes');

    beforeAll(() => {
        fs.mkdirSync(cases, { recursive: true });
        fs.writeFileSync(path.join(cases, 'obj.js'),
            `module.exports = { web: { devServer: { port: 7000 } } };`);
        fs.writeFileSync(path.join(cases, 'fn.js'),
            `module.exports = () => ({ web: { devServer: { port: 7001 } } });`);
        fs.writeFileSync(path.join(cases, 'null.js'), `module.exports = null;`);
        fs.writeFileSync(path.join(cases, 'str.js'), `module.exports = 'bad';`);
    });
    afterAll(() => { fs.rmSync(cases, { recursive: true, force: true }); });

    test('对象式导出 → 直接返回', () => {
        const { web } = resolveBuildConfig(
            baseCtx({ cliOptions: { config: path.join(cases, 'obj.js') } }),
            pkgJson,
            { target: 'web' },
        );
        expect(web.devServer).toEqual({ port: 7000 });
    });

    test('函数式导出 → 调 fn(ctx) 返回（回归）', () => {
        const { web } = resolveBuildConfig(
            baseCtx({ cliOptions: { config: path.join(cases, 'fn.js') } }),
            pkgJson,
            { target: 'web' },
        );
        expect(web.devServer).toEqual({ port: 7001 });
    });

    test('导出 null → throw，错误含 "null"', () => {
        expect(() => resolveBuildConfig(
            baseCtx({ cliOptions: { config: path.join(cases, 'null.js') } }),
            pkgJson,
            { target: 'web' },
        )).toThrow(/bc\.config 必须导出对象或.*收到：null/);
    });

    test('导出字符串 → throw，错误含 "string"', () => {
        expect(() => resolveBuildConfig(
            baseCtx({ cliOptions: { config: path.join(cases, 'str.js') } }),
            pkgJson,
            { target: 'web' },
        )).toThrow(/bc\.config 必须导出对象或.*收到：string/);
    });
});
