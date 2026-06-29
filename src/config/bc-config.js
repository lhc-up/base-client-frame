const path = require('path');
const fs = require('fs');
const { merge: webpackMerge } = require('webpack-merge');
const { TARGETS } = require('../core/target');
const { getWebPreset } = require('./presets/web');
const { getMainPreset } = require('./presets/main');
const { getPreloadPreset } = require('./presets/preload');
const { getRendererPreset } = require('./presets/renderer');

const CONFIG_NAMES = ['bc.config.js', 'bc.config.cjs', 'bc.config.mjs'];

function locateBcConfig(cwd, explicit) {
    if (explicit) {
        if (!fs.existsSync(explicit)) {
            throw new Error(`[base-client] 未找到 bc.config（--config 指定的路径不存在）：${explicit}`);
        }
        return explicit;
    }
    for (const name of CONFIG_NAMES) {
        const p = path.join(cwd, name);
        if (fs.existsSync(p)) return p;
    }
    throw new Error(`[base-client] 未找到 bc.config.js（cwd=${cwd}）`);
}

function loadUserConfig(configPath, ctx) {
    const loaded = require(configPath);
    const fn = loaded.default ?? loaded;
    if (typeof fn !== 'function') {
        throw new Error(`[base-client] bc.config 必须导出函数 (ctx) => config，收到：${typeof fn}`);
    }
    return fn(ctx) || {};
}

function preloadBcConfig(ctx) {
    const configPath = locateBcConfig(process.cwd(), ctx.cliOptions.config);
    ctx.userConfig = loadUserConfig(configPath, ctx);
}

function resolveBuildConfig(ctx, pkgJson, buildInfo) {
    const userConfig = ctx.userConfig ?? loadUserConfig(locateBcConfig(process.cwd(), ctx.cliOptions.config), ctx);

    if (ctx.target === TARGETS.WEB) {
        const preset = getWebPreset(ctx, pkgJson, buildInfo);
        const userWeb = userConfig.web || {};
        return { web: webpackMerge(preset, userWeb) };
    }

    if (ctx.target === TARGETS.APP) {
        const mainPreset = getMainPreset(ctx, pkgJson, buildInfo);
        const preloadPreset = getPreloadPreset(ctx, pkgJson, buildInfo);
        const rendererPreset = getRendererPreset(ctx, pkgJson, buildInfo);
        return {
            main: webpackMerge(mainPreset, userConfig.main || {}),
            preload: webpackMerge(preloadPreset, userConfig.preload || {}),
            renderer: webpackMerge(rendererPreset, userConfig.renderer || {}),
        };
    }

    throw new Error(`[base-client] 未知 target：${ctx.target}`);
}

module.exports = { resolveBuildConfig, locateBcConfig, loadUserConfig, preloadBcConfig };
