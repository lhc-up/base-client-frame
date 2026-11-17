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
        fs.mkdirSync(path.join(fixtureDir, 'src/main'), { recursive: true });
        fs.writeFileSync(path.join(fixtureDir, 'src/main/pkg.js'), 'module.exports = {};\n');
        oldCwd = process.cwd();
        process.chdir(fixtureDir);
    });
    afterAll(() => {
        process.chdir(oldCwd);
        fs.rmSync(fixtureDir, { recursive: true, force: true });
    });
    let oldCwd;

    const appCtx = (over = {}) => ({
        command: 'dev:app',
        target: 'app',
        mode: 'development',
        isDev: true, isProd: false, isApp: true, isWeb: false,
        cliOptions: { config: path.join(fixtureDir, 'bc.config.js') },
        env: { BC_ENV: 'prod' },
        ...over,
    });

    test('缺少 src/main/pkg.js 时报错', () => {
        const pkgEntry = path.join(fixtureDir, 'src/main/pkg.js');
        fs.renameSync(pkgEntry, pkgEntry + '.bak');
        try {
            expect(() => resolveBuildConfig(
                appCtx(),
                { name: 'demo', version: '1.0.0' },
                { target: 'app', name: 'demo', version: '1.0.0', env: 'prod', encrypted: false },
            )).toThrow(/src\/main\/pkg\.js/);
        } finally {
            fs.renameSync(pkgEntry + '.bak', pkgEntry);
        }
    });

    test('main 一份配置含宿主与包两个入口', () => {
        const all = resolveBuildConfig(
            appCtx(),
            { name: 'demo', version: '1.0.0' },
            { target: 'app', name: 'demo', version: '1.0.0', env: 'prod', encrypted: false },
        );
        expect(Object.keys(all.main.entry)).toEqual(['index', 'pkg']);
        expect(all.pkgMain).toBeUndefined();
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

    test('renderer 数组逐项合并预设并保留独立输出目录', () => {
        const configPath = path.join(fixtureDir, 'bc.multi-renderer.config.js');
        const updateDir = path.join(fixtureDir, 'app/update');
        const rendererDir = path.join(fixtureDir, 'app/renderer');
        fs.writeFileSync(configPath, `
            const renderer = [
                { name: 'update', entry: { update: 'src/update/index.js' }, output: { path: ${JSON.stringify(updateDir)} } },
                { name: 'renderer', entry: { main: 'src/electron.js' }, output: { path: ${JSON.stringify(rendererDir)} }, devServer: { port: 8023 } },
            ];
            module.exports = { main: {}, preload: {}, renderer };
            module.exports.rendererInput = renderer;
        `);
        try {
            const loaded = require(configPath);
            const before = JSON.stringify(loaded.rendererInput);
            const { renderer } = resolveBuildConfig(
                appCtx({ cliOptions: { config: configPath } }),
                { name: 'demo', version: '1.0.0' },
                { target: 'app' },
            );

            expect(renderer).toHaveLength(2);
            expect(renderer[0].target).toBe('web');
            expect(renderer[0].name).toBe('update');
            expect(renderer[0].output.path).toBe(updateDir);
            expect(renderer[1].name).toBe('renderer');
            expect(renderer[1].output.path).toBe(rendererDir);
            expect(renderer[1].devServer).toEqual({ port: 8023 });
            expect(JSON.stringify(loaded.rendererInput)).toBe(before);
        } finally {
            delete require.cache[configPath];
            fs.rmSync(configPath, { force: true });
        }
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
