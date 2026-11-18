const path = require('path');
const cp = require('child_process');
const webpack = require('webpack');
const { MODES } = require('../../core/mode');
const { TARGETS } = require('../../core/target');
const { deriveBuildInfo } = require('../../core/build-info');
const { resolveBuildConfig } = require('../../config/bc-config');
const {
    selectDevRendererConfigs,
    withoutDevServer,
} = require('../../config/build-config-list');
const { resolveDevServerOptions, runDevServer, devServerUrl } = require('../../webpack-runner/run-dev-server');
const { resolveElectron } = require('../../electron/resolve-electron');
const { resolveMainEntry } = require('../../electron/resolve-main-entry');
const { killElectron } = require('../../electron/kill-electron');
const logger = require('../../core/logger');
const { setRuntimeEnv } = require('../../core/env');
const { extractStatsSummary } = require('../../webpack-runner/format-stats');

function compileOneShotConfigs(configs) {
    return new Promise((resolve, reject) => {
        const compiler = webpack(configs, (err, multiStats) => {
            const finalize = (action) => compiler.close(() => action());

            if (err) {
                logger.compileFailure('main+preload');
                return finalize(() => reject(err));
            }
            const stats = multiStats.stats;
            let failed = false;
            for (let i = 0; i < stats.length; i += 1) {
                const sum = extractStatsSummary(stats[i], configs[i]?.name || `webpack-${i + 1}`);
                if (sum.errorCount > 0) {
                    logger.compileFailure(sum.name);
                    console.error(stats[i].toString({ colors: true }));
                    failed = true;
                } else {
                    logger.compileSuccess(sum.name, sum.ms, sum.totalSize);
                    logger.compileWarning(sum.name, sum.warningCount);
                }
            }
            if (failed) return finalize(() => reject(new Error('main / preload 编译失败')));
            finalize(() => resolve());
        });
    });
}

function createShutdown({
    child,
    devServer,
    kill = killElectron,
    exitProcess = process.exit,
    timeoutMs = 5000,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
}) {
    let pending;
    return function shutdown(exitCode = 0) {
        if (pending) return pending;
        // --pkg-only 不启动 electron，没有子进程
        if (child) kill(child);
        pending = (async () => {
            let timeoutHandle;
            const timeout = new Promise(resolve => {
                timeoutHandle = setTimeoutFn(resolve, timeoutMs);
            });
            try {
                await Promise.race([
                    Promise.resolve().then(() => devServer.stop()).catch(() => {}),
                    timeout,
                ]);
            } finally {
                clearTimeoutFn(timeoutHandle);
                exitProcess(exitCode);
            }
        })();
        return pending;
    };
}

function registerShutdownSignals(shutdown, processLike = process) {
    processLike.on('SIGINT', () => shutdown(130));
    processLike.on('SIGTERM', () => shutdown(143));
}

/**
 * dev:app 启动 Electron 时的环境变量。
 *
 * 去掉全部 BC_* 变量：业务代码只能以 `process.env.BC_xxx` 静态写法引用，由构建期替换为字面量；
 * 若子进程仍能读到 BC_*，`process.env[name]` 之类的动态写法在 dev:app 下可用、打包后失效，
 * 两种运行方式的行为就不一致了。本地调试状态与地址同样经 BC_DEV / BC_DEV_URL 静态引用，不再另行注入。
 *
 * @param {NodeJS.ProcessEnv} baseEnv
 * @returns {NodeJS.ProcessEnv}
 */
function electronChildEnv(baseEnv) {
    const env = {};
    for (const [k, v] of Object.entries(baseEnv)) {
        if (!k.startsWith('BC_')) env[k] = v;
    }
    env.NODE_ENV = 'development';
    return env;
}

module.exports = {
    name: 'dev:app',
    description: '启动 Electron 三进程开发环境（main+preload 一次性编译，renderer HMR）',
    target: TARGETS.APP,
    mode: MODES.DEV,
    needsBcConfig: true,
    needsBuilderConfig: false,
    options: [
        ['--port <n>', 'renderer dev-server 端口（默认 8023，与 dev:web 的 9000 错开避免冲突）'],
        ['--host <host>', 'renderer dev-server host（默认 localhost）'],
        ['--pkg-only', '只编译包主进程并启动页面 dev server，不启动 electron（供其他宿主联调加载）'],
    ],
    action: async (ctx) => {
        const rootDir = process.cwd();
        const pkgJson = require(path.resolve(rootDir, 'package.json'));
        const buildInfo = deriveBuildInfo(ctx, pkgJson);

        const { main, preload, renderer } = resolveBuildConfig(ctx, pkgJson, buildInfo);
        const pkgOnly = !!ctx.cliOptions.pkgOnly;

        const { served, oneShot } = selectDevRendererConfigs(renderer);
        const { devServer: userDev = {} } = served;
        const rendererWebpack = withoutDevServer(served);
        const devServerOptions = resolveDevServerOptions(ctx, userDev, { defaultPort: 8023 });
        const devUrl = devServerUrl(devServerOptions);
        // 必须在创建 webpack compiler 之前写入：userEnvPlugin 在 apply 时才读取 ctx.env
        setRuntimeEnv(ctx, 'BC_DEV_URL', devUrl);

        // --pkg-only 时 main 预设只保留 pkg 入口，且不编译 preload
        const oneShotConfigs = pkgOnly
            ? [main, ...oneShot.map(withoutDevServer)]
            : [main, preload, ...oneShot.map(withoutDevServer)];
        const [, devServer] = await Promise.all([
            compileOneShotConfigs(oneShotConfigs),
            runDevServer(rendererWebpack, devServerOptions, 'renderer', ctx),
        ]);

        if (pkgOnly) {
            logger.info(`包主进程：${path.join(rootDir, 'app/main/pkg.js')}`);
            logger.info(`页面 dev server：${devUrl}`);
            logger.info('由宿主按开发覆盖项加载；主进程改动需重新执行本命令并重启宿主');
            const shutdown = createShutdown({ child: null, devServer });
            registerShutdownSignals(shutdown);
            return;
        }

        const electronExe = await resolveElectron(rootDir);
        const mainEntry = resolveMainEntry(rootDir);
        const child = cp.spawn(electronExe, [mainEntry], {
            stdio: ['inherit', 'pipe', 'pipe'],
            env: electronChildEnv(process.env),
        });
        child.stdout.on('data', (chunk) => process.stdout.write(chunk.toString('utf8')));
        child.stderr.on('data', (chunk) => process.stderr.write(chunk.toString('utf8')));

        const shutdown = createShutdown({ child, devServer });

        child.on('close', (code) => shutdown(code ?? 0));
        registerShutdownSignals(shutdown);
    },
    createShutdown,
    registerShutdownSignals,
    electronChildEnv,
};
