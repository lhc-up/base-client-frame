const path = require('path');
const fs = require('fs');
const { merge: webpackMerge } = require('webpack-merge');
const { getWebPreset } = require('./presets/web');

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

function resolveBuildConfig(ctx, pkgJson, buildInfo) {
    const cwd = process.cwd();
    const configPath = locateBcConfig(cwd, ctx.cliOptions.config);
    const userConfig = loadUserConfig(configPath, ctx);

    if (ctx.target === 'web') {
        const preset = getWebPreset(ctx, pkgJson, buildInfo);
        const userWeb = userConfig.web || {};
        return { web: webpackMerge(preset, userWeb) };
    }

    throw new Error(`[base-client] target=${ctx.target} 暂未实现（Phase 1 仅支持 web）`);
}

module.exports = { resolveBuildConfig, locateBcConfig, loadUserConfig };
