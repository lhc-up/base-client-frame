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
});
