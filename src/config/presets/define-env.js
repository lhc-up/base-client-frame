const webpack = require('webpack');

function defineEnvPlugin(env) {
  const defs = {};
  for (const k of Object.keys(env || {})) {
    if (k.startsWith('BC_')) {
      defs[`process.env.${k}`] = JSON.stringify(env[k]);
    }
  }
  return new webpack.DefinePlugin(defs);
}

module.exports = { defineEnvPlugin };
