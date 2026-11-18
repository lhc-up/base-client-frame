const path = require('path');
const fse = require('fs-extra');
const os = require('os');
const asar = require('@electron/asar');
const { derivePackageDescriptor } = require('./package-descriptor');

/** 包内主进程入口与页面目录（相对包根），写入描述文件 */
const PKG_MAIN = 'main/pkg.js';
const PKG_RENDERER = 'renderer/';

/** 安装包中内置包的目录（相对 resources/） */
const BUILTIN_PKG_DIR = 'packages';

/**
 * 更新包文件名（分发名）：`<name>-<env>-v<version>.asax`。
 *
 * 分发用 `.asax`：任何 Electron 程序（包括 VS Code）碰到 `.asar` 都会当作归档打开并持有句柄，
 * Windows 下随后无法删除、覆盖 dist/。落到客户端时（下载晋升、内置包）改名为 `.asar`。
 *
 * @param {{ name: string, env: string, version: string }} buildInfo
 * @returns {string}
 */
function pkgFileName(buildInfo) {
    return `${buildInfo.name}-${buildInfo.env}-v${buildInfo.version}.asax`;
}

/**
 * 把 `app/` 中属于包的部分打成更新包：描述文件 + `main/pkg.js` + `renderer/`。
 *
 * @param {Object} options
 * @param {string} options.appDir 中间目录 `app/`
 * @param {string} options.distDir 输出目录 `dist/`
 * @param {Object} options.buildInfo `__BC_BUILD__` 同源信息
 * @returns {Promise<string>} 更新包绝对路径
 * @throws {Error} `app/main/pkg.js` 不存在
 */
async function buildPkgAsar({ appDir, distDir, buildInfo }) {
    const mainFile = path.join(appDir, PKG_MAIN);
    if (!fse.existsSync(mainFile)) {
        throw new Error(`[base-client] 未找到包主进程产物 ${PKG_MAIN}（需提供 src/main/pkg.js）`);
    }

    const tmpDir = fse.mkdtempSync(path.join(os.tmpdir(), 'bc-frame-pkg-'));
    try {
        await fse.copy(mainFile, path.join(tmpDir, PKG_MAIN));
        const rendererDir = path.join(appDir, 'renderer');
        if (fse.existsSync(rendererDir)) {
            await fse.copy(rendererDir, path.join(tmpDir, 'renderer'));
        }
        const communicationContract = path.join(appDir, 'communication-contract.json');
        if (fse.existsSync(communicationContract)) {
            await fse.copy(communicationContract, path.join(tmpDir, 'communication-contract.json'));
        }

        const descriptor = {
            ...derivePackageDescriptor(buildInfo),
            main: PKG_MAIN,
            renderer: PKG_RENDERER,
        };
        fse.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(descriptor, null, 2));

        fse.ensureDirSync(distDir);
        const out = path.join(distDir, pkgFileName(buildInfo));
        await asar.createPackage(tmpDir, out);
        return out;
    } finally {
        fse.removeSync(tmpDir);
    }
}

/**
 * 调整 electron-builder 配置：安装包只带宿主（宿主主进程 + preload），包以内置更新包形式进入
 * `resources/packages/`。
 *
 * 只改写预设的 `{ from: 'app', to: '.' }` 一项；业务追加的 files / extraResources 原样保留。
 *
 * @param {Object} builderConfig 合并后的 electron-builder 配置
 * @param {string} pkgPath 更新包绝对路径
 * @returns {Object} 新的配置对象
 */
function applyPkgToBuilderConfig(builderConfig, pkgPath) {
    const files = (builderConfig.files || []).map(entry => (
        entry && typeof entry === 'object' && entry.from === 'app' && entry.to === '.'
            ? { ...entry, filter: ['main/**', '!main/pkg.js', '!main/pkg.js.map', 'preload/**'] }
            : entry
    ));
    const extraResources = [
        ...(builderConfig.extraResources || []),
        // 内置包落盘名为 .asar（Electron 只有路径中出现 .asar 才能读取包内文件）
        { from: pkgPath, to: `${BUILTIN_PKG_DIR}/${path.basename(pkgPath).replace(/\.asax$/i, '.asar')}` },
    ];
    return { ...builderConfig, files, extraResources };
}

module.exports = {
    buildPkgAsar,
    applyPkgToBuilderConfig,
    pkgFileName,
    PKG_MAIN,
    PKG_RENDERER,
    BUILTIN_PKG_DIR,
};
