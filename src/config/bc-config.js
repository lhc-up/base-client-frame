const path = require('path');
const fse = require('fs-extra');
const { merge: webpackMerge } = require('webpack-merge');
const { TARGETS } = require('../core/target');
const { getWebPreset } = require('./presets/web');
const { getMainPreset, assertPkgEntry } = require('./presets/main');
const { getPreloadPreset } = require('./presets/preload');
const { getRendererPreset } = require('./presets/renderer');
const { mergeConfigList } = require('./build-config-list');
const logger = require('../core/logger');
const { createLayout } = require('../paths');

const CONFIG_NAMES = ['bc.config.js', 'bc.config.cjs'];

function locateBcConfig(cwd, explicit) {
    if (explicit) {
        if (!fse.existsSync(explicit)) {
            throw new Error(`[base-client] 未找到 bc.config（--config 指定的路径不存在）：${explicit}`);
        }
        return explicit;
    }
    for (const name of CONFIG_NAMES) {
        const p = path.join(cwd, name);
        if (fse.existsSync(p)) return p;
    }
    throw new Error(`[base-client] 未找到 bc.config.js（cwd=${cwd}）`);
}

function loadUserConfig(configPath, ctx) {
    const loaded = require(configPath);
    const raw = loaded?.default ?? loaded;
    if (typeof raw === 'function') return raw(ctx) || {};
    if (raw && typeof raw === 'object') return raw;
    throw new Error(`[base-client] bc.config 必须导出对象或 (ctx) => config 函数，收到：${raw === null ? 'null' : typeof raw}`);
}

function preloadBcConfig(ctx) {
    const configPath = locateBcConfig(process.cwd(), ctx.cliOptions.config);
    logger.debug(`bc.config 命中：${configPath}`);
    ctx.userConfig = loadUserConfig(configPath, ctx);
}

/**
 * 校验产物布局没有被业务覆盖。
 *
 * main / pkg / preload / renderer 的相对关系同时被 electron-builder、更新包描述文件与运行时
 * preload 定位依赖；允许覆盖会让产物在打包或运行时以难以定位的方式出错，因此在此直接拒绝。
 *
 * @param {Object} configs 已合并配置
 * @param {string} rootDir
 * @throws {Error} output.path / output.filename 与约定不符
 */
function assertOutputLayout(configs, rootDir) {
    const { out } = createLayout(rootDir);
    const expected = [
        ['main', configs.main, path.dirname(out.main), '[name].js'],
        ['preload', configs.preload, path.dirname(out.preload), '[name].js'],
        ['renderer', configs.renderer, out.renderer, undefined],
    ];
    const display = p => String(p || '').split(path.sep).join('/');
    const problems = [];
    for (const [name, config, expectedPath, expectedFilename] of expected) {
        if (name === 'renderer') {
            // renderer 允许多个配置（如更新页单独一个入口），但输出必须落在产物根目录内
            const list = Array.isArray(config) ? config : [config];
            for (const item of list) {
                const target = path.resolve(String((item && item.output && item.output.path) || ''));
                const rel = path.relative(out.root, target);
                if (rel.startsWith('..') || path.isAbsolute(rel)) {
                    problems.push(`renderer.output.path 必须位于 ${display(out.root)} 内，实际 ${display(target)}`);
                }
            }
            continue;
        }
        const output = (config && config.output) || {};
        if (path.resolve(String(output.path || '')) !== path.resolve(expectedPath)) {
            problems.push(`${name}.output.path 期望 ${display(expectedPath)}，实际 ${display(output.path)}`);
        }
        if (expectedFilename !== undefined && output.filename !== expectedFilename) {
            problems.push(`${name}.output.filename 期望 ${expectedFilename}，实际 ${output.filename}`);
        }
    }
    if (problems.length) {
        throw new Error([
            '[base-client] 产物布局由 frame 固定，不允许覆盖 output：',
            ...problems.map(p => `  ${p}`),
        ].join('\n'));
    }
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
        assertPkgEntry();
        const configs = {
            main: webpackMerge(mainPreset, userConfig.main || {}),
            preload: webpackMerge(preloadPreset, userConfig.preload || {}),
            renderer: mergeConfigList(rendererPreset, userConfig.renderer),
        };
        assertOutputLayout(configs, process.cwd());
        return configs;
    }

    throw new Error(`[base-client] 未知 target：${ctx.target}`);
}

module.exports = { resolveBuildConfig, locateBcConfig, loadUserConfig, preloadBcConfig };
