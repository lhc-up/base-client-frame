const { buildCtx } = require('../../../src/core/ctx');
const { MODES } = require('../../../src/core/mode');
const { TARGETS } = require('../../../src/core/target');

const cmd = (over = {}) => ({
    name: 'dev:web',
    target: TARGETS.WEB,
    mode: MODES.DEV,
    ...over,
});

describe('core/ctx', () => {
    test('buildCtx 派生 isDev/isProd/isApp/isWeb', () => {
        const ctx = buildCtx(cmd(), { port: 9000 }, { BC_ENV: 'prod' });
        expect(ctx.command).toBe('dev:web');
        expect(ctx.target).toBe('web');
        expect(ctx.mode).toBe('development');
        expect(ctx.isDev).toBe(true);
        expect(ctx.isProd).toBe(false);
        expect(ctx.isWeb).toBe(true);
        expect(ctx.isApp).toBe(false);
        expect(ctx.cliOptions).toEqual({ port: 9000 });
        expect(ctx.env).toEqual({ BC_ENV: 'prod' });
    });

    test('buildCtx 对 app/prod 命令派生正确', () => {
        const ctx = buildCtx(cmd({ name: 'pack', target: TARGETS.APP, mode: MODES.PROD }), {}, {});
        expect(ctx.isApp).toBe(true);
        expect(ctx.isWeb).toBe(false);
        expect(ctx.isProd).toBe(true);
        expect(ctx.isDev).toBe(false);
    });

    test('buildCtx 非法 mode/target 抛错', () => {
        expect(() => buildCtx(cmd({ mode: 'staging' }), {}, {})).toThrow(/mode 必须是/);
        expect(() => buildCtx(cmd({ target: 'mobile' }), {}, {})).toThrow(/target 必须是/);
    });
});
