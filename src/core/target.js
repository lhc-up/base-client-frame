const TARGETS = Object.freeze({
    APP: 'app',
    WEB: 'web',
});

const VALID_TARGETS = new Set(Object.values(TARGETS));

function deriveTarget(target) {
    if (!VALID_TARGETS.has(target)) {
        throw new Error(`[base-client] target 必须是 ${TARGETS.APP} 或 ${TARGETS.WEB}，收到: ${target}`);
    }
    return { isApp: target === TARGETS.APP, isWeb: target === TARGETS.WEB };
}

module.exports = { TARGETS, deriveTarget };
