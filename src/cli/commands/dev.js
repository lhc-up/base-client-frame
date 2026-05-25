const path = require('path');
const { spawn } = require('child_process');

/**
 * 启动开发模式
 * 1. 构建主进程和 preload (一次性)
 * 2. 启动 webpack dev server (renderer)
 * 3. 启动 Electron 主进程
 */
async function dev() {
    console.log('[Base] 启动开发模式...');

    // 检查 webpack 是否安装
    let webpack, WebpackDevServer;
    webpack = require('webpack');
    WebpackDevServer = require('webpack-dev-server');

    const { resolveConfig } = require('../../config');

    const config = resolveConfig();
    const { main: mainConfig, preload: preloadConfig, renderer: rendererConfig} = config.config;

    // 构建主进程和 preload
    console.log('[Base] 构建主进程...');
    console.log('mainConfigmainConfigmainConfigmainConfigmainConfigmainConfig', JSON.stringify(mainConfig))
    await buildWithWebpack(webpack, mainConfig);

    console.log('[Base] 构建 Preload...');
    await buildWithWebpack(webpack, preloadConfig);

    // 启动渲染进程 dev server
    console.log('[Base] 启动渲染进程开发服务器...');
    const devServerOptions = {
        port: 9000,
        hot: true,
        static: {
            directory: path.join(process.cwd(), 'out/renderer')
        }
    };

    const server = new WebpackDevServer(devServerOptions, webpack(rendererConfig));

    server.startCallback(() => {
        console.log('[Base] 渲染进程开发服务器: http://localhost:9000');

        // 启动 Electron
        const electronPath = require('electron');
        const mainPath = path.join(process.cwd(), 'out/main/index.js');

        console.log('[Base] 启动 Electron...');

        const electron = spawn(electronPath, [mainPath], {
            stdio: 'inherit',
            env: {
                ...process.env,
                NODE_ENV: 'development'
            }
        });

        electron.on('close', (code) => {
            server.close();
            process.exit(code);
        });
    });
}

function buildWithWebpack(webpack, config) {
    return new Promise((resolve, reject) => {
        webpack(config, (err, stats) => {
            if (err) {
                reject(err);
                return;
            }
            if (stats.hasErrors()) {
                console.error(stats.toString());
                reject(new Error('Webpack build failed'));
                return;
            }
            console.log('[Base] 构建完成:', config.output.filename);
            resolve();
        });
    });
}

module.exports = { dev };