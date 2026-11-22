const path = require('path');
const { resolveBuildConfig } = require('../../../src/config/bc-config');
const { CircularDependencyPlugin } = require('../../../src/config/presets/circular-dependency-plugin');

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
            // 预设有 2 个 DefinePlugin + 用户的 1 个 + 循环依赖检测 1 个 = 4 个
            expect(web.plugins.length).toBe(4);
        } finally {
            fs.rmSync(path.dirname(userConfigPath), { recursive: true, force: true });
        }
    });

    test('web 默认加循环依赖检测（警告）；circularDependency 可改为报错或关闭；非法值报错', () => {
        const count = web => web.plugins.filter(p => p instanceof CircularDependencyPlugin);
        const { web } = resolveBuildConfig(baseCtx({ userConfig: {} }), pkgJson, { target: 'web' });
        expect(count(web).map(p => p.mode)).toEqual(['warn']);

        const strict = resolveBuildConfig(baseCtx({ userConfig: { circularDependency: 'error' } }), pkgJson, { target: 'web' });
        expect(count(strict.web).map(p => p.mode)).toEqual(['error']);

        const off = resolveBuildConfig(baseCtx({ userConfig: { circularDependency: false } }), pkgJson, { target: 'web' });
        expect(count(off.web)).toEqual([]);

        expect(() => resolveBuildConfig(baseCtx({ userConfig: { circularDependency: 'off' } }), pkgJson, { target: 'web' }))
            .toThrow('circularDependency');
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

    test('app 的 main / preload / 每份 renderer 都加循环依赖检测；关闭时都不加', () => {
        const info = { target: 'app', name: 'demo', version: '1.0.0', env: 'prod', encrypted: false };
        const modes = config => config.plugins
            .filter(p => p instanceof CircularDependencyPlugin)
            .map(p => p.mode);
        const userConfig = {
            main: {},
            preload: {},
            renderer: [{ name: 'renderer', devServer: { port: 8023 } }, { name: 'other' }],
        };
        const cfgs = resolveBuildConfig(appCtx({ userConfig }), { name: 'demo', version: '1.0.0' }, info);
        expect(modes(cfgs.main)).toEqual(['warn']);
        expect(modes(cfgs.preload)).toEqual(['warn']);
        expect(cfgs.renderer.length).toBeGreaterThanOrEqual(2);
        for (const config of cfgs.renderer) {
            expect(modes(config)).toEqual(['warn']);
        }

        const off = resolveBuildConfig(
            appCtx({ userConfig: { ...userConfig, circularDependency: false } }),
            { name: 'demo', version: '1.0.0' },
            info,
        );
        for (const config of [off.main, off.preload, ...off.renderer]) {
            expect(modes(config)).toEqual([]);
        }
    });

    test('renderer.devServer 透传至 renderer 配置', () => {
        const { renderer } = resolveBuildConfig(
            appCtx(),
            { name: 'demo', version: '1.0.0' },
            { target: 'app' },
        );
        expect(renderer.devServer).toEqual({ port: 8023 });
    });

    test('业务覆盖 main 的 output 时构建直接报错（布局不可覆盖）', () => {
        const configPath = path.join(fixtureDir, 'bc.override-output.config.js');
        fs.writeFileSync(configPath, `module.exports = { main: { output: { path: ${JSON.stringify(path.join(fixtureDir, 'elsewhere'))} } } };`);
        try {
            expect(() => resolveBuildConfig(
                appCtx({ cliOptions: { config: configPath } }),
                { name: 'demo', version: '1.0.0' },
                { target: 'app' },
            )).toThrow(/产物布局由 frame 固定[\s\S]*main\.output\.path/);
        } finally {
            fs.rmSync(configPath, { force: true });
        }
    });

    test('renderer 输出不在页面产物目录时构建报错', () => {
        const configPath = path.join(fixtureDir, 'bc.renderer-outside.config.js');
        fs.writeFileSync(configPath, `module.exports = { renderer: [{ name: 'r', output: { path: ${JSON.stringify(path.join(fixtureDir, 'outside'))} } }] };`);
        try {
            expect(() => resolveBuildConfig(
                appCtx({ cliOptions: { config: configPath } }),
                { name: 'demo', version: '1.0.0' },
                { target: 'app' },
            )).toThrow(/renderer.output.path 期望 .*app\/renderer/);
        } finally {
            fs.rmSync(configPath, { force: true });
        }
    });

    test('renderer 数组逐项合并预设，都输出到页面产物目录；启动页加入提供 devServer 的配置', () => {
        const configPath = path.join(fixtureDir, 'bc.multi-renderer.config.js');
        const rendererDir = path.join(fixtureDir, 'app/renderer');
        fs.writeFileSync(configPath, `
            const renderer = [
                { name: 'extra', entry: { extra: 'src/extra.js' } },
                { name: 'renderer', devServer: { port: 8023 } },
            ];
            module.exports = { main: {}, preload: {}, renderer };
            module.exports.rendererInput = renderer;
        `);
        const updateDir = path.join(fixtureDir, 'src/renderer/update');
        fs.mkdirSync(updateDir, { recursive: true });
        fs.writeFileSync(path.join(updateDir, 'index.js'), '');
        fs.writeFileSync(path.join(updateDir, 'index.ejs'), '');
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
            expect(renderer[0].name).toBe('extra');
            expect(renderer[0].output.path).toBe(rendererDir);
            expect(renderer[0].entry.update).toBeUndefined();
            expect(renderer[1].name).toBe('renderer');
            expect(renderer[1].output.path).toBe(rendererDir);
            expect(renderer[1].devServer).toEqual({ port: 8023 });
            expect(renderer[1].entry.update).toBe(path.join(fixtureDir, 'src/renderer/update/index.js'));
            expect(JSON.stringify(loaded.rendererInput)).toBe(before);
        } finally {
            delete require.cache[configPath];
            fs.rmSync(configPath, { force: true });
            fs.rmSync(path.join(fixtureDir, 'src/renderer'), { recursive: true, force: true });
        }
    });

    test('启动页：frame 加入入口与页面，业务页面排除启动页 chunk；业务自己再写启动页时报错', () => {
        const HtmlWebpackPlugin = require('html-webpack-plugin');
        const updateDir = path.join(fixtureDir, 'src/renderer/update');
        fs.mkdirSync(updateDir, { recursive: true });
        fs.writeFileSync(path.join(updateDir, 'index.js'), '');
        fs.writeFileSync(path.join(updateDir, 'index.ejs'), '');
        const write = (name, body) => {
            const file = path.join(fixtureDir, name);
            fs.writeFileSync(file, body);
            return file;
        };
        const build = configPath => resolveBuildConfig(
            appCtx({ cliOptions: { config: configPath } }),
            { name: 'demo', version: '1.0.0' },
            { target: 'app', name: 'demo', productName: 'Demo' },
        );
        const okPath = write('bc.update-ok.config.js', `
            const HtmlWebpackPlugin = require('html-webpack-plugin');
            module.exports = { main: {}, preload: {}, renderer: {
                plugins: [new HtmlWebpackPlugin({ filename: 'index.html', chunks: ['index'] })],
            } };
        `);
        const dupEntryPath = write('bc.update-dup-entry.config.js', `
            module.exports = { main: {}, preload: {}, renderer: { entry: { update: './x.js' } } };
        `);
        const dupPagePath = write('bc.update-dup-page.config.js', `
            const HtmlWebpackPlugin = require('html-webpack-plugin');
            module.exports = { main: {}, preload: {}, renderer: {
                plugins: [new HtmlWebpackPlugin({ filename: 'update.html', chunks: ['update'] })],
            } };
        `);
        try {
            const { renderer } = build(okPath);
            expect(renderer.entry.update).toBe(path.join(updateDir, 'index.js'));
            const pages = renderer.plugins.filter(p => p instanceof HtmlWebpackPlugin);
            expect(pages).toHaveLength(2);
            expect(pages[0].options.excludeChunks).toEqual(['update']);
            expect(pages[1].options).toMatchObject({
                template: path.join(updateDir, 'index.ejs'),
                filename: 'update.html',
                chunks: ['update'],
                title: 'Demo',
            });

            expect(() => build(dupEntryPath)).toThrow(/启动页由 frame 构建.*renderer\.entry/);
            expect(() => build(dupPagePath)).toThrow(/启动页由 frame 构建.*update\.html/);
        } finally {
            for (const file of [okPath, dupEntryPath, dupPagePath]) {
                delete require.cache[file];
                fs.rmSync(file, { force: true });
            }
            fs.rmSync(path.join(fixtureDir, 'src/renderer'), { recursive: true, force: true });
        }
    });

    test('main.plugins 用户值 + 预设值合并（追加）', () => {
        const { main } = resolveBuildConfig(
            appCtx(),
            { name: 'demo', version: '1.0.0' },
            { target: 'app' },
        );
        // 预设 2 个 + 用户的 1 个 + 循环依赖检测 1 个
        expect(main.plugins.length).toBe(4);
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
