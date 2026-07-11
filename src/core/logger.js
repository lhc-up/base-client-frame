const pc = require('picocolors');
const { version } = require('../../package.json');

const PREFIX = pc.cyan('[base-client]');

function info(msg) {
    console.log(`${PREFIX} ${msg}`);
}

function success(msg) {
    console.log(`${PREFIX} ${pc.green('✓')} ${msg}`);
}

function warn(msg) {
    console.warn(`${PREFIX} ${pc.yellow('⚠')} ${msg}`);
}

function error(scope, msg) {
    console.error(`${pc.red('[base-client]')} ${pc.bold(scope)} ${msg}`);
}

function banner({ command, target, mode, env }) {
    const bcEnv = env?.BC_ENV ?? '?';
    console.log(`${PREFIX} v${version}  ${pc.bold(command)} | target=${target} | env=${bcEnv} | mode=${mode}`);
}

function footer({ env, url, target }) {
    const bcEnv = env?.BC_ENV ?? '?';
    console.log(`${PREFIX} env=${bcEnv} | ${pc.cyan(url)} | target=${target}`);
}

function compileSuccess(name, ms, sizeBytes) {
    console.log(`${PREFIX} ${pc.green('✓')} ${name} 编译完成 (${formatMs(ms)} | ${formatBytes(sizeBytes)})`);
}

function compileFailure(name) {
    console.log(`${PREFIX} ${pc.red('✗')} ${name} 编译失败`);
}

function compileWarning(name, count) {
    if (!count) return;
    console.warn(`${PREFIX} ${pc.yellow('⚠')} ${name} ${count} warnings`);
}

function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatMs(n) {
    if (n < 1000) return `${n} ms`;
    return `${(n / 1000).toFixed(1)} s`;
}

module.exports = {
    info, success, warn, error,
    banner, footer,
    compileSuccess, compileFailure, compileWarning,
    formatBytes, formatMs,
};
