/**
 * 页面类配置（renderer / web）的通用默认：图片与字体规则、CSS 抽离、CSS 压缩。
 *
 * 与技术栈无关的部分由 frame 统一，Vue / Less / babel 等仍由项目在 bc.config 中配置。
 * 在合并项目配置**之后**执行，只补项目没写的部分，项目写了就以项目为准：
 *
 * | 默认 | 项目怎样覆盖 |
 * |---|---|
 * | 图片规则（`images/`，小于 2KB 内联） | 写一条能匹配 `.png` 的规则 |
 * | 字体规则（`fonts/`） | 写一条能匹配 `.woff2` 的规则 |
 * | 生产环境抽离 CSS 到 `css/` | 在 plugins 中自己 new `MiniCssExtractPlugin` |
 * | 生产环境压缩 CSS（保留 webpack 默认的 JS 压缩） | 写 `optimization.minimizer` |
 *
 * js 文件名（生产环境带 contenthash）在预设的 `output` 中给出，项目写 `output.filename` 即覆盖。
 * CSS loader 由项目的样式规则调用 `styleLoader(ctx)` 取得，见下方。
 */

/** 小于此值的图片内联进 bundle */
const ASSET_INLINE_LIMIT = 2048;

const IMAGE_TEST = /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i;
const FONT_TEST = /\.(woff2?|eot|ttf|otf)$/i;

/**
 * 从项目目录加载依赖（构建工具类依赖由项目安装，frame 不自带）。
 *
 * @param {string} name
 * @param {string} rootDir
 * @returns {*} 模块导出；项目未安装时返回 null
 */
function loadFromProject(name, rootDir) {
    let entry;
    try {
        entry = require.resolve(name, { paths: [rootDir] });
    } catch {
        return null;
    }
    return require(entry);
}

/**
 * 规则的 test 是否匹配给定文件名。只识别 RegExp、字符串（按扩展名结尾）、函数与它们的数组；
 * 也检查 oneOf / rules 中的子规则。
 */
function ruleMatches(rule, fileName) {
    if (!rule || typeof rule !== 'object') return false;
    const tests = Array.isArray(rule.test) ? rule.test : [rule.test];
    for (const test of tests) {
        if (test instanceof RegExp && test.test(fileName)) return true;
        if (typeof test === 'string' && fileName.endsWith(test)) return true;
        if (typeof test === 'function' && test(fileName)) return true;
    }
    for (const nested of [rule.oneOf, rule.rules]) {
        if (!Array.isArray(nested)) continue;
        for (const child of nested) {
            if (ruleMatches(child, fileName)) return true;
        }
    }
    return false;
}

function hasRuleFor(config, fileName) {
    const rules = (config.module && config.module.rules) || [];
    for (const rule of rules) {
        if (ruleMatches(rule, fileName)) return true;
    }
    return false;
}

function assetFilename(dir, isDev) {
    if (isDev) return `${dir}/[name][ext]`;
    return `${dir}/[name].[contenthash:8][ext]`;
}

/**
 * 样式规则使用的第一个 loader：开发环境注入 `<style>`（支持热更新），生产环境抽离为独立 css。
 *
 * CSS 抽离到 `css/`，其中引用的图片、字体在上一级（`images/`、`fonts/`），所以 `publicPath` 为 `../`。
 *
 * @param {{ isDev: boolean }} ctx bc.config 收到的上下文
 * @param {string} [rootDir] 项目根目录，默认 `process.cwd()`
 * @returns {string|{loader: string, options: Object}}
 * @throws {Error} 生产环境下项目未安装 mini-css-extract-plugin
 * @example
 * const { styleLoader } = require('@base-client/frame');
 * { test: /\.css$/, use: [styleLoader(ctx), 'css-loader'] }
 */
function styleLoader(ctx, rootDir = process.cwd()) {
    if (ctx.isDev) return require.resolve('style-loader', { paths: [rootDir] });
    const MiniCssExtractPlugin = loadFromProject('mini-css-extract-plugin', rootDir);
    if (!MiniCssExtractPlugin) {
        throw new Error('[base-client] styleLoader 需要 mini-css-extract-plugin，请在项目中 npm i -D mini-css-extract-plugin');
    }
    return { loader: MiniCssExtractPlugin.loader, options: { publicPath: '../' } };
}

/**
 * 给一份已合并的页面配置补默认（原地修改）。
 *
 * @param {Object} config 预设与项目配置合并后的结果
 * @param {Object} userConfig 项目在 bc.config 中写的这一份配置（判断项目是否写了 minimizer）
 * @param {{ isDev: boolean, rootDir: string }} options
 */
function applyPageDefaults(config, userConfig, { isDev, rootDir }) {
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];

    if (!hasRuleFor(config, 'sample.png')) {
        config.module.rules.push({
            test: IMAGE_TEST,
            type: 'asset',
            parser: { dataUrlCondition: { maxSize: ASSET_INLINE_LIMIT } },
            generator: { filename: assetFilename('images', isDev) },
        });
    }
    if (!hasRuleFor(config, 'sample.woff2')) {
        config.module.rules.push({
            test: FONT_TEST,
            type: 'asset/resource',
            generator: { filename: assetFilename('fonts', isDev) },
        });
    }

    if (isDev) return;

    config.plugins = config.plugins || [];
    const MiniCssExtractPlugin = loadFromProject('mini-css-extract-plugin', rootDir);
    if (MiniCssExtractPlugin) {
        let hasExtract = false;
        for (const plugin of config.plugins) {
            if (plugin instanceof MiniCssExtractPlugin) hasExtract = true;
        }
        if (!hasExtract) {
            config.plugins.push(new MiniCssExtractPlugin({
                filename: 'css/[name].[contenthash:8].css',
                chunkFilename: 'css/[name].[contenthash:8].css',
            }));
        }
    }

    const userMinimizer = userConfig && userConfig.optimization && userConfig.optimization.minimizer;
    if (userMinimizer === undefined) {
        const CssMinimizerPlugin = loadFromProject('css-minimizer-webpack-plugin', rootDir);
        if (CssMinimizerPlugin) {
            config.optimization = config.optimization || {};
            // '...' 保留 webpack 默认的 JS 压缩（terser）
            config.optimization.minimizer = ['...', new CssMinimizerPlugin()];
        }
    }
}

/** 预设中页面类配置的 js 文件名：生产环境带 contenthash，便于缓存与区分版本 */
function pageOutputFilenames(isDev) {
    if (isDev) return { filename: '[name].js', chunkFilename: '[name].js' };
    return { filename: '[name].[contenthash:8].js', chunkFilename: '[name].[contenthash:8].js' };
}

module.exports = {
    applyPageDefaults,
    pageOutputFilenames,
    styleLoader,
    ASSET_INLINE_LIMIT,
    ruleMatches,
};
