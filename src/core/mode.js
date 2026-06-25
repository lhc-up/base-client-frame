const MODES = Object.freeze({
    DEV: 'development',
    PROD: 'production',
});

const VALID_MODES = new Set(Object.values(MODES));

function deriveMode(mode) {
    if (!VALID_MODES.has(mode)) {
        throw new Error(`[base-client] mode 必须是 ${MODES.DEV} 或 ${MODES.PROD}，收到: ${mode}`);
    }
    return { isDev: mode === MODES.DEV, isProd: mode === MODES.PROD };
}

module.exports = { MODES, deriveMode };
