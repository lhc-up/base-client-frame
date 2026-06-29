const mode = require('./core/mode');
const target = require('./core/target');
const logger = require('./core/logger');
const cli = require('./cli');
const { replace, customMerge } = require('./config/merge');

module.exports = {
    MODES: mode.MODES,
    TARGETS: target.TARGETS,
    createCli: cli.createCli,
    runCommand: cli.runCommand,
    replace,
    customMerge,
    logger,
};
