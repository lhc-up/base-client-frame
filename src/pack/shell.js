const path = require('path');
const fs = require('fs');
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
        .replace(/\{\{APP_DIR_NAME\}\}/g, vars.appDirName)
        .replace(/\{\{APP_ID\}\}/g, vars.appId);
}

function generateShellScripts({ rootDir, distDir, mergedBuilderConfig, appName, appDirName, appId, templatesDir }) {
    // templatesDir 默认相对 frame 包内位置：
    // - 开发期 src/pack/shell.js → ../templates/shell = src/templates/shell
    // - 打包后 dist/cli/index.js（rollup bundle）→ ../templates/shell = dist/templates/shell
    const tplDir = templatesDir || path.join(__dirname, '../templates/shell');
    const shellDir = path.join(distDir, 'shell');
    fse.ensureDirSync(shellDir);

    for (const name of FILES) {
        const src = path.join(tplDir, name);
        const out = path.join(shellDir, name);
        const raw = fs.readFileSync(src, 'utf8');
        const rendered = normalizeLineEndings(renderTemplate(raw, { appName, appDirName, appId }));
        fs.writeFileSync(out, rendered, { encoding: 'utf8' });
    }

    if (!mergedBuilderConfig.nsis) mergedBuilderConfig.nsis = {};
    if (mergedBuilderConfig.nsis.include === undefined) {
        mergedBuilderConfig.nsis.include = 'dist/shell/win-installer.nsh';
    }

    if (!mergedBuilderConfig.deb) mergedBuilderConfig.deb = {};
    if (!Array.isArray(mergedBuilderConfig.deb.fpm) || mergedBuilderConfig.deb.fpm.length === 0) {
        mergedBuilderConfig.deb.fpm = [
            '--before-install=dist/shell/deb-preinstall.sh',
            '--after-install=dist/shell/deb-postinstall.sh',
            '--after-remove=dist/shell/deb-postrm.sh',
        ];
    }
}

module.exports = { generateShellScripts };
