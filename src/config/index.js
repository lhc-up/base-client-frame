const path = require('path');
const fs = require('fs');
const getMainPreset = require('./presets/main.js');
const getPreloadPreset = require('./presets/preload.js');
const getRendererPreset = require('./presets/renderer.js');
const { merge } = require('webpack-merge');

const CONFIG_FILE_NAME = 'bc.config';

function findConfigFilePath(
    configRoot = process.cwd(),
    extensions = ['js', 'ts', 'mjs', 'cjs', 'mts', 'cts']
) {
    for (const ext of extensions) {
        const configFile = path.resolve(
            configRoot,
            `${CONFIG_FILE_NAME}.${ext}`
        );
        if (fs.existsSync(configFile)) {
            return configFile;
        }
    }
    return '';
}

function loadUserConfig(option = {}) {
    const configPath = findConfigFilePath();
    return require(configPath);
}

/**
 * 解析依赖
 * @param {*} options
 * @returns
 */
function resolveConfig(options = {}) {
    const rootDir = options.rootDir || process.cwd();
    const userConfig = loadUserConfig();
    const finalConfig = {
        main: merge(getMainPreset(rootDir), userConfig.main || {}),
        preload: merge(getPreloadPreset(rootDir), userConfig.preload || {}),
        renderer: merge(getRendererPreset(rootDir), userConfig.renderer || {})
    };
    console.log('finalConfigfinalConfigfinalConfig', finalConfig.main.module.rules)
    return {
        config: finalConfig,
        configFile: {}
    };
}

module.exports = {
    resolveConfig
};
