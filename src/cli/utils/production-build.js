const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const { resolveBuildConfig } = require('../../config');

function runOne(config, name) {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) return reject(err);
      if (stats.hasErrors()) {
        console.error(stats.toString({ colors: true }));
        return reject(new Error(`${name} 编译失败`));
      }
      console.log(stats.toString({ colors: true, modules: false }));
      resolve();
    });
  });
}

async function runProductionBuild({ env, command, cliOptions }) {
  const rootDir = process.cwd();

  const appDir = path.resolve(rootDir, 'app');
  fs.rmSync(appDir, { recursive: true, force: true });

  const { main, preload, renderer } = resolveBuildConfig({
    env, mode: 'production', command, cliOptions,
  });

  await Promise.all([
    runOne(main, 'main'),
    runOne(preload, 'preload'),
    runOne(renderer, 'renderer'),
  ]);
}

module.exports = { runProductionBuild };
