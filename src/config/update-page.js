const path = require('path');
const fse = require('fs-extra');
const { createLayout } = require('../paths');
const { toConfigList } = require('./build-config-list');

/** 启动页入口的 chunk 名 */
const UPDATE_CHUNK = 'update';

/**
 * 启动页规范：项目有 `src/renderer/update/index.js` 时，frame 在渲染进程配置中加入启动页，
 * 沿用业务配置的 loader、别名等，只追加入口与页面。启动页随包分发，位置由布局表决定。
 *
 * - 入口：`src/renderer/update/index.js`，模板：`src/renderer/update/index.ejs`
 * - 产物：布局表的 `out.updatePage`
 * - 业务的其他页面不注入启动页的 chunk（追加到 `excludeChunks`）
 *
 * renderer 为数组时加到提供 devServer 的那一份配置（主页面所在的配置）。
 *
 * @param {Object|Object[]} renderer 已合并的渲染进程配置（原地修改）
 * @param {Object} options
 * @param {string} options.rootDir 项目根目录
 * @param {{ productName?: string, name: string }} options.buildInfo
 * @returns {boolean} 是否加入了启动页
 * @throws {Error} 有启动页入口但缺少模板或 html-webpack-plugin
 */
function applyUpdatePage(renderer, { rootDir, buildInfo }) {
    const { src, out } = createLayout(rootDir);
    if (!fse.existsSync(src.update)) return false;

    const display = p => path.relative(rootDir, p).split(path.sep).join('/');
    if (!fse.existsSync(src.updateTemplate)) {
        throw new Error(`[base-client] 有启动页入口 ${display(src.update)}，但缺少模板 ${display(src.updateTemplate)}`);
    }

    const HtmlWebpackPlugin = requireHtmlWebpackPlugin(rootDir);
    const target = pickPageConfig(renderer);

    const filename = path.relative(out.renderer, out.updatePage).split(path.sep).join('/');
    const entry = target.entry || {};
    if (typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error('[base-client] 有启动页时 renderer.entry 必须是对象形式');
    }
    if (entry[UPDATE_CHUNK]) {
        throw new Error(`[base-client] 启动页由 frame 构建，请从 bc.config 的 renderer.entry 中移除 ${UPDATE_CHUNK}`);
    }
    target.entry = { ...entry, [UPDATE_CHUNK]: src.update };

    const plugins = target.plugins || [];
    for (const plugin of plugins) {
        if (!(plugin instanceof HtmlWebpackPlugin)) continue;
        if (plugin.userOptions && plugin.userOptions.filename === filename) {
            throw new Error(`[base-client] 启动页由 frame 构建，请从 bc.config 中移除输出 ${filename} 的 HtmlWebpackPlugin`);
        }
        // html-webpack-plugin 5 在构造时把 userOptions 合并为 options，运行时读 options，两处都要改
        for (const options of [plugin.userOptions, plugin.options]) {
            if (!options) continue;
            options.excludeChunks = [...(options.excludeChunks || []), UPDATE_CHUNK];
        }
    }
    plugins.push(new HtmlWebpackPlugin({
        template: src.updateTemplate,
        filename,
        chunks: [UPDATE_CHUNK],
        title: buildInfo.productName || buildInfo.name,
    }));
    target.plugins = plugins;
    return true;
}

/**
 * 主页面所在的配置：单个配置即其本身；数组时为提供 devServer 的那一份。
 */
function pickPageConfig(renderer) {
    const list = toConfigList(renderer);
    if (list.length === 1) return list[0];
    const served = list.filter(config => config && config.devServer && typeof config.devServer === 'object');
    if (served.length !== 1) {
        throw new Error('[base-client] renderer 为数组时必须有且只有一份配置提供 devServer，启动页加入该配置');
    }
    return served[0];
}

function requireHtmlWebpackPlugin(rootDir) {
    let entry;
    try {
        entry = require.resolve('html-webpack-plugin', { paths: [rootDir] });
    } catch {
        throw new Error('[base-client] 构建启动页需要 html-webpack-plugin，请在项目中 npm i -D html-webpack-plugin');
    }
    return require(entry);
}

module.exports = { applyUpdatePage, UPDATE_CHUNK };
