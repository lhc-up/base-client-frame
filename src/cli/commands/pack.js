const { resolvePackConfig } = require('../../config/pack');
const { runProductionBuild } = require('../utils/production-build');
const {
  buildTargets,
  resolveElectronBuilder,
} = require('../utils/electron-builder');

async function action(ctx) {
  const { env, mode, command, cliOptions } = ctx;
  const rootDir = process.cwd();

  const mergedConfig = resolvePackConfig({ env, mode, command, cliOptions });

  await runProductionBuild({ env, command, cliOptions });

  const builderPath = resolveElectronBuilder(rootDir);
  const electronBuilder = require(builderPath);

  const targets = buildTargets(cliOptions);

  await electronBuilder.build({ ...targets, config: mergedConfig });
}

module.exports = {
  name: 'pack',
  description: '产出指定平台/架构的安装包',
  mode: 'production',
  options: [
    ['--pack-config <path>', '指定 electron-builder.config.js 路径'],
    ['--platform <p>', '目标平台：win | mac | linux'],
    ['--arch <a>', '目标架构：ia32 | x64 | armv7l | arm64 | universal | loong64'],
    ['--unpack', '产出免安装目录（不打 installer）'],
    ['--sign', '触发签名'],
  ],
  action,
};
