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

/** 项目根目录下的资源目录：打包后 resources/ 的镜像，整体复制进安装包 */
const RESOURCES_DIR = 'resources';

const toInstalledName = name => name.replace(/\.asax$/i, '.asar');

/**
 * 项目 `resources/` 的复制规则。
 *
 * - `resources/` 整体复制到安装包的 `resources/`（`packages/` 除外，逐个文件处理）
 * - `resources/packages/` 中的内置包：`.asax`（分发名）改名为 `.asar`（落盘名），`.asar` 原名复制，其他文件忽略
 * - 内置包与自身包落盘名相同、或同一个包同时有 `.asax` 与 `.asar` 时报错，避免静默覆盖
 *
 * @param {string} rootDir 项目根目录
 * @param {string} selfTarget 自身包在安装包中的路径（相对 resources/）
 * @returns {Array<Object>} extraResources 条目
 * @throws {Error} 落盘名冲突
 */
function resourceEntries(rootDir, selfTarget) {
    const resDir = path.join(rootDir, RESOURCES_DIR);
    if (!fse.existsSync(resDir)) return [];
    const entries = [{ from: RESOURCES_DIR, to: '.', filter: ['**/*', `!${BUILTIN_PKG_DIR}/**`] }];
    const pkgDir = path.join(resDir, BUILTIN_PKG_DIR);
    if (!fse.existsSync(pkgDir)) return entries;
    const targets = new Map([[selfTarget, '自身包']]);
    for (const name of fse.readdirSync(pkgDir).sort()) {
        if (!/\.(asax|asar)$/i.test(name)) continue;
        const target = `${BUILTIN_PKG_DIR}/${toInstalledName(name)}`;
        if (targets.has(target)) {
            throw new Error(`[base-client] ${RESOURCES_DIR}/${BUILTIN_PKG_DIR}/${name} 与${targets.get(target)}落盘名冲突：${target}`);
        }
        targets.set(target, `${RESOURCES_DIR}/${BUILTIN_PKG_DIR}/${name}`);
        entries.push({ from: `${RESOURCES_DIR}/${BUILTIN_PKG_DIR}/${name}`, to: target });
    }
    return entries;
}

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
 * 调整 electron-builder 配置：安装包只带宿主（宿主主进程 + preload），自身包以内置包形式进入
 * `resources/packages/`；项目 `resources/` 整体复制进安装包（见 `resourceEntries`）。
 *
 * 只改写预设的 `{ from: 'app', to: '.' }` 一项；业务追加的 files / extraResources 原样保留。
 *
 * @param {Object} builderConfig 合并后的 electron-builder 配置
 * @param {string} pkgPath 更新包绝对路径
 * @param {string} rootDir 项目根目录
 * @returns {Object} 新的配置对象
 * @throws {Error} 内置包落盘名冲突
 */
function applyPkgToBuilderConfig(builderConfig, pkgPath, rootDir) {
    const files = (builderConfig.files || []).map(entry => (
        entry && typeof entry === 'object' && entry.from === 'app' && entry.to === '.'
            ? { ...entry, filter: ['main/**', '!main/pkg.js', '!main/pkg.js.map', 'preload/**'] }
            : entry
    ));
    // 内置包落盘名为 .asar（Electron 只有路径中出现 .asar 才能读取包内文件）
    const selfTarget = `${BUILTIN_PKG_DIR}/${toInstalledName(path.basename(pkgPath))}`;
    const extraResources = [
        ...(builderConfig.extraResources || []),
        ...(rootDir ? resourceEntries(rootDir, selfTarget) : []),
        { from: pkgPath, to: selfTarget },
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
    RESOURCES_DIR,
};
