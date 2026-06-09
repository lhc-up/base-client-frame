const { MODES } = require('../../mode');
const { runProductionBuild } = require('../utils/production-build');

module.exports = {
    name: 'build',
    description: '三进程生产构建（产物到 app/）',
    mode: MODES.PROD,
    options: [],
    action: async (ctx) => {
        await runProductionBuild(ctx);
    },
};
