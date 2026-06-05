const { initEnv } = require('../env');

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

module.exports = { runCommand };
