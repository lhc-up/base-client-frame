const { extractStatsSummary } = require('../../../src/webpack-runner/format-stats');

function mockStats({ name = 'web', time = 1200, assets = [], errors = [], warnings = [] } = {}) {
    return {
        toJson: () => ({ name, time, assets, errors, warnings }),
    };
}

describe('webpack-runner/format-stats', () => {
    test('提取 name/ms/totalSize/errorCount/warningCount', () => {
        const stats = mockStats({
            assets: [{ size: 1000 }, { size: 2000 }, { size: 500 }],
            errors: [{ message: 'oh no' }],
            warnings: [{ message: 'careful' }, { message: 'careful again' }],
        });
        const sum = extractStatsSummary(stats, 'fallback');
        expect(sum.name).toBe('web');
        expect(sum.ms).toBe(1200);
        expect(sum.totalSize).toBe(3500);
        expect(sum.errorCount).toBe(1);
        expect(sum.warningCount).toBe(2);
    });

    test('name 缺失时用 fallbackName', () => {
        const stats = { toJson: () => ({ time: 100, assets: [] }) };
        const sum = extractStatsSummary(stats, 'fallback-name');
        expect(sum.name).toBe('fallback-name');
    });

    test('assets/errors/warnings 缺失时归零', () => {
        const stats = { toJson: () => ({ name: 'web', time: 100 }) };
        const sum = extractStatsSummary(stats, 'web');
        expect(sum.totalSize).toBe(0);
        expect(sum.errorCount).toBe(0);
        expect(sum.warningCount).toBe(0);
    });
});
