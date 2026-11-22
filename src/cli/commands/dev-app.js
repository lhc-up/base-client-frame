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
const { resolveDevServerOptions, runDevServer } = require('../../webpack-runner/run-dev-server');
const { createDevDescriptor, withDescriptorRoute } = require('../../webpack-runner/dev-descriptor');
const { DESCRIPTOR_FILE } = require('../../paths');
const { resolveElectron } = require('../../electron/resolve-electron');
const { resolveMainEntry } = require('../../electron/resolve-main-entry');
const { killElectron } = require('../../electron/kill-electron');
const logger = require('../../core/logger');
const { extractStatsSummary } = require('../../webpack-runner/format-stats');

// renderer dev server 默认端口，与 dev:web 的 9000 错开
const DEFAULT_DEV_SERVER_PORT = 8023;
// 与 Node 一致：VS Code 附加调试、chrome://inspect 默认都找这个端口
const DEFAULT_INSPECT_PORT = 9229;

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
 * 两种运行方式的行为就不一致了。本地调试状态与地址经 `__BC_BUILD__.isPkgDev` / `__BC_BUILD__.devUrl` 静态引用，不另行注入。
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

/**
 * 把 `--inspect [port]` 规整为端口号：未传为 undefined，只写 `--inspect` 为默认端口。
 *
 * @param {Record<string, any>} cliOptions
 * @returns {Record<string, any>}
 */
function resolveInspectOption(cliOptions) {
    const inspect = cliOptions.inspect;
    if (inspect === undefined || inspect === false) {
        return { ...cliOptions, inspect: undefined };
    }
    if (inspect === true) {
        return { ...cliOptions, inspect: DEFAULT_INSPECT_PORT };
    }
    const port = Number(inspect);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`--inspect 的端口必须是 1-65535 之间的整数，收到：${inspect}`);
    }
    return { ...cliOptions, inspect: port };
}

/**
 * 启动 Electron 的命令行参数：调试参数必须写在入口文件之前。
 *
 * @param {string} mainEntry
 * @param {number | undefined} inspectPort
 * @returns {string[]}
 */
function electronArgs(mainEntry, inspectPort) {
    if (inspectPort === undefined) {
        return [mainEntry];
    }
    return [`--inspect=${inspectPort}`, '--trace-warnings', mainEntry];
}

module.exports = {
    name: 'dev:app',
    description: '启动 Electron 三进程开发环境（main+preload 一次性编译，renderer HMR）',
    target: TARGETS.APP,
    mode: MODES.DEV,
    needsBcConfig: true,
    needsBuilderConfig: false,
    options: [
        ['--port <n>', `renderer dev-server 端口（默认 ${DEFAULT_DEV_SERVER_PORT}，与 dev:web 的 9000 错开避免冲突）`],
        ['--host <host>', 'renderer dev-server host（默认 localhost）'],
        ['--pkg-only', '只编译包主进程并启动页面 dev server，不启动 electron（供其他宿主联调加载）'],
        ['--inspect [port]', `主进程开启调试，供调试器连接（默认端口 ${DEFAULT_INSPECT_PORT}）`],
    ],
    resolveCliOptions: resolveInspectOption,
    action: async (ctx) => {
        const rootDir = process.cwd();
        const pkgJson = require(path.resolve(rootDir, 'package.json'));
        const buildInfo = deriveBuildInfo(ctx, pkgJson);

        const { main, preload, renderer } = resolveBuildConfig(ctx, pkgJson, buildInfo);
        const pkgOnly = !!ctx.cliOptions.pkgOnly;

        const { served, oneShot } = selectDevRendererConfigs(renderer);
        const { devServer: userDev = {} } = served;
        const rendererWebpack = withoutDevServer(served);
        const resolvedDevServer = resolveDevServerOptions(ctx, userDev, { defaultPort: DEFAULT_DEV_SERVER_PORT });
        const devUrl = `http://${resolvedDevServer.host}:${resolvedDevServer.port}/`;
        // 必须在创建 webpack compiler 之前写入：buildInfoPlugin 在 apply 时才读取 buildInfo
        buildInfo.devUrl = devUrl;
        // dev server 根地址下提供描述文件，宿主据此把 dev server 当作一个包加载
        const devDescriptor = createDevDescriptor({ rootDir, buildInfo, devUrl });
        const devServerOptions = withDescriptorRoute(resolvedDevServer, devDescriptor);

        // --pkg-only 时 main 预设只保留 pkg 入口，且不编译 preload
        const oneShotConfigs = pkgOnly
            ? [main, ...oneShot.map(withoutDevServer)]
            : [main, preload, ...oneShot.map(withoutDevServer)];
        const [, devServer] = await Promise.all([
            compileOneShotConfigs(oneShotConfigs),
            runDevServer(rendererWebpack, devServerOptions, 'renderer', ctx),
        ]);

        if (pkgOnly) {
            if (ctx.cliOptions.inspect !== undefined) {
                logger.warn('--pkg-only 不启动 Electron，--inspect 不起作用；请在宿主上开启调试');
            }
            logger.info(`包描述文件：${devUrl}${DESCRIPTOR_FILE}`);
            logger.info(`宿主 .env 的 BC_DEV_PKG_SOURCES 中配置：{ "${buildInfo.name}": { "type": "devServer", "url": "${devUrl}" } }`);
            logger.info('主进程改动需重新执行本命令并重启宿主');
            const shutdown = createShutdown({ child: null, devServer });
            registerShutdownSignals(shutdown);
            return;
        }

        const electronExe = await resolveElectron(rootDir);
        const mainEntry = resolveMainEntry(rootDir);
        const inspectPort = ctx.cliOptions.inspect;
        if (inspectPort !== undefined) {
            logger.info(`主进程调试端口：127.0.0.1:${inspectPort}（VS Code 附加到进程，或 chrome://inspect）`);
        }
        const child = cp.spawn(electronExe, electronArgs(mainEntry, inspectPort), {
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
    resolveInspectOption,
    electronArgs,
    DEFAULT_INSPECT_PORT,
    DEFAULT_DEV_SERVER_PORT,
};
