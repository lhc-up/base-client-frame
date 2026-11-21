const mode = require('./core/mode');
const target = require('./core/target');
const logger = require('./core/logger');
const cli = require('./cli');
const { replace, customMerge } = require('./config/merge');
const { styleLoader } = require('./config/presets/renderer-defaults');

module.exports = {
    MODES: mode.MODES,
    TARGETS: target.TARGETS,
    createCli: cli.createCli,
    runCommand: cli.runCommand,
    replace,
    customMerge,
    styleLoader,
    logger,
};
