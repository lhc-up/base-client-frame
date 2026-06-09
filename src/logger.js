const pc = require('picocolors');
const { version } = require('../package.json');

const PREFIX = pc.cyan('[base-client]');

function info(msg) {
    console.log(`${PREFIX} ${msg}`);
}

function success(msg) {
    console.log(`${pc.green('✓')} ${msg}`);
}

function warn(msg) {
    console.log(`${pc.yellow('⚠')} ${msg}`);
}

function error(scope, msg) {
    console.error(`${pc.red('[base-client]')} ${pc.bold(scope)} ${msg}`);
}

function banner({ command, mode, env }) {
    const envBC = env?.BC_ENV ?? '?';
    console.log(
        `${PREFIX} ${pc.dim('v' + version)}  `
        + `${pc.bold(command)} | env=${pc.bold(envBC)} | mode=${mode}`
    );
}

function footer({ env, url, watch }) {
    const envBC = env?.BC_ENV ?? '?';
    const tail = [
        `env=${pc.bold(envBC)}`,
        pc.cyan(pc.underline(url)),
    ];
    if (watch) tail.push(pc.dim('watch:on'));
    console.log(`${PREFIX} ${tail.join(' | ')}`);
}

function compileSuccess(name, ms, sizeBytes) {
    console.log(
        `${PREFIX} ${pc.green('✓')} ${pc.bold(name)} 编译完成 `
        + pc.dim(`(${formatMs(ms)} | ${formatBytes(sizeBytes)})`)
    );
}

function compileFailure(name) {
    console.error(`${PREFIX} ${pc.red('✗')} ${pc.bold(name)} 编译失败`);
}

function compileWarning(name, count) {
    if (count > 0) {
        console.log(`${PREFIX} ${pc.yellow('⚠')} ${pc.bold(name)} ${count} warnings`);
    }
}

function formatBytes(bytes) {
    if (bytes == null) return '?';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMs(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

module.exports = {
    info,
    success,
    warn,
    error,
    banner,
    footer,
    compileSuccess,
    compileFailure,
    compileWarning,
    formatBytes,
    formatMs,
};
