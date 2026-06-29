const webpack = require('webpack');
const logger = require('../core/logger');
const { extractStatsSummary } = require('./format-stats');
const { createCompileSpinner } = require('./compile-spinner');

async function runProductionBuild(configs, ctx) {
    const spinner = createCompileSpinner('编译中...', configs.length);
    spinner.start();

    try {
        const results = await Promise.allSettled(configs.map((cfg) => runOne(cfg, spinner)));
        const rejected = results.find((r) => r.status === 'rejected');
        if (rejected) throw rejected.reason;
    } finally {
        spinner.stop();
    }
}

function runOne(cfg, spinner) {
    return new Promise((resolve, reject) => {
        const fallbackName = cfg.name || 'webpack';
        const compiler = webpack(cfg, (err, stats) => {
            spinner.clear();

            const finalize = (action) => compiler.close(() => action());

            if (err) {
                logger.compileFailure(fallbackName);
                console.error(err.stack || err.message);
                spinner.tickInitial();
                return finalize(() => reject(err));
            }

            const sum = extractStatsSummary(stats, fallbackName);
            if (sum.errorCount > 0) {
                logger.compileFailure(sum.name);
                console.error(stats.toString({ colors: true }));
                spinner.tickInitial();
                return finalize(() => reject(new Error(`${sum.name} 编译失败`)));
            }

            logger.compileSuccess(sum.name, sum.ms, sum.totalSize);
            logger.compileWarning(sum.name, sum.warningCount);
            spinner.tickInitial();
            finalize(() => resolve());
        });
    });
}

module.exports = { runProductionBuild };
