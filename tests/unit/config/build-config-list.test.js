const {
    collectProductionConfigs,
    selectDevRendererConfigs,
    toConfigList,
} = require('../../../src/config/build-config-list');

describe('config/build-config-list', () => {
    test('生产构建展开 renderer 数组并移除 devServer 元数据', () => {
        const main = { name: 'main' };
        const preload = { name: 'preload' };
        const update = { name: 'update' };
        const renderer = { name: 'renderer', devServer: { port: 8023 } };

        expect(collectProductionConfigs({ main, preload, renderer: [update, renderer] })).toEqual([
            main,
            preload,
            update,
            { name: 'renderer' },
        ]);
        expect(renderer.devServer).toEqual({ port: 8023 });
    });

    test('单 renderer 保持现有默认 dev server 行为', () => {
        const renderer = { name: 'renderer' };
        expect(selectDevRendererConfigs(renderer)).toEqual({
            served: renderer,
            oneShot: [],
        });
        expect(toConfigList(renderer)).toEqual([renderer]);
    });

    test('renderer 数组只允许一个显式 dev server', () => {
        const update = { name: 'update' };
        const renderer = { name: 'renderer', devServer: { port: 8023 } };
        expect(selectDevRendererConfigs([update, renderer])).toEqual({
            served: renderer,
            oneShot: [update],
        });
        expect(() => selectDevRendererConfigs([update])).toThrow(/exactly one.*devServer/i);
        expect(() => selectDevRendererConfigs([
            { name: 'one', devServer: {} },
            { name: 'two', devServer: {} },
        ])).toThrow(/exactly one.*devServer/i);
    });
});
