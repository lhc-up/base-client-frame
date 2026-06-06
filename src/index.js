const {
    getMainPreset,
    getPreloadPreset,
    getRendererPreset,
    defineEnvPlugin,
} = require('./config/presets');

const { loadUserConfig, resolveBuildConfig } = require('./config');

module.exports = {
    getMainPreset,
    getPreloadPreset,
    getRendererPreset,
    defineEnvPlugin,
    loadUserConfig,
    resolveBuildConfig,
    VERSION: require('../package.json').version,
};