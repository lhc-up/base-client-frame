/**
 * 生产环境构建
 * 构建主进程、preload、渲染进程
 */
async function build() {
    console.log('[Base] 开始生产环境构建...');

    // 检查 webpack 是否安装
    let webpack;
    try {
        webpack = require('webpack');
    } catch (e) {
        console.error('[Base] 错误: webpack 未安装');
        console.error('[Base] 请在项目目录运行: npm install webpack webpack-cli babel-loader @babel/core @babel/preset-env');
        process.exit(1);
    }

    const { resolveBuildConfig } = require('../../config');
    const config = {
        mode: 'production'
    };

    // 并行构建所有进程
    const mainConfig = { ...resolveBuildConfig('main'), ...config };
    const preloadConfig = { ...resolveBuildConfig('preload'), ...config };
    const rendererConfig = { ...resolveBuildConfig('renderer'), ...config };

    console.log('[Base] 主进程配置:', mainConfig.output.path);
    console.log('[Base] Preload 配置:', preloadConfig.output.path);
    console.log('[Base] 渲染进程配置:', rendererConfig.output.path);

    await Promise.all([
        buildWithWebpack(webpack, mainConfig),
        buildWithWebpack(webpack, preloadConfig),
        buildWithWebpack(webpack, rendererConfig)
    ]);

    console.log('[Base] 构建完成！');
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
            console.log('[Base] 已构建:', config.output.filename);
            resolve();
        });
    });
}

module.exports = { build };