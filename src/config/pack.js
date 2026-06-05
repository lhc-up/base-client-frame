const fs = require('fs');
const path = require('path');
const { mergeWithCustomize } = require('webpack-merge');
const { getPackPreset } = require('./presets/pack');

const REPLACE = Symbol('$replace');

function replace(arr) {
    const tagged = Array.from(arr);
    tagged[REPLACE] = true;
    return tagged;
}

function customMerge(preset, user) {
    return mergeWithCustomize({
        customizeArray: (presetArr, userArr) => {
            if (userArr && userArr[REPLACE]) return Array.from(userArr);
            return [...(presetArr || []), ...(userArr || [])];
        },
    })(preset || {}, user || {});
}

const SUPPORTED_EXTS = ['.js', '.cjs'];
const UNSUPPORTED_EXTS_WITH_HINT = ['.mjs'];

function probePackConfigFromCwd(rootDir) {
    for (const ext of [...SUPPORTED_EXTS, ...UNSUPPORTED_EXTS_WITH_HINT]) {
        const p = path.resolve(rootDir, `electron-builder.config${ext}`);
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function loadPackUserConfig(rootDir, packConfigPath) {
    const resolvedPath = packConfigPath
        ? path.resolve(rootDir, packConfigPath)
        : probePackConfigFromCwd(rootDir);

    if (!resolvedPath) {
        throw new Error(`未找到 electron-builder.config.js（在 ${rootDir}）`);
    }

    const ext = path.extname(resolvedPath);
    if (UNSUPPORTED_EXTS_WITH_HINT.includes(ext)) {
        throw new Error(
            `${path.basename(resolvedPath)} 暂不支持，请改用 .js / .cjs`
        );
    }

    delete require.cache[resolvedPath];
    const mod = require(resolvedPath);
    const fn = mod && mod.__esModule ? mod.default : mod;
    if (typeof fn !== 'function') {
        throw new Error('electron-builder.config.js 必须导出函数 (ctx) => config');
    }
    return fn;
}

function resolvePackConfig({ env, mode, command, cliOptions }) {
    const rootDir = process.cwd();
    const pkgJsonPath = path.resolve(rootDir, 'package.json');
    delete require.cache[pkgJsonPath];
    const pkgJson = require(pkgJsonPath);

    const userFn = loadPackUserConfig(rootDir, cliOptions && cliOptions.packConfig);
    const userConfig = userFn({ command, mode, env, cliOptions, replace }) || {};

    const preset = getPackPreset({ rootDir, env, mode, cliOptions, pkgJson });
    return customMerge(preset, userConfig);
}

module.exports = {
    customMerge,
    replace,
    resolvePackConfig,
    REPLACE,
};
