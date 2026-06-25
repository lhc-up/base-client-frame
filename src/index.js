const mode = require('./core/mode');
const target = require('./core/target');
const logger = require('./core/logger');

module.exports = {
    MODES: mode.MODES,
    TARGETS: target.TARGETS,
    logger,
};
