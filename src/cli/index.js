const { cac } = require('cac');
const { version } = require('../../package.json');
const { loadEnv } = require('../core/env');
const { MODES } = require('../core/mode');
const { buildCtx } = require('../core/ctx');
const { preloadBcConfig } = require('../config/bc-config');
const { preloadBuilderConfig } = require('../config/builder-config');
const logger = require('../core/logger');

const COMMANDS = [
    require('./commands/dev-web'),
    require('./commands/build'),
    require('./commands/dev-app'),
    require('./commands/pack'),
    require('./commands/installer'),
];

function applyBcEnvFallback(env, cliOptions) {
    if (!env.BC_ENV) env.BC_ENV = cliOptions.env;
}

// 本地调试状态只由命令决定：dev 命令即本地调试，与 --env（对接的后台环境）无关
function applyDevFlag(env, cmd) {
    if (cmd.mode === MODES.DEV) env.BC_DEV = 'true';
}

function injectBcSubsetToProcessEnv(env) {
    for (const k of Object.keys(env)) {
        if (k.startsWith('BC_')) process.env[k] = env[k];
    }
}

async function runCommand(cmd, cliOptions) {
    if (cliOptions?.debug) global.__BC_DEBUG__ = true;
    try {
        const env = loadEnv(cliOptions.env);
        applyBcEnvFallback(env, cliOptions);
        applyDevFlag(env, cmd);
        injectBcSubsetToProcessEnv(env);

        const ctx = buildCtx(cmd, cliOptions, env);
        if (cmd.resolveCliOptions) {
            ctx.cliOptions = cmd.resolveCliOptions(ctx.cliOptions);
        }

        process.title = `bc-${cmd.name}|env=${env.BC_ENV ?? '?'}`;
        logger.banner({ command: cmd.name, target: ctx.target, mode: ctx.mode, env });

        if (cmd.needsBcConfig) preloadBcConfig(ctx);
        if (cmd.needsBuilderConfig) preloadBuilderConfig(ctx);

        await cmd.action(ctx);
    } catch (err) {
        logger.error(`${cmd.name} 失败：`, err.message);
        if (cliOptions?.debug) console.error(err.stack);
        process.exit(1);
    } finally {
        if (cliOptions?.debug) delete global.__BC_DEBUG__;
    }
}

function createCli() {
    const cli = cac('base-client');
    cli.option('--env <name>', '指定环境名，加载 .env.<name>', { default: 'prod' });
    cli.option('--config <path>', '指定 bc.config 路径');
    cli.option('--pack-config <path>', '指定 electron-builder.config.js 路径');
    cli.option('--debug', '出错时附打印 stack');

    for (const cmd of COMMANDS) {
        const c = cli.command(cmd.name, cmd.description);
        for (const alias of (cmd.aliases || [])) c.alias(alias);
        for (const [flag, desc, cfg] of (cmd.options || [])) c.option(flag, desc, cfg);
        c.action((cliOptions) => runCommand(cmd, cliOptions));
    }

    cli.help();
    cli.version(version);
    return cli;
}

module.exports = { createCli, runCommand };
