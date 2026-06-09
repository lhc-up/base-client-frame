const fs = require('fs');
const path = require('path');
const { withTempCwd } = require('./_helpers');
const { resolveBuildConfig } = require('../../src/config');

function writeUserConfig(dir, body) {
    fs.writeFileSync(path.join(dir, 'bc.config.js'), body);
}

describe('resolveBuildConfig', () => {
    let tmp;
    beforeEach(() => { tmp = withTempCwd(); });
    afterEach(() => { tmp.cleanup(); });

    test('返回包含 main / preload / renderer 三个键的对象', () => {
        writeUserConfig(tmp.dir, 'module.exports = () => ({});');
        const cfg = resolveBuildConfig({
            env: { BC_X: '1' },
            mode: 'production',
            command: 'build',
            cliOptions: {},
        });
        expect(cfg).toHaveProperty('main');
        expect(cfg).toHaveProperty('preload');
        expect(cfg).toHaveProperty('renderer');
    });

    test('ctx 完整透传给用户函数（command/mode/env/cliOptions）', () => {
        writeUserConfig(
            tmp.dir,
            `module.exports = (ctx) => {
                  return { main: { output: { __ctx: JSON.stringify(ctx) } } };
              };`
        );
        const cfg = resolveBuildConfig({
            env: { BC_API: 'http://x' },
            mode: 'development',
            command: 'dev',
            cliOptions: { port: 9000, debug: true },
        });
        const passedCtx = JSON.parse(cfg.main.output.__ctx);
        expect(passedCtx).toEqual({
            command: 'dev',
            mode: 'development',
            env: { BC_API: 'http://x' },
            cliOptions: { port: 9000, debug: true },
            isDev: true,
            isProd: false,
        });
    });

    test('用户覆盖 main.devtool 生效（标量覆盖）', () => {
        writeUserConfig(
            tmp.dir,
            `module.exports = () => ({ main: { devtool: 'eval-source-map' } });`
        );
        const cfg = resolveBuildConfig({
            env: {},
            mode: 'production',
            command: 'build',
            cliOptions: {},
        });
        expect(cfg.main.devtool).toBe('eval-source-map');
        expect(cfg.preload.devtool).toBe(false);
        expect(cfg.renderer.devtool).toBe(false);
    });

    test('user 追加的 plugins 拼接到预设之后（不替换）', () => {
        writeUserConfig(
            tmp.dir,
            `class Marker {}; module.exports = () => ({ main: { plugins: [new Marker()] } });`
        );
        const cfg = resolveBuildConfig({
            env: { BC_API: 'http://x' },
            mode: 'production',
            command: 'build',
            cliOptions: {},
        });
        expect(cfg.main.plugins.length).toBeGreaterThanOrEqual(2);
        expect(cfg.main.plugins[cfg.main.plugins.length - 1].constructor.name).toBe('Marker');
    });

    test('user 追加的 module.rules 拼接到预设之后', () => {
        writeUserConfig(
            tmp.dir,
            `module.exports = () => ({
                  main: {
                      module: { rules: [{ test: /\\.js$/, use: 'babel-loader' }] }
                  }
              });`
        );
        const cfg = resolveBuildConfig({
            env: {},
            mode: 'production',
            command: 'build',
            cliOptions: {},
        });
        expect(cfg.main.module.rules).toHaveLength(4);
        expect(cfg.main.module.rules[3].use).toBe('babel-loader');
    });

    test('user 在 output 下追加字段（深合并）', () => {
        writeUserConfig(
            tmp.dir,
            `module.exports = () => ({
                  main: { output: { sourcePrefix: '\\t' } }
              });`
        );
        const cfg = resolveBuildConfig({
            env: {},
            mode: 'production',
            command: 'build',
            cliOptions: {},
        });
        expect(cfg.main.output.filename).toBe('index.js');
        expect(cfg.main.output.libraryTarget).toBe('commonjs2');
        expect(cfg.main.output.sourcePrefix).toBe('\t');
    });

    test('renderer.devServer 字段经合并后保留在 renderer 配置里', () => {
        writeUserConfig(
            tmp.dir,
            `module.exports = () => ({
                  renderer: {
                      devServer: { port: 9000, proxy: { '/api': 'http://localhost:3000' } }
                  }
              });`
        );
        const cfg = resolveBuildConfig({
            env: {},
            mode: 'development',
            command: 'dev',
            cliOptions: {},
        });
        expect(cfg.renderer.devServer).toEqual({
            port: 9000,
            proxy: { '/api': 'http://localhost:3000' },
        });
        expect(cfg.renderer.target).toBe('web');
    });

    test('user 只写 renderer 时，main / preload 仍是纯预设', () => {
        writeUserConfig(
            tmp.dir,
            `module.exports = () => ({
                  renderer: { devServer: { port: 8081 } }
              });`
        );
        const cfg = resolveBuildConfig({
            env: {},
            mode: 'production',
            command: 'build',
            cliOptions: {},
        });
        expect(cfg.main.target).toBe('electron-main');
        expect(cfg.preload.target).toBe('electron-preload');
        expect(cfg.renderer.devServer.port).toBe(8081);
    });

    test('cliOptions.config 被 loadUserConfig 接收', () => {
        fs.mkdirSync(path.join(tmp.dir, 'configs'));
        fs.writeFileSync(
            path.join(tmp.dir, 'configs', 'custom.js'),
            `module.exports = () => ({ main: { name: 'custom' } });`
        );
        writeUserConfig(tmp.dir, `module.exports = () => ({ main: { name: 'cwd' } });`);

        const cfg = resolveBuildConfig({
            env: {},
            mode: 'production',
            command: 'build',
            cliOptions: { config: 'configs/custom.js' },
        });
        expect(cfg.main.name).toBe('custom');
    });
});
