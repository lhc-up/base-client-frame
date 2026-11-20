const path = require('path');
const fse = require('fs-extra');
const { DESCRIPTOR_FILE, createLayout } = require('../paths');
const { derivePackageDescriptor } = require('../pack/package-descriptor');

/**
 * 本地调试时的包描述文件：格式与包内描述文件相同，入口为可直接使用的值
 * （包主进程为磁盘绝对路径，页面为 dev server 地址）。宿主据此把 dev server 当作一个包加载。
 *
 * @param {Object} options
 * @param {string} options.rootDir 项目根目录
 * @param {Object} options.buildInfo
 * @param {string} options.devUrl dev server 根地址（以 / 结尾）
 * @returns {Object}
 */
function createDevDescriptor({ rootDir, buildInfo, devUrl }) {
    const { src, out } = createLayout(rootDir);
    const pageUrl = page => new URL(path.relative(out.renderer, page).split(path.sep).join('/'), devUrl).href;
    const descriptor = {
        ...derivePackageDescriptor(buildInfo),
        main: out.pkg,
        renderer: pageUrl(out.rendererPage),
    };
    if (fse.existsSync(src.update)) descriptor.update = pageUrl(out.updatePage);
    return descriptor;
}

/**
 * 在 dev server 根地址下提供描述文件，保留业务自己的 setupMiddlewares。
 *
 * @param {Object} devServerOptions
 * @param {Object} descriptor
 * @returns {Object} 新的 devServer 配置
 */
function withDescriptorRoute(devServerOptions, descriptor) {
    const userSetup = devServerOptions.setupMiddlewares;
    return {
        ...devServerOptions,
        setupMiddlewares(middlewares, devServer) {
            devServer.app.get(`/${DESCRIPTOR_FILE}`, (req, res) => {
                res.set('Cache-Control', 'no-store');
                res.json(descriptor);
            });
            return typeof userSetup === 'function' ? userSetup(middlewares, devServer) : middlewares;
        },
    };
}

module.exports = { createDevDescriptor, withDescriptorRoute };
