const { cac } = require('cac');
const { version } = require('../../package.json');
const { loadEnv } = require('../core/env');
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
    require('./commands/child'),
];

function applyBcEnvFallback(env, cliOptions) {
    if (!env.BC_ENV) env.BC_ENV = cliOptions.env;
}

function injectBcSubsetToProcessEnv(env) {
    for (const k of Object.keys(env)) {
        if (k.startsWith('BC_')) process.env[k] = env[k];
    }
}

async function runCommand(cmd, cliOptions) {
    try {
        const env = loadEnv(cliOptions.env);
        applyBcEnvFallback(env, cliOptions);
        injectBcSubsetToProcessEnv(env);

        const ctx = buildCtx(cmd, cliOptions, env);

        process.title = `bc-${cmd.name}|env=${env.BC_ENV ?? '?'}`;
        logger.banner({ command: cmd.name, target: ctx.target, mode: ctx.mode, env });

        if (cmd.needsBcConfig) preloadBcConfig(ctx);
        if (cmd.needsBuilderConfig) preloadBuilderConfig(ctx);

        await cmd.action(ctx);
    } catch (err) {
        logger.error(`${cmd.name} 失败：`, err.message);
        if (cliOptions?.debug) console.error(err.stack);
        process.exit(1);
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
