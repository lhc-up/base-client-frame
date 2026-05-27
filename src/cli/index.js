require('../env/init.js')();
const { cac } = require('cac');
const { version } = require('../../package.json');
const { dev } = require('./commands/dev');
const { build } = require('./commands/build');
const { preview } = require('./commands/preview');

const cli = cac('base-client');

cli.command('dev', '启动开发服务器 + Electron').action(async () => {
    await dev();
});

cli.command('build', '生产环境构建').action(async () => {
    await build();
});

cli.command('preview', '预览构建结果').action(async () => {
    await preview();
});

cli.help();
cli.version(version);

module.exports = { cli };