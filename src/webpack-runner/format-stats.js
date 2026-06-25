function extractStatsSummary(stats, fallbackName) {
    const j = stats.toJson({
        assets: true,
        errors: true,
        warnings: true,
        modules: false,
        chunks: false,
        children: false,
    });
    const assets = j.assets || [];
    const errors = j.errors || [];
    const warnings = j.warnings || [];
    return {
        name: j.name || fallbackName,
        ms: j.time || 0,
        totalSize: assets.reduce((s, a) => s + (a.size || 0), 0),
        errorCount: errors.length,
        warningCount: warnings.length,
    };
}

module.exports = { extractStatsSummary };
