const { cac } = require('cac');
const { initEnv } = require('../env');
const { version } = require('../../package.json');

function createCli(commandList) {
  const commands = commandList === undefined
    ? require('./commands')
    : commandList;

  const cli = cac('base-client');

  cli.option('-e, --env <name>', '指定环境名，加载 .env.<name>', { default: 'prod' });
  cli.option('-c, --config <path>', '指定 bc.config.js 路径');
  cli.option('--debug', '出错时附打印 err.stack');

  for (const cmd of commands) {
    const c = cli.command(cmd.name, cmd.description || '');
    (cmd.options || []).forEach(([flag, desc, cfg]) => c.option(flag, desc, cfg));
    c.action((...args) => {
      const cliOptions = args[args.length - 1];
      return runCommand(cmd, cliOptions);
    });
  }

  cli.help();
  cli.version(version);
  return cli;
}

async function runCommand(cmd, cliOptions) {
  try {
    const env = cmd.skipEnv ? undefined : initEnv(cliOptions.env);
    const mode = cmd.mode || 'production';
    const ctx = { cliOptions, env, mode, command: cmd.name };
    await cmd.action(ctx);
  } catch (err) {
    console.error(`[base-client] ${cmd.name} 失败：${err.message}`);
    if (cliOptions && cliOptions.debug) console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { createCli, runCommand };
