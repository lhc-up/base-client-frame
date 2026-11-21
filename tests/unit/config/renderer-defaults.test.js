const path = require('path');
const fse = require('fs-extra');
const { applyPageDefaults, styleLoader, pageOutputFilenames } = require('../../../src/config/presets/renderer-defaults');

const tmpRoot = path.join(__dirname, '../../tmp/renderer-defaults');

/** 造一个装了 mini-css-extract-plugin / css-minimizer-webpack-plugin / style-loader 假实现的项目 */
function fakeProject(name, { withCssPlugins = true } = {}) {
    const rootDir = path.join(tmpRoot, name);
    const write = (pkg, source) => {
        const dir = path.join(rootDir, 'node_modules', pkg);
        fse.outputJsonSync(path.join(dir, 'package.json'), { name: pkg, main: 'index.js' });
        fse.outputFileSync(path.join(dir, 'index.js'), source);
    };
    if (withCssPlugins) {
        write('mini-css-extract-plugin', `
            class MiniCssExtractPlugin { constructor(options) { this.options = options; } }
            MiniCssExtractPlugin.loader = 'MINI_CSS_LOADER';
            module.exports = MiniCssExtractPlugin;`);
        write('css-minimizer-webpack-plugin', 'module.exports = class CssMinimizerPlugin {};');
        write('style-loader', 'module.exports = function () {};');
    }
    return rootDir;
}

function rulesFor(config, sample) {
    return config.module.rules.filter(rule => rule.test instanceof RegExp && rule.test.test(sample));
}

describe('config/presets/renderer-defaults', () => {
    afterAll(() => fse.removeSync(tmpRoot));

    test('项目没写：补图片、字体规则，生产环境补 CSS 抽离与 CSS 压缩', () => {
        const rootDir = fakeProject('fill');
        const config = { module: { rules: [{ test: /\.vue$/, loader: 'vue-loader' }] }, plugins: [] };
        applyPageDefaults(config, {}, { isDev: false, rootDir });

        const [image] = rulesFor(config, 'a.png');
        expect(image).toMatchObject({ type: 'asset', parser: { dataUrlCondition: { maxSize: 2048 } } });
        expect(image.generator.filename).toBe('images/[name].[contenthash:8][ext]');
        const [font] = rulesFor(config, 'a.woff2');
        expect(font.generator.filename).toBe('fonts/[name].[contenthash:8][ext]');

        const MiniCssExtractPlugin = require(path.join(rootDir, 'node_modules/mini-css-extract-plugin'));
        const extract = config.plugins.filter(p => p instanceof MiniCssExtractPlugin);
        expect(extract).toHaveLength(1);
        expect(extract[0].options.filename).toBe('css/[name].[contenthash:8].css');

        expect(config.optimization.minimizer[0]).toBe('...');
        expect(config.optimization.minimizer).toHaveLength(2);
    });

    test('开发环境：资源文件名不带 hash，不抽离 CSS、不压缩', () => {
        const rootDir = fakeProject('dev');
        const config = { plugins: [] };
        applyPageDefaults(config, {}, { isDev: true, rootDir });
        expect(rulesFor(config, 'a.png')[0].generator.filename).toBe('images/[name][ext]');
        expect(config.plugins).toEqual([]);
        expect(config.optimization).toBeUndefined();
    });

    test('项目写了就以项目为准：图片 / 字体规则、MiniCssExtractPlugin、minimizer 都不再补', () => {
        const rootDir = fakeProject('override');
        const MiniCssExtractPlugin = require(path.join(rootDir, 'node_modules/mini-css-extract-plugin'));
        const ownExtract = new MiniCssExtractPlugin({ filename: 'my/[name].css' });
        const userConfig = {
            module: {
                rules: [
                    { test: /\.(png|svg)$/, type: 'asset/resource' },
                    { oneOf: [{ test: /\.woff2$/, type: 'asset/inline' }] },
                ],
            },
            plugins: [ownExtract],
            optimization: { minimizer: ['...'] },
        };
        // 预设里没有这些字段，合并结果就是项目配置的一份拷贝
        const config = {
            module: { rules: [...userConfig.module.rules] },
            plugins: [...userConfig.plugins],
            optimization: { minimizer: [...userConfig.optimization.minimizer] },
        };

        applyPageDefaults(config, userConfig, { isDev: false, rootDir });

        expect(config.module.rules).toHaveLength(2);
        expect(config.plugins).toEqual([ownExtract]);
        expect(config.optimization.minimizer).toEqual(['...']);
    });

    test('项目没装 mini-css-extract-plugin / css-minimizer-webpack-plugin：只补资源规则，不报错', () => {
        const rootDir = fakeProject('bare', { withCssPlugins: false });
        const config = {};
        applyPageDefaults(config, {}, { isDev: false, rootDir });
        expect(rulesFor(config, 'a.png')).toHaveLength(1);
        expect(config.plugins).toEqual([]);
        expect(config.optimization).toBeUndefined();
    });

    test('styleLoader：开发环境为 style-loader，生产环境为抽离 loader 且 publicPath 为 ../', () => {
        const rootDir = fakeProject('style');
        expect(styleLoader({ isDev: true }, rootDir)).toBe(require.resolve('style-loader', { paths: [rootDir] }));
        expect(styleLoader({ isDev: false }, rootDir)).toEqual({ loader: 'MINI_CSS_LOADER', options: { publicPath: '../' } });
    });

    test('styleLoader：生产环境未装 mini-css-extract-plugin 时报错并提示安装', () => {
        const rootDir = fakeProject('style-bare', { withCssPlugins: false });
        expect(() => styleLoader({ isDev: false }, rootDir)).toThrow(/npm i -D mini-css-extract-plugin/);
    });

    test('页面 js 文件名：生产环境带 contenthash', () => {
        expect(pageOutputFilenames(true)).toEqual({ filename: '[name].js', chunkFilename: '[name].js' });
        expect(pageOutputFilenames(false)).toEqual({
            filename: '[name].[contenthash:8].js',
            chunkFilename: '[name].[contenthash:8].js',
        });
    });
});
