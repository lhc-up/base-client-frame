const path = require('path');
const fse = require('fs-extra');
const os = require('os');
const asar = require('@electron/asar');
const { derivePackageDescriptor } = require('./package-descriptor');
const { DESCRIPTOR_FILE, RESOURCES_DIR, BUILTIN_PKG_DIR, createLayout, toOutputRelative } = require('../paths');

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
 * 把产物中属于包的部分打成更新包：描述文件 + 包主进程 + 页面目录（布局见 `paths.js`）。
 *
 * 描述文件的 `main` / `renderer` / `update` 是包内入口（相对包根目录），运行时由 toolkit 拼成完整入口。
 *
 * @param {Object} options
 * @param {string} options.appDir 产物根目录
 * @param {string} options.distDir 输出目录 `dist/`
 * @param {Object} options.buildInfo `__BC_BUILD__` 同源信息
 * @returns {Promise<string>} 更新包绝对路径
 * @throws {Error} 包主进程或主页面不存在
 */
async function buildPkgAsar({ appDir, distDir, buildInfo }) {
    const rootDir = process.cwd();
    const layout = createLayout(rootDir);
    const rel = absolute => toOutputRelative(layout, absolute);
    const inApp = absolute => path.join(appDir, rel(absolute));

    // 启动页可选（项目没有 src/renderer/update/ 时不构建）
    const hasUpdate = fse.existsSync(inApp(layout.out.updatePage));
    for (const file of [layout.out.pkg, layout.out.rendererPage]) {
        if (!fse.existsSync(inApp(file))) {
            throw new Error(`[base-client] 未找到包产物 ${rel(file)}`);
        }
    }

    const tmpDir = fse.mkdtempSync(path.join(os.tmpdir(), 'bc-frame-pkg-'));
    try {
        await fse.copy(inApp(layout.out.pkg), path.join(tmpDir, rel(layout.out.pkg)));
        await fse.copy(inApp(layout.out.renderer), path.join(tmpDir, rel(layout.out.renderer)));
        const communicationContract = path.join(appDir, 'communication-contract.json');
        if (fse.existsSync(communicationContract)) {
            await fse.copy(communicationContract, path.join(tmpDir, 'communication-contract.json'));
        }

        const descriptor = {
            ...derivePackageDescriptor(buildInfo),
            main: rel(layout.out.pkg),
            renderer: rel(layout.out.rendererPage),
        };
        if (hasUpdate) descriptor.update = rel(layout.out.updatePage);
        fse.writeFileSync(path.join(tmpDir, DESCRIPTOR_FILE), JSON.stringify(descriptor, null, 2));

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
 * 只改写预设中产物根目录那一项（见 `outputFrom`）；业务追加的 files / extraResources 原样保留。
 *
 * @param {Object} builderConfig 合并后的 electron-builder 配置
 * @param {string} pkgPath 更新包绝对路径
 * @param {string} rootDir 项目根目录
 * @returns {Object} 新的配置对象
 * @throws {Error} 内置包落盘名冲突
 */
function applyPkgToBuilderConfig(builderConfig, pkgPath, rootDir) {
    const layout = createLayout(rootDir || process.cwd());
    const rel = absolute => toOutputRelative(layout, absolute);
    const outFrom = outputFrom(layout, rootDir || process.cwd());
    // 安装包只带宿主：宿主主进程目录（去掉包主进程）+ preload 目录
    const hostFilter = [
        `${path.posix.dirname(rel(layout.out.main))}/**`,
        `!${rel(layout.out.pkg)}`,
        `!${rel(layout.out.pkg)}.map`,
        `${path.posix.dirname(rel(layout.out.preload))}/**`,
    ];
    const files = (builderConfig.files || []).map(entry => {
        const isOutput = entry && typeof entry === 'object' && entry.from === outFrom && entry.to === '.';
        return isOutput ? { ...entry, filter: hostFilter } : entry;
    });
    // 内置包落盘名为 .asar（Electron 只有路径中出现 .asar 才能读取包内文件）
    const selfTarget = `${BUILTIN_PKG_DIR}/${toInstalledName(path.basename(pkgPath))}`;
    const extraResources = [
        ...(builderConfig.extraResources || []),
        ...(rootDir ? resourceEntries(rootDir, selfTarget) : []),
        { from: pkgPath, to: selfTarget },
    ];
    return { ...builderConfig, files, extraResources };
}

/**
 * electron-builder `files` 中产物根目录的写法：相对项目根目录的 POSIX 路径（pack 预设与此处共用）。
 *
 * @param {ReturnType<typeof createLayout>} layout
 * @param {string} rootDir
 */
function outputFrom(layout, rootDir) {
    return path.relative(rootDir, layout.out.root).split(path.sep).join('/');
}

module.exports = {
    outputFrom,
    buildPkgAsar,
    applyPkgToBuilderConfig,
    pkgFileName,

    BUILTIN_PKG_DIR,
    RESOURCES_DIR,
};
