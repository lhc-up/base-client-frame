const { getMainPreset } = require('./main');
const { getPreloadPreset } = require('./preload');
const { getRendererPreset } = require('./renderer');
const { defineEnvPlugin } = require('./define-env');

module.exports = {
  getMainPreset,
  getPreloadPreset,
  getRendererPreset,
  defineEnvPlugin,
};
