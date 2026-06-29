const path = require('path');
const fs = require('fs');
const { customMerge, replace } = require('./merge');
const { getPackPreset } = require('./presets/pack');

const CONFIG_NAMES = ['electron-builder.config.js', 'electron-builder.config.cjs', 'electron-builder.config.mjs'];

function locateBuilderConfig(cwd, explicit) {
    if (explicit) {
        if (!fs.existsSync(explicit)) {
            throw new Error(`[base-client] 未找到 electron-builder.config（--pack-config 指定的路径不存在）：${explicit}`);
        }
        return explicit;
    }
    for (const name of CONFIG_NAMES) {
        const p = path.join(cwd, name);
        if (fs.existsSync(p)) return p;
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

function resolveBuilderConfig(ctx, pkgJson) {
    const cwd = process.cwd();
    const configPath = locateBuilderConfig(cwd, ctx.cliOptions.packConfig);
    const userConfig = loadUserBuilderConfig(configPath, ctx);
    const preset = getPackPreset(ctx, pkgJson);
    return customMerge(preset, userConfig);
}

module.exports = { resolveBuilderConfig, locateBuilderConfig };
