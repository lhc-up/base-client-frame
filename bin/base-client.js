#!/usr/bin/env node
// 第一步检查构建用的 Node 版本：版本不对时后续模块可能连加载都会失败（见 src/core/node-version.js）
const { ensureNodeVersion } = require('../src/core/node-version');
const { engines } = require('../package.json');

if (!ensureNodeVersion({ version: process.version, range: engines && engines.node })) {
    process.exit(1);
}

const { createCli } = require('../src/cli');
createCli().parse();
