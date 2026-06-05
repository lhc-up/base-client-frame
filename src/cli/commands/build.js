const { runProductionBuild } = require('../utils/production-build');

module.exports = {
  name: 'build',
  description: '三进程生产构建（产物到 app/）',
  mode: 'production',
  options: [],
  action: async (ctx) => {
    await runProductionBuild({
      env: ctx.env,
      command: ctx.command,
      cliOptions: ctx.cliOptions,
    });
  },
};
