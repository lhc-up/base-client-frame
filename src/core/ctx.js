const { deriveMode } = require('./mode');
const { deriveTarget } = require('./target');

function buildCtx(cmd, cliOptions, env) {
    return {
        command: cmd.name,
        cliOptions,
        env,
        target: cmd.target,
        mode: cmd.mode,
        ...deriveTarget(cmd.target),
        ...deriveMode(cmd.mode),
    };
}

module.exports = { buildCtx };
