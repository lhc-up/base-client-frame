const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const childProcess = require('child_process');
const { MODES } = require('../../mode');
const { resolveBuildConfig } = require('../../config');
const logger = require('../../logger');
const { extractStatsSummary } = require('../utils/format');
const { createCompileSpinner } = require('../utils/compile-spinner');
const {
    resolveElectron,
    resolveMainEntry,
    killElectron,
} = require('../utils/electron');
const { resolveDevServerOptions } = require('./dev-options');

const MAIN_PRELOAD_NAMES = ['main', 'preload'];

function reportMainPreloadStats(multiStats) {
    let anyError = false;
    multiStats.stats.forEach((stats, i) => {
        const summary = extractStatsSummary(stats, MAIN_PRELOAD_NAMES[i]);
        if (summary.errorCount > 0) {
            logger.compileFailure(summary.name);
            console.error(stats.toString({ colors: true }));
            anyError = true;
        } else {
            logger.compileSuccess(summary.name, summary.ms, summary.totalSize);
            logger.compileWarning(summary.name, summary.warningCount);
        }
    });
    return anyError;
}

async function action(ctx) {
    const { cliOptions, env } = ctx;
    const rootDir = process.cwd();

    const { main, preload, renderer } = resolveBuildConfig(ctx);

    const { devServer: userDevServer, ...rendererWebpack } = renderer;

    const { options: devServerOptions, host, port } = resolveDevServerOptions({
        cliOptions, userDevServer,
    });
    const url = `http://${host}:${port}`;

    const spinner = createCompileSpinner('编译中...');
    const initial = { needed: 3, completed: 0, done: false };
    function tickInitial() {
        if (initial.done) return;
        initial.completed += 1;
        if (initial.completed >= initial.needed) {
            initial.done = true;
            spinner.stop();
        }
    }

    const rendererCompiler = webpack(rendererWebpack);
    rendererCompiler.hooks.done.tap('base-client', (stats) => {
        const summary = extractStatsSummary(stats, 'renderer');
        spinner.clear();
        if (summary.errorCount > 0) {
            logger.compileFailure(summary.name);
            console.error(stats.toString({ colors: true }));
            tickInitial();
            return;
        }
        logger.compileSuccess(summary.name, summary.ms, summary.totalSize);
        logger.compileWarning(summary.name, summary.warningCount);
        logger.footer({ env, url, watch: !!cliOptions.watchMain });
        tickInitial();
    });

    const server = new WebpackDevServer(devServerOptions, rendererCompiler);
    await server.start();
    logger.info(`dev server: ${url}`);
    spinner.start();

    let mainPreloadWatcher;
    let electronChild = null;
    let intentionalKill = false;

    const spawnElectron = () => {
        const electronBin = resolveElectron(rootDir);
        const mainEntry = resolveMainEntry(rootDir);
        const child = childProcess.spawn(electronBin, [mainEntry], {
            stdio: 'inherit',
            env: {
                ...process.env,
                NODE_ENV: 'development',
                RENDERER_DEV_URL: `http://${host}:${port}`,
            },
        });
        child.on('close', async (code) => {
            if (intentionalKill) {
                intentionalKill = false;
                return;
            }
            await server.stop();
            if (mainPreloadWatcher) mainPreloadWatcher.close(() => {});
            process.exit(code ?? 0);
        });
        return child;
    };

    if (cliOptions.watchMain) {
        const mainPreloadCompiler = webpack([main, preload]);
        let debounceTimer = null;
        mainPreloadWatcher = mainPreloadCompiler.watch({}, (err, multiStats) => {
            if (err) {
                spinner.clear();
                logger.error('main+preload watch', err.message);
                tickInitial(); tickInitial();
                return;
            }
            spinner.clear();
            const anyError = reportMainPreloadStats(multiStats);
            tickInitial(); tickInitial();
            if (anyError) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (electronChild) {
                    intentionalKill = true;
                    const oldChild = electronChild;
                    oldChild.on && oldChild.on('close', () => {
                        electronChild = spawnElectron();
                    });
                    killElectron(oldChild);
                } else {
                    electronChild = spawnElectron();
                }
            }, 100);
        });
    } else {
        const mainPreloadCompiler = webpack([main, preload]);
        await new Promise((resolve, reject) => {
            mainPreloadCompiler.run((err, multiStats) => {
                if (err) {
                    spinner.clear();
                    tickInitial(); tickInitial();
                    return reject(err);
                }
                spinner.clear();
                const anyError = reportMainPreloadStats(multiStats);
                tickInitial(); tickInitial();
                if (anyError) return reject(new Error('main+preload 编译失败'));
                resolve();
            });
        });
        electronChild = spawnElectron();
    }

    process.on('SIGINT', async () => {
        intentionalKill = true;
        killElectron(electronChild);
        await server.stop();
        if (mainPreloadWatcher) mainPreloadWatcher.close(() => {});
        process.exit(130);
    });
}

module.exports = {
    name: 'dev',
    description: '启动开发服务器 + Electron',
    mode: MODES.DEV,
    options: [
        ['--port <n>', 'dev server 端口'],
        ['--host <host>', 'dev server host'],
        ['--watch-main', 'watch main + preload 改动自动重启'],
    ],
    action,
};
