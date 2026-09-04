const { merge: webpackMerge } = require('webpack-merge');

function mergeConfigList(preset, userValue) {
    if (!Array.isArray(userValue)) return webpackMerge(preset, userValue || {});
    return userValue.map(config => webpackMerge(preset, config || {}));
}

function toConfigList(value) {
    return Array.isArray(value) ? value : [value];
}

function withoutDevServer(config) {
    const { devServer: _ignored, ...webpackConfig } = config;
    return webpackConfig;
}

function collectProductionConfigs({ main, preload, renderer }) {
    return [main, preload, ...toConfigList(renderer)].map(withoutDevServer);
}

function selectDevRendererConfigs(renderer) {
    if (!Array.isArray(renderer)) return { served: renderer, oneShot: [] };

    const served = renderer.filter(config => (
        config?.devServer && typeof config.devServer === 'object' && !Array.isArray(config.devServer)
    ));
    if (served.length !== 1) {
        throw new Error('renderer 数组必须有 exactly one 配置提供 devServer 对象');
    }
    return {
        served: served[0],
        oneShot: renderer.filter(config => config !== served[0]),
    };
}

module.exports = {
    collectProductionConfigs,
    mergeConfigList,
    selectDevRendererConfigs,
    toConfigList,
    withoutDevServer,
};
