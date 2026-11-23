const path = require('path');
const fse = require('fs-extra');
const os = require('os');
const asar = require('@electron/asar');
const { derivePackageDescriptor } = require('./package-descriptor');
const { DESCRIPTOR_FILE, RESOURCES_DIR, BUILTIN_PKG_DIR, createLayout, toOutputRelative } = require('../paths');

const ASAX_RE = /\.asax$/i;
const toInstalledName = name => name.replace(ASAX_RE, '.asar');

/** 不进安装包的文件：版本管理占位文件与系统生成的文件，和业务无关 */
const IGNORED_RESOURCE_FILES = ['.gitkeep', '.gitignore', '.DS_Store', 'Thumbs.db', 'desktop.ini'];

function isBusinessResource(src) {
    const name = path.basename(src);
    if (IGNORED_RESOURCE_FILES.includes(name)) {
        return false;
    }
    return true;
}

/**
 * 把安装包 `resources/` 的内容整理到 `dist/resources/`，再由 electron-builder 整体复制（见 `applyPkgToBuilderConfig`）。
 *
 * 1. 项目 `resources/` 整体复制，跳过 `IGNORED_RESOURCE_FILES`
 * 2. `packages/` 中的内置包：`.asax`（分发名）改名为 `.asar`（落盘名）
 * 3. 自身包放入 `packages/`，落盘名为 `.asar`
 *
 * 改名或放入时目标已存在（同一个包同时有 `.asax` 与 `.asar`、内置包与自身包同名）则报错，避免静默覆盖。
 *
 * @param {Object} options
 * @param {string} options.rootDir 项目根目录
 * @param {string} options.distDir 输出目录 `dist/`
 * @param {string} options.pkgPath 自身包（更新包）绝对路径
 * @returns {string} 整理好的目录（`dist/resources/`）
 * @throws {Error} 落盘名冲突
 */
function stageResources({ rootDir, distDir, pkgPath }) {
    const stageDir = path.join(distDir, RESOURCES_DIR);
    const pkgDir = path.join(stageDir, BUILTIN_PKG_DIR);
    fse.removeSync(stageDir);

    const srcDir = path.join(rootDir, RESOURCES_DIR);
    if (fse.existsSync(srcDir)) {
        fse.copySync(srcDir, stageDir, { filter: isBusinessResource });
    }
    fse.ensureDirSync(pkgDir);

    for (const name of fse.readdirSync(pkgDir)) {
        if (!ASAX_RE.test(name)) {
            continue;
        }
        const installedName = toInstalledName(name);
        if (fse.existsSync(path.join(pkgDir, installedName))) {
            throw new Error(`[base-client] ${RESOURCES_DIR}/${BUILTIN_PKG_DIR}/ 中 ${name} 与 ${installedName} 落盘名冲突：${BUILTIN_PKG_DIR}/${installedName}`);
        }
        fse.renameSync(path.join(pkgDir, name), path.join(pkgDir, installedName));
    }

    const selfName = toInstalledName(path.basename(pkgPath));
    if (fse.existsSync(path.join(pkgDir, selfName))) {
        throw new Error(`[base-client] ${RESOURCES_DIR}/${BUILTIN_PKG_DIR}/ 中有与自身包同名的包，落盘名冲突：${BUILTIN_PKG_DIR}/${selfName}`);
    }
    fse.copySync(pkgPath, path.join(pkgDir, selfName));

    return stageDir;
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
 * 调整 electron-builder 配置：安装包只带宿主（宿主主进程 + preload）；`stageResources` 整理好的目录
 * 整体复制为安装包的 `resources/`（含自身包与其他内置包）。
 *
 * 只改写预设中产物根目录那一项（见 `outputFrom`）；业务追加的 files / extraResources 原样保留。
 *
 * @param {Object} builderConfig 合并后的 electron-builder 配置
 * @param {string} stageDir `stageResources` 返回的目录
 * @param {string} rootDir 项目根目录
 * @returns {Object} 新的配置对象
 */
function applyPkgToBuilderConfig(builderConfig, stageDir, rootDir) {
    const layout = createLayout(rootDir);
    const rel = absolute => toOutputRelative(layout, absolute);
    const outFrom = outputFrom(layout, rootDir);
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
    const extraResources = [
        ...(builderConfig.extraResources || []),
        { from: path.relative(rootDir, stageDir).split(path.sep).join('/'), to: '.' },
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
    stageResources,
    applyPkgToBuilderConfig,
    pkgFileName,

    BUILTIN_PKG_DIR,
    RESOURCES_DIR,
};
