const { LOONG_TARGETS } = require('../../electron/loong');

/** Electron 下载镜像：electron-builder 默认从 GitHub 下载目标平台的 Electron，国内经常连不上 */
const ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';

/**
 * 环境变量指定的镜像：`ELECTRON_MIRROR`，或项目 `.npmrc` 的 `electron_mirror`
 * （经 `npm run` / `npx` 传入为 `npm_config_electron_mirror`）。electron-builder 也读这两个变量。
 *
 * @returns {string|undefined}
 */
function envElectronMirror() {
    return process.env.ELECTRON_MIRROR || process.env.npm_config_electron_mirror;
}

function getPackPreset(ctx, pkgJson) {
    const { createLayout, toOutputRelative } = require('../../paths');
    const { outputFrom } = require('../../pack/pkg');
    const rootDir = process.cwd();
    const layout = createLayout(rootDir);
    const year = new Date().getFullYear();
    const author = pkgJson.author ?? '';
    const productName = pkgJson.productName ?? pkgJson.name;

    const preset = {
        directories: { output: 'dist' },
        files: [
            { from: outputFrom(layout, rootDir), to: '.' },
            'package.json',
            '!**/node_modules/**',
        ],
        extraMetadata: { main: toOutputRelative(layout, layout.out.main) },

        productName,
        copyright: `Copyright © ${year} ${author}`.trim(),
        artifactName: '${productName}_${os}_${arch}_${env.BC_ENV}_v${version}.${ext}',

        // Windows 以当前用户能获得的最高权限运行：管理员账户每次启动弹 UAC 确认，普通用户正常启动。
        // electron-builder 默认 asInvoker（不提权）。项目可在 win.requestedExecutionLevel 中改写
        win: { requestedExecutionLevel: 'highestAvailable' },

        // Windows 安装程序：带向导、可改安装目录、为所有用户安装（Program Files，需管理员权限）、简体中文界面，
        // 控制面板中的名称不带版本号。
        // deleteAppDataOnUninstall：卸载时（升级除外）删除 %APPDATA% 下以 name、productName 命名的目录，
        // 即 Electron 的用户数据目录；productName 相同的客户端共用该目录，会一并删除
        nsis: {
            oneClick: false,
            allowToChangeInstallationDirectory: true,
            perMachine: true,
            deleteAppDataOnUninstall: true,
            language: '2052',
            uninstallDisplayName: '${productName}',
            // 安装完成页勾选「运行」（electron-builder 默认同样为 true，这里写明）
            runAfterFinish: true,
        },

        // macOS 暂不签名：null 表示明确跳过（不写时 electron-builder 会自动查找钥匙串中的开发者证书签名）。
        // 需要签名时项目改为证书名，或用环境变量 CSC_NAME 指定
        mac: { identity: null },

        // macOS 安装镜像挂载后的卷名不带版本号（electron-builder 默认 '${productName} ${version}'）
        dmg: { title: '${productName}' },
    };

    // deb 必须有维护者。electron-builder 先取 linux.maintainer；没写时取 package.json 的 author，
    // 且要求 author 带 email（对象写法 { "name": "…", "email": "…" }，或字符串 "名字 <email>"），否则报
    // "Please specify author 'email'"（app-builder-lib targets/FpmTarget.js）。
    // author 是字符串时默认作为 maintainer；是对象时不设置：electron-builder 会把 maintainer 原样作为 fpm 参数，
    // 传对象会出错，而带 email 的对象它自己能拼出「名字 <email>」。项目写了 linux.maintainer 时合并后以项目为准
    // Linux 应用菜单分类（.desktop 的 Categories）；不写时 electron-builder 用 Utility 并警告
    // executableArgs：Linux 下以 root 运行时 Chromium 要求 --no-sandbox，该参数只写进 .desktop 的 Exec=（桌面图标、
    // 应用菜单启动时带上），终端启动不带，见 README「Linux 启动与沙箱」
    preset.linux = { category: 'Education;Utility;Network', executableArgs: ['--no-sandbox'] };
    if (typeof pkgJson.author === 'string' && pkgJson.author.trim() !== '') {
        preset.linux.maintainer = pkgJson.author;
    }

    // 龙芯：官方 Electron 没有龙芯版本，按目标用对应的 Electron 与 deb 架构名（见 electron/loong.js）。
    // 产物文件名里的 ${arch} 是 electron-builder 的架构名（两个龙芯目标都是 loong64），改为 deb 架构名以区分。
    // 其他架构：默认用 npmmirror；环境变量已指定镜像时不设置，以环境变量为准。项目写了 electronDownload 时合并后以项目为准
    const loongTarget = LOONG_TARGETS[ctx.cliOptions?.arch];
    if (loongTarget && loongTarget.electron) {
        preset.electronVersion = loongTarget.electron.electronVersion;
        preset.electronDownload = { ...loongTarget.electron.electronDownload };
    } else if (!envElectronMirror()) {
        preset.electronDownload = { mirror: ELECTRON_MIRROR };
    }
    if (loongTarget) {
        preset.deb = { architecture: loongTarget.debArchitecture };
        preset.artifactName = preset.artifactName.replace('${arch}', loongTarget.debArchitecture);
    }

    return preset;
}

module.exports = { getPackPreset, ELECTRON_MIRROR };
