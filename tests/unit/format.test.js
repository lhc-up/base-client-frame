const { extractStatsSummary } = require('../../src/cli/utils/format');

function makeStats(json, { startTime = 0, endTime = 0 } = {}) {
    return {
        toJson: () => json,
        startTime,
        endTime,
    };
}

describe('extractStatsSummary', () => {
    test('从 json.name 取名称、json.time 取耗时、assets 累加体积', () => {
        const stats = makeStats({
            name: 'main',
            time: 1234,
            errors: [],
            warnings: [],
            assets: [{ size: 100 }, { size: 200 }, { size: 50 }],
        });
        expect(extractStatsSummary(stats)).toEqual({
            name: 'main',
            ms: 1234,
            totalSize: 350,
            errorCount: 0,
            warningCount: 0,
        });
    });

    test('json.name 缺失时 fallbackName 兜底', () => {
        const stats = makeStats({
            time: 1,
            errors: [],
            warnings: [],
            assets: [],
        });
        expect(extractStatsSummary(stats, 'preload').name).toBe('preload');
    });

    test('两侧都缺时 name 为空串', () => {
        const stats = makeStats({
            time: 1,
            errors: [],
            warnings: [],
            assets: [],
        });
        expect(extractStatsSummary(stats).name).toBe('');
    });

    test('json.time 缺失时退回 endTime - startTime', () => {
        const stats = makeStats(
            { name: 'x', errors: [], warnings: [], assets: [] },
            { startTime: 10, endTime: 510 }
        );
        expect(extractStatsSummary(stats).ms).toBe(500);
    });

    test('errors / warnings 计数', () => {
        const stats = makeStats({
            name: 'x',
            time: 1,
            errors: [{ message: 'e1' }, { message: 'e2' }],
            warnings: [{ message: 'w1' }],
            assets: [],
        });
        const s = extractStatsSummary(stats);
        expect(s.errorCount).toBe(2);
        expect(s.warningCount).toBe(1);
    });

    test('assets 缺失或为空时 totalSize=0', () => {
        const stats = makeStats({ name: 'x', time: 1, errors: [], warnings: [] });
        expect(extractStatsSummary(stats).totalSize).toBe(0);
    });

    test('asset.size 缺失时按 0 累加,不抛错', () => {
        const stats = makeStats({
            name: 'x',
            time: 1,
            errors: [],
            warnings: [],
            assets: [{ size: 100 }, {}, { size: 200 }],
        });
        expect(extractStatsSummary(stats).totalSize).toBe(300);
    });
});
