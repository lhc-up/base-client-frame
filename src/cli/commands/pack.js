const fse = require('fs-extra');
const path = require('path');
const { MODES } = require('../../mode');
const { resolvePackConfig } = require('../../config/pack');
const { runProductionBuild } = require('../utils/production-build');
const {
    buildTargets,
    resolveElectronBuilder,
} = require('../utils/electron-builder');

async function action(ctx) {
    const { cliOptions } = ctx;
    const rootDir = process.cwd();

    const mergedConfig = resolvePackConfig(ctx);

    fse.emptyDirSync(path.resolve(rootDir, mergedConfig?.directories?.output));

    await runProductionBuild(ctx);

    const builderPath = resolveElectronBuilder(rootDir);
    const electronBuilder = require(builderPath);

    const targets = buildTargets(cliOptions);

    await electronBuilder.build({ ...targets, config: mergedConfig });
}

module.exports = {
    name: 'pack',
    description: '产出指定平台/架构的安装包',
    mode: MODES.PROD,
    options: [
        ['--pack-config <path>', '指定 electron-builder.config.js 路径'],
        ['--platform <p>', '目标平台：win | mac | linux'],
        ['--arch <a>', '目标架构：ia32 | x64 | armv7l | arm64 | universal | loong64'],
        ['--unpack', '产出免安装目录（不打 installer）'],
        ['--sign', '触发签名'],
    ],
    action,
};
