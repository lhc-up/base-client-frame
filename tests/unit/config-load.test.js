const fs = require('fs');
const path = require('path');
const { withTempCwd } = require('./_helpers');
const { loadUserConfig } = require('../../src/config');

describe('loadUserConfig', () => {
    let tmp;
    beforeEach(() => { tmp = withTempCwd(); });
    afterEach(() => { tmp.cleanup(); });

    test('cwd 无 bc.config.* 时抛错', () => {
        expect(() => loadUserConfig()).toThrow(/未找到 bc.config/);
    });

    test('cwd 有 bc.config.js → 返回函数', () => {
        fs.writeFileSync(
            path.join(tmp.dir, 'bc.config.js'),
            'module.exports = (ctx) => ({ main: { devtool: false } });\n'
        );
        const fn = loadUserConfig();
        expect(typeof fn).toBe('function');
        expect(fn({})).toEqual({ main: { devtool: false } });
    });

    test('cwd 有 bc.config.cjs → 也能加载', () => {
        fs.writeFileSync(
            path.join(tmp.dir, 'bc.config.cjs'),
            'module.exports = () => ({ main: { mode: "production" } });\n'
        );
        expect(loadUserConfig()).toBeInstanceOf(Function);
    });

    test('.js 优先于 .cjs（同时存在时取 .js）', () => {
        fs.writeFileSync(
            path.join(tmp.dir, 'bc.config.js'),
            'module.exports = () => ({ tag: "js" });\n'
        );
        fs.writeFileSync(
            path.join(tmp.dir, 'bc.config.cjs'),
            'module.exports = () => ({ tag: "cjs" });\n'
        );
        expect(loadUserConfig()({}).tag).toBe('js');
    });

    test('cwd 仅有 bc.config.mjs → 抛"暂不支持"错', () => {
        fs.writeFileSync(
            path.join(tmp.dir, 'bc.config.mjs'),
            'export default () => ({});\n'
        );
        expect(() => loadUserConfig()).toThrow(/bc\.config\.mjs 暂不支持/);
    });

    test('bc.config.js 导出对象（非函数）→ 抛错', () => {
        fs.writeFileSync(
            path.join(tmp.dir, 'bc.config.js'),
            'module.exports = { main: {} };\n'
        );
        expect(() => loadUserConfig()).toThrow(/必须导出函数/);
    });

    test('显式传 configPath（相对 cwd）→ 不走探测', () => {
        fs.writeFileSync(
            path.join(tmp.dir, 'bc.config.js'),
            'module.exports = () => ({ tag: "cwd" });\n'
        );
        fs.mkdirSync(path.join(tmp.dir, 'configs'));
        fs.writeFileSync(
            path.join(tmp.dir, 'configs', 'custom.js'),
            'module.exports = () => ({ tag: "custom" });\n'
        );
        const fn = loadUserConfig('configs/custom.js');
        expect(fn({}).tag).toBe('custom');
    });

    test('显式 configPath 不存在 → 抛 Node 原生 MODULE_NOT_FOUND 错', () => {
        expect(() => loadUserConfig('configs/missing.js')).toThrow();
    });
});
