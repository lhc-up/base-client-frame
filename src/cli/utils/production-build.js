const fse = require('fs-extra');
const path = require('path');
const webpack = require('webpack');
const { resolveBuildConfig } = require('../../config');
const logger = require('../../logger');
const { extractStatsSummary } = require('./format');
const { createCompileSpinner } = require('./compile-spinner');

function runOne(config, name, spinner) {
    return new Promise((resolve, reject) => {
        webpack(config, (err, stats) => {
            if (err) return reject(err);
            const summary = extractStatsSummary(stats, name);
            if (spinner) spinner.clear();
            if (summary.errorCount > 0) {
                logger.compileFailure(summary.name);
                console.error(stats.toString({ colors: true }));
                return reject(new Error(`${summary.name} 编译失败`));
            }
            logger.compileSuccess(summary.name, summary.ms, summary.totalSize);
            logger.compileWarning(summary.name, summary.warningCount);
            resolve();
        });
    });
}

async function runProductionBuild(ctx) {
    const rootDir = process.cwd();

    const appDir = path.resolve(rootDir, 'app');
    fse.emptyDirSync(appDir);

    const { main, preload, renderer } = resolveBuildConfig(ctx);

    const spinner = createCompileSpinner('编译中...');
    spinner.start();
    try {
        await Promise.all([
            runOne(main, 'main', spinner),
            runOne(preload, 'preload', spinner),
            runOne(renderer, 'renderer', spinner),
        ]);
    } finally {
        spinner.stop();
    }
}

module.exports = { runProductionBuild };
