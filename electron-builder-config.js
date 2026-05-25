const pkgJson = require('./package.json');

/**
 * Metadata¶ (https://www.electron.build/configuration#metadata)
 * Some standard fields should be defined in the package.json.
 * author: 作者，windows系统中会展示在【控制面板-卸载或更改程序】页的发布者一列中
 * build: electron-builder构建配置，可以为空，另外指定配置文件
 * description:
 * homepage: 构建Linux包时，此项必填。The url to the project homepage (NuGet Package projectUrl (optional) or Linux Package URL (required)).
 * license:
 * name: 应用程序名称
 * repository:
 */

/**
 * File Macros¶ (https://www.electron.build/file-patterns#file-macros)
 * You can use macros in the file patterns, artifact file name patterns and publish configuration url:
 * （注意，不是所有的地方都能使用宏，比如appId中不可以，nsis中可以）
 * ${arch} — expanded to ia32, x64. If no arch, macro will be removed from your pattern with leading space, - and _ (so, you don’t need to worry and can reuse pattern).
 * ${os} — expanded to mac, linux or win according to target platform.
 * ${platform} — expanded to darwin, linux or win32 according to Node.js process.platform property.
 * ${name} – package.json name.
 * ${productName} — Sanitized product name.
 * ${version}
 * ${channel} — detected prerelease component from version (e.g. beta).
 * ${env.ENV_NAME} — any environment variable.
 * Any property of AppInfo (e.g. buildVersion, buildNumber).
 */

const winCodeSingConfig = {
    signingHashAlgorithms: ['sha256'],
    signDlls: true,
    rfc3161TimeStampServer: 'http://timestamp.digicert.com',
    certificateFile: 'resource/cert/public-key.pfx',
    certificatePassword: ''
};

// 龙芯打包，使用龙芯社区的electron镜像
// loong64 或 loongarch64
const loongArchConfig = {
    electronDownload: {
        version: '22.3.27',
        mirror: 'http://ftp.loongnix.cn/electron/LoongArch/',
        customDir: 'v22.3.27',
        platform: 'linux',
        arch: 'loong64'
    },
    electronVersion: '22.3.27'
}

const config = {
    asar: true,
    // 应用程序 ID。
    // 在 macOS 中用作 CFBundleIdentifier
    // 在 Windows 中用作应用程序用户模型 ID（仅限 NSIS 目标，不支持 Squirrel.Windows）
    // 注意在安装、卸载时，系统区分不同的程序用的不是这个id，而是nsis选项中的guid（由appId根据uuid v5算法得到，appId不变，guid就不会变）
    // 所以appId一旦设置且程序发布之后，就不要再变了，否则guid会变，导致安装、卸载时系统无法识别旧程序（除非显式设置了guid）。
    appId: `com.eachina.${pkgJson.name}`,
    // 产品名称（程序名称），未指定时，使用packages.json中的productName，否则使用默认值: ${name}
    productName: pkgJson.productName,
    // 打包产物（安装包）名称格式
    artifactName: '${productName}_${os}_${arch}_${env.BC_ENV}_v${version}.${ext}',
    // 版权，默认：Copyright © year ${author}
    copyright: `Copyright © 2026 ${pkgJson.author}`,
    directories: {
        // 打包产物输出目录
        output: 'dist'
    },
    // 把文件复制到打包产物的resource目录中
    extraResources: [
        {
            from: 'resource/icons',
            to: 'icons'
        },
        {
            from: 'resource/addons',
            to: 'addons'
        },
        {
            from: 'resource/shell',
            to: 'shell'
        }
    ],
    // 打包时需要包含进来的文件，各个进程打包后的文件都在app文件夹中
    files: [
        '!**/node_modules/**',
        {
            from: 'app',
            to: '.'
        },
        'package.json'
    ],
    mac: {
        icon: 'resource/icons/icon.icns'
    },
    dmg: {
        title: '${productName}'
    },
    linux: {
        // 维护者，默认为作者
        maintainer: pkgJson.author,
        // 供应商，默认为作者
        vendor: pkgJson.author,
        // 图表，包含多个尺寸
        icon: 'resource/icons',
        // 应用分类
        category: 'Education;Utility;Network',
        // 可执行文件名称
        executableName: pkgJson.name,
        // 可执行文件的参数。传递给 executableName
        executableArgs: ['--no-sandbox']
    },
    deb: {
        // 软件包名称，国产系统的安装器界面会显示这个名称
        packageName: 'guojiajiance',
        // 优先级，deb包一般都设置为optional
        priority: 'optional',
        // 高级参数，直接传递给fpm，https://fpm.readthedocs.io/en/latest/cli-reference.html
        // 定义各个安装阶段的脚本
        fpm: [
            '--before-install=dist/shell/deb-preinstall.sh',
            '--after-install=dist/shell/deb-postinstall.sh',
            '--after-remove=dist/shell/deb-postrm.sh'
        ]
    },
    win: {
        // 应用程序请求执行时的安全级别
        // https://learn.microsoft.com/zh-cn/previous-versions/visualstudio/visual-studio-2015/deployment/trustinfo-element-clickonce-application?view=vs-2015&redirectedfrom=MSDN#Anchor_9
        // asInvoker: 无需权限
        // highestAvailable: 请求父进程可获得的最高权限
        // requireAdministrator: 管理员权限
        // !!! ClickOnce(oneClick) 应用程序只能使用 asInvoker 值进行安装。使用任何其他值都会导致安装失败。
        requestedExecutionLevel: 'highestAvailable',
        icon: 'resource/icons/icon.ico',
        // 代码签名
        ...(process.env.WIN_CODE_SIGN ? winCodeSingConfig : {}),
    },
    nsis: {
        // 是否是一键安装，为true时，不需要用户点击确定或下一步按钮
        oneClick: false,
        // 是否允许用户更改安装目录
        allowToChangeInstallationDirectory: true,
        // 是否在卸载时删除appdata中的数据，文档说是one-click安装包专属，但实际测试发现不是，所有安装包都支持
        // https://www.electron.build/nsis#deleteappdataonuninstall
        deleteAppDataOnUninstall: true,
        // 安装模式，受oneClick影响
        // 如果oneClick为true：是否为所有用户（每台机器）安装
        // 如果oneClick为 false 且 perMachine 为 true：则没有安装模式安装程序页面，始终为所有用户（每台机器）安装
        // 如果oneClick为 false 且 perMachine 为 false：显示【选择安装模式】页面（为所有用户安装和仅为我安装）
        perMachine: true,
        // 是否允许请求权限，如果设置为false且权限不够时，用户需要以管理员身份重新还行安装程序
        allowElevation: true,
        // 是否在安装完成后运行软件
        runAfterFinish: true,
        // 快捷方式名称
        shortcutName: '${productName}',
        // 控制面板中卸载程序的显示名称
        uninstallDisplayName: '${productName} ${version}',
        // 安装、卸载时识别不同的程序，默认根据appId生成，也可以显式指定，一旦设定后就不要再变了
        // 最好是只设置appId，然后由electron-builder根据UUID v5算法生成guid
        // https://www.electron.build/nsis#guid-vs-application-name
        guid: `com.eachina.${pkgJson.name}`,
        // 用于自定义安装程序的 NSIS 脚本路径
        include: 'dist/shell/win-installer.nsh',
        // https://learn.microsoft.com/zh-tw/visualstudio/ide/reference/lcid-devenv-exe?view=visualstudio
        // LCID是Windows操作系统中用来表示语言（Primary Language ID）和国家/地区/代码页（Sublanguage ID）的组合标识符
        // 2052: 中文（简体）
        language: '2052'
    },
    // 龙芯打包配置
    ...(process.env.ARCH === 'loong64' ? loongArchConfig : {})
};

module.exports = config;
