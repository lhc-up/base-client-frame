const path = require('path');
const fse = require('fs-extra');
const { customMerge, replace } = require('./merge');
const { getPackPreset } = require('./presets/pack');

const CONFIG_NAMES = ['electron-builder.config.js', 'electron-builder.config.cjs', 'electron-builder.config.mjs'];

function locateBuilderConfig(cwd, explicit) {
    if (explicit) {
        if (!fse.existsSync(explicit)) {
            throw new Error(`[base-client] 未找到 electron-builder.config（--pack-config 指定的路径不存在）：${explicit}`);
        }
        return explicit;
    }
    for (const name of CONFIG_NAMES) {
        const p = path.join(cwd, name);
        if (fse.existsSync(p)) return p;
    }
    throw new Error(`[base-client] 未找到 electron-builder.config.js（cwd=${cwd}）`);
}

function loadUserBuilderConfig(configPath, ctx) {
    const loaded = require(configPath);
    const fn = loaded.default ?? loaded;
    if (typeof fn !== 'function') {
        throw new Error(`[base-client] electron-builder.config 必须导出函数 (ctx) => config`);
    }
    return fn({ ...ctx, replace }) || {};
}

function preloadBuilderConfig(ctx) {
    const configPath = locateBuilderConfig(process.cwd(), ctx.cliOptions.packConfig);
    ctx.userBuilderConfig = loadUserBuilderConfig(configPath, ctx);
}

function resolveBuilderConfig(ctx, pkgJson) {
    const userConfig = ctx.userBuilderConfig ?? loadUserBuilderConfig(locateBuilderConfig(process.cwd(), ctx.cliOptions.packConfig), ctx);
    const preset = getPackPreset(ctx, pkgJson);
    return customMerge(preset, userConfig);
}

module.exports = { resolveBuilderConfig, locateBuilderConfig, preloadBuilderConfig };
