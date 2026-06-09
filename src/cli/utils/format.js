function extractStatsSummary(stats, fallbackName) {
    const json = stats.toJson({
        assets: true,
        errors: true,
        warnings: true,
        modules: false,
        chunks: false,
        children: false,
        chunkGroups: false,
        chunkModules: false,
    });
    const name = json.name || fallbackName || '';
    const ms = json.time != null
        ? json.time
        : (stats.endTime - stats.startTime);
    const errorCount = (json.errors || []).length;
    const warningCount = (json.warnings || []).length;
    const totalSize = (json.assets || []).reduce(
        (sum, a) => sum + (a.size || 0), 0
    );
    return { name, ms, totalSize, errorCount, warningCount };
}

module.exports = { extractStatsSummary };
