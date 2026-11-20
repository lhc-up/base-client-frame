const { satisfies, ensureNodeVersion } = require('../../../src/core/node-version');
const { engines } = require('../../../package.json');

describe('core/node-version', () => {
    const range = '^20.19.0 || ^22.13.0 || >=24';

    test('satisfies：按 ^ / >= / || 判断', () => {
        expect(satisfies('v22.15.1', range)).toBe(true);
        expect(satisfies('v20.19.0', range)).toBe(true);
        expect(satisfies('v24.0.0', range)).toBe(true);
        expect(satisfies('v26.1.0', range)).toBe(true);
        expect(satisfies('v16.20.2', range)).toBe(false);
        expect(satisfies('v20.18.3', range)).toBe(false);
        expect(satisfies('v21.7.0', range)).toBe(false);
        expect(satisfies('v22.12.0', range)).toBe(false);
        expect(satisfies('v23.11.0', range)).toBe(false);
    });

    test('satisfies：不认识的写法返回 null', () => {
        expect(satisfies('v22.15.1', '~22.1.0')).toBeNull();
        expect(satisfies('v22.15.1', '')).toBeNull();
        expect(satisfies('abc', range)).toBeNull();
    });

    test('ensureNodeVersion：不满足时报错并返回 false，不认识时警告放行', () => {
        const output = { error: jest.fn(), warn: jest.fn() };
        expect(ensureNodeVersion({ version: 'v16.20.2', range, output })).toBe(false);
        expect(output.error.mock.calls[0][0]).toContain('当前 Node v16.20.2 不满足构建要求');
        expect(ensureNodeVersion({ version: 'v22.15.1', range: '~22.1.0', output })).toBe(true);
        expect(output.warn).toHaveBeenCalledTimes(1);
        expect(ensureNodeVersion({ version: 'v22.15.1', range, output })).toBe(true);
    });

    test('frame 自身的 engines.node 写法可被识别', () => {
        expect(satisfies(process.version, engines.node)).not.toBeNull();
    });
});
