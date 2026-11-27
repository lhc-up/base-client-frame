const path = require('path');
const fse = require('fs-extra');
const { customMerge, replace } = require('./merge');
const { getPackPreset } = require('./presets/pack');
const logger = require('../core/logger');

const CONFIG_NAMES = ['electron-builder.config.js', 'electron-builder.config.cjs'];

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
    const raw = loaded?.default ?? loaded;
    if (typeof raw === 'function') {
        return raw({ ...ctx, replace }) || {};
    }
    if (raw && typeof raw === 'object') {
        return raw;
    }
    throw new Error(`[base-client] electron-builder.config 必须导出对象或 (ctx) => config 函数，收到：${raw === null ? 'null' : typeof raw}`);
}

function preloadBuilderConfig(ctx) {
    const configPath = locateBuilderConfig(process.cwd(), ctx.cliOptions.packConfig);
    logger.debug(`electron-builder.config 命中：${configPath}`);
    ctx.userBuilderConfig = loadUserBuilderConfig(configPath, ctx);
}

function enforceDistOutput(mergedConfig) {
    const cur = mergedConfig.directories?.output;
    if (cur && cur !== 'dist') {
        logger.warn(`electron-builder.config.directories.output 被显式配置为 "${cur}"，但 frame 强制使用 "dist"（设计约定，见 docs/design/architecture.md）；已覆盖回 "dist"。`);
    }
    mergedConfig.directories = { ...(mergedConfig.directories || {}), output: 'dist' };
}

/**
 * Linux 安装目录：默认 /opt/<appId>（项目写了 linux.installDir 时以项目为准）。
 *
 * electron-builder 官方把安装目录写死为 /opt/<productName>，productName 相同的不同客户端会装进同一目录；
 * appId 按客户端区分（com.eachina.<name>），用它作目录名。appId 未配置时与 electron-builder 默认值一致。
 * 生效依赖 @base-client/app-builder-lib 改版的 linux.installDir。
 */
function applyLinuxInstallDir(mergedConfig, pkgJson) {
    const appId = mergedConfig.appId || `com.electron.${pkgJson.name}`;
    mergedConfig.linux = mergedConfig.linux || {};
    if (mergedConfig.linux.installDir == null || mergedConfig.linux.installDir === '') {
        mergedConfig.linux.installDir = `/opt/${appId}`;
    }
}

function resolveBuilderConfig(ctx, pkgJson) {
    const userConfig = ctx.userBuilderConfig ?? loadUserBuilderConfig(locateBuilderConfig(process.cwd(), ctx.cliOptions.packConfig), ctx);
    const preset = getPackPreset(ctx, pkgJson);
    const merged = customMerge(preset, userConfig);
    enforceDistOutput(merged);
    applyLinuxInstallDir(merged, pkgJson);
    return merged;
}

module.exports = { resolveBuilderConfig, locateBuilderConfig, preloadBuilderConfig, applyLinuxInstallDir };
