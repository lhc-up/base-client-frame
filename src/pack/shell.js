const path = require('path');
const fse = require('fs-extra');

const FILES = [
    'win-installer.nsh',
    'deb-preinstall.sh',
    'deb-postinstall.sh',
    'deb-postrm.sh',
];

function normalizeLineEndings(s) {
    return s.replace(/\r\n/g, '\n');
}

function renderTemplate(content, vars) {
    return content
        .replace(/\{\{APP_NAME\}\}/g, vars.appName)
        .replace(/\{\{APP_INSTALL_DIR\}\}/g, vars.appInstallDir)
        .replace(/\{\{APP_ID\}\}/g, vars.appId);
}

/** frame 的 deb 安装脚本参数；项目在 deb.fpm 里写了同类参数时以项目为准 */
const DEB_SCRIPT_ARGS = [
    ['--before-install', 'dist/shell/deb-preinstall.sh'],
    ['--after-install', 'dist/shell/deb-postinstall.sh'],
    ['--after-remove', 'dist/shell/deb-postrm.sh'],
];

/**
 * 生成 Windows / deb 的安装脚本，并挂到 electron-builder 配置上。
 *
 * @param {object} options
 * @param {string} options.appName package.json 的 name（Linux 可执行文件名）
 * @param {string} options.appInstallDir Linux 安装目录（linux.installDir，如 /opt/com.eachina.questionaire）
 * @param {string} options.appId
 */
function generateShellScripts({ rootDir, distDir, mergedBuilderConfig, appName, appInstallDir, appId, templatesDir }) {
    const tplDir = templatesDir || path.join(__dirname, '../templates/shell');
    const shellDir = path.join(distDir, 'shell');
    fse.ensureDirSync(shellDir);

    for (const name of FILES) {
        const src = path.join(tplDir, name);
        const out = path.join(shellDir, name);
        const raw = fse.readFileSync(src, 'utf8');
        const rendered = normalizeLineEndings(renderTemplate(raw, { appName, appInstallDir, appId }));
        fse.writeFileSync(out, rendered, { encoding: 'utf8' });
    }

    if (!mergedBuilderConfig.nsis) mergedBuilderConfig.nsis = {};
    if (mergedBuilderConfig.nsis.include === undefined) {
        mergedBuilderConfig.nsis.include = 'dist/shell/win-installer.nsh';
    }

    // 项目可在 deb.fpm 中追加其他参数（如 --replaces=旧包名），frame 的脚本参数照样补上；
    // 项目自己写了某个脚本参数时不再补该项
    if (!mergedBuilderConfig.deb) mergedBuilderConfig.deb = {};
    const fpm = Array.isArray(mergedBuilderConfig.deb.fpm) ? mergedBuilderConfig.deb.fpm.slice() : [];
    for (const [flag, file] of DEB_SCRIPT_ARGS) {
        const present = fpm.some(arg => arg === flag || String(arg).startsWith(`${flag}=`));
        if (!present) fpm.push(`${flag}=${file}`);
    }
    mergedBuilderConfig.deb.fpm = fpm;
}

module.exports = { generateShellScripts };
