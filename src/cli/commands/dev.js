const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const childProcess = require('child_process');
const { resolveBuildConfig } = require('../../config');
const {
  resolveElectron,
  resolveMainEntry,
  killElectron,
} = require('../utils/electron');
const { resolveDevServerOptions } = require('./dev-options');

async function action(ctx) {
  const { cliOptions, env, mode, command } = ctx;
  const rootDir = process.cwd();

  const { main, preload, renderer } = resolveBuildConfig({
    env, mode, command, cliOptions,
  });

  const { devServer: userDevServer, ...rendererWebpack } = renderer;

  const { options: devServerOptions, host, port } = resolveDevServerOptions({
    cliOptions, userDevServer,
  });

  const rendererCompiler = webpack(rendererWebpack);
  const server = new WebpackDevServer(devServerOptions, rendererCompiler);
  await server.start();

  let mainPreloadWatcher;
  let electronChild = null;
  let intentionalKill = false;

  const spawnElectron = () => {
    const electronBin = resolveElectron(rootDir);
    const mainEntry = resolveMainEntry(rootDir);
    const child = childProcess.spawn(electronBin, [mainEntry], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        RENDERER_DEV_URL: `http://${host}:${port}`,
      },
    });
    child.on('close', async (code) => {
      if (intentionalKill) {
        intentionalKill = false;
        return;
      }
      await server.stop();
      if (mainPreloadWatcher) mainPreloadWatcher.close(() => {});
      process.exit(code ?? 0);
    });
    return child;
  };

  if (cliOptions.watchMain) {
    const mainPreloadCompiler = webpack([main, preload]);
    let debounceTimer = null;
    mainPreloadWatcher = mainPreloadCompiler.watch({}, (err, stats) => {
      if (err || (stats && stats.hasErrors())) {
        console.error(stats ? stats.toString({ colors: true }) : err);
        return;
      }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (electronChild) {
          intentionalKill = true;
          const oldChild = electronChild;
          oldChild.on && oldChild.on('close', () => {
            electronChild = spawnElectron();
          });
          killElectron(oldChild);
        } else {
          electronChild = spawnElectron();
        }
      }, 100);
    });
  } else {
    const mainPreloadCompiler = webpack([main, preload]);
    await new Promise((resolve, reject) => {
      mainPreloadCompiler.run((err, stats) => {
        if (err) return reject(err);
        if (stats.hasErrors()) {
          return reject(new Error(stats.toString({ colors: true })));
        }
        resolve();
      });
    });
    electronChild = spawnElectron();
  }

  process.on('SIGINT', async () => {
    intentionalKill = true;
    killElectron(electronChild);
    await server.stop();
    if (mainPreloadWatcher) mainPreloadWatcher.close(() => {});
    process.exit(130);
  });
}

module.exports = {
  name: 'dev',
  description: '启动开发服务器 + Electron',
  mode: 'development',
  options: [
    ['--port <n>', 'dev server 端口'],
    ['--host <host>', 'dev server host'],
    ['--watch-main', 'watch main + preload 改动自动重启'],
  ],
  action,
};
