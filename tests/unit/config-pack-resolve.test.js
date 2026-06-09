const fs = require('fs');
const path = require('path');
const { withTempCwd } = require('./_helpers');
const { resolvePackConfig } = require('../../src/config/pack');

function writePack(dir, body) {
    fs.writeFileSync(path.join(dir, 'electron-builder.config.js'), body);
}
function writePkg(dir, json) {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(json));
}

describe('resolvePackConfig', () => {
    let tmp;
    beforeEach(() => { tmp = withTempCwd(); });
    afterEach(() => { tmp.cleanup(); });

    test('合并 preset + user → 含用户的 appId / win 配置 + 预设的 files / directories', () => {
        writePkg(tmp.dir, { name: 'demo', author: 'Alice' });
        writePack(
            tmp.dir,
            `module.exports = ({ command, mode, env, cliOptions, replace }) => ({
                  appId: 'com.foo.bar',
                  win: { icon: 'a.ico' },
              });`
        );
        const merged = resolvePackConfig({
            env: { BC_ENV: 'prod' },
            mode: 'production',
            command: 'pack',
            cliOptions: { platform: 'win', arch: 'x64' },
        });
        expect(merged.appId).toBe('com.foo.bar');
        expect(merged.win).toEqual({ icon: 'a.ico' });
        expect(merged.directories).toEqual({ output: 'dist' });
        expect(merged.files).toEqual([
            { from: 'app', to: '.' },
            'package.json',
            '!**/node_modules/**',
        ]);
        expect(merged.productName).toBe('demo');
    });

    test('ctx 完整透传给用户函数（含 replace）', () => {
        writePkg(tmp.dir, { name: 'demo' });
        writePack(
            tmp.dir,
            `module.exports = (ctx) => ({
                  win: { __ctxKeys: Object.keys(ctx).sort().join(','), __replaceIsFn: typeof ctx.replace === 'function' }
              });`
        );
        const merged = resolvePackConfig({
            env: { BC_ENV: 'dev' },
            mode: 'production',
            command: 'pack',
            cliOptions: { platform: 'mac', arch: 'arm64', sign: true },
        });
        expect(merged.win.__ctxKeys).toBe('cliOptions,command,env,isDev,isProd,mode,replace');
        expect(merged.win.__replaceIsFn).toBe(true);
    });

    test('用户 replace(files) → 整组替换预设 files', () => {
        writePkg(tmp.dir, { name: 'demo' });
        writePack(
            tmp.dir,
            `module.exports = ({ replace }) => ({
                  appId: 'com.foo.bar',
                  files: replace(['package.json', '!**/node_modules/**']),
              });`
        );
        const merged = resolvePackConfig({
            env: {}, mode: 'production', command: 'pack',
            cliOptions: { platform: 'win', arch: 'x64' },
        });
        expect(merged.files).toEqual(['package.json', '!**/node_modules/**']);
        expect(merged.files).not.toContainEqual({ from: 'app', to: '.' });
    });

    test('cwd 无 electron-builder.config.* 且未传 --pack-config → 抛错', () => {
        writePkg(tmp.dir, { name: 'demo' });
        expect(() => resolvePackConfig({
            env: {}, mode: 'production', command: 'pack',
            cliOptions: { platform: 'win', arch: 'x64' },
        })).toThrow(/未找到 electron-builder\.config/);
    });

    test('--pack-config 路径优先于 cwd 探测', () => {
        writePkg(tmp.dir, { name: 'demo' });
        writePack(tmp.dir, `module.exports = () => ({ appId: 'com.cwd' });`);
        fs.mkdirSync(path.join(tmp.dir, 'configs'));
        fs.writeFileSync(
            path.join(tmp.dir, 'configs', 'pack.js'),
            `module.exports = () => ({ appId: 'com.custom' });`
        );
        const merged = resolvePackConfig({
            env: {}, mode: 'production', command: 'pack',
            cliOptions: { platform: 'win', arch: 'x64', packConfig: 'configs/pack.js' },
        });
        expect(merged.appId).toBe('com.custom');
    });

    test('electron-builder.config.mjs 命中 → 抛"暂不支持"', () => {
        writePkg(tmp.dir, { name: 'demo' });
        fs.writeFileSync(
            path.join(tmp.dir, 'electron-builder.config.mjs'),
            'export default () => ({})\n'
        );
        expect(() => resolvePackConfig({
            env: {}, mode: 'production', command: 'pack',
            cliOptions: { platform: 'win', arch: 'x64' },
        })).toThrow(/electron-builder\.config\.mjs 暂不支持/);
    });

    test('user 配置非函数 → 抛错', () => {
        writePkg(tmp.dir, { name: 'demo' });
        fs.writeFileSync(
            path.join(tmp.dir, 'electron-builder.config.js'),
            'module.exports = { appId: "com.foo" };'
        );
        expect(() => resolvePackConfig({
            env: {}, mode: 'production', command: 'pack',
            cliOptions: { platform: 'win', arch: 'x64' },
        })).toThrow(/必须导出函数/);
    });
});
