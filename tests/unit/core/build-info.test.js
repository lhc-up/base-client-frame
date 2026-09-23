const { deriveBuildInfo } = require('../../../src/core/build-info');

const pkgJson = { name: 'demo', productName: 'Demo App', version: '1.2.3' };
const baseCtx = (over = {}) => ({
    target: 'web',
    command: 'dev:web',
    cliOptions: {},
    env: { BC_ENV: 'prod' },
    ...over,
});

describe('core/build-info', () => {
    test('web command emits app-only fields as defaults', () => {
        const info = deriveBuildInfo(baseCtx(), pkgJson);
        expect(info.target).toBe('web');
        expect(info.name).toBe('demo');
        expect(info.productName).toBe('Demo App');
        expect(info.version).toBe('1.2.3');
        expect(info.env).toBe('prod');
        expect(info.envName).toBeUndefined();
        expect(typeof info.buildTime).toBe('number');
        expect(info.platform).toBeUndefined();
        expect(info.arch).toBeUndefined();
        expect(info.dir).toBe(false);
        expect(info.sign).toBe(false);
        expect(info.child).toBe(false);
        expect(info.encrypted).toBe(false);
        expect(info.encryptKey).toBeUndefined();
    });

    test('falls back to name when productName is missing', () => {
        const info = deriveBuildInfo(baseCtx(), { name: 'demo', version: '1.0.0' });
        expect(info.productName).toBe('demo');
    });

    test('reads envName from BC_ENV_NAME', () => {
        const info = deriveBuildInfo(baseCtx({ env: { BC_ENV: 'prod', BC_ENV_NAME: 'production' } }), pkgJson);
        expect(info.envName).toBe('production');
    });

    test('pack command derives app-only fields from cliOptions', () => {
        const info = deriveBuildInfo(
            baseCtx({
                target: 'app',
                command: 'pack',
                cliOptions: { platform: 'win', arch: 'x64', dir: true, sign: true },
            }),
            pkgJson,
        );
        expect(info.target).toBe('app');
        expect(info.platform).toBe('win');
        expect(info.arch).toBe('x64');
        expect(info.dir).toBe(true);
        expect(info.sign).toBe(true);
        expect(info.child).toBe(false);
    });

    test('child command sets child=true and leaves platform/arch unset', () => {
        const info = deriveBuildInfo(
            baseCtx({ target: 'app', command: 'child', cliOptions: {} }),
            pkgJson,
        );
        expect(info.child).toBe(true);
        expect(info.platform).toBeUndefined();
        expect(info.arch).toBeUndefined();
        expect(info.dir).toBe(false);
        expect(info.sign).toBe(false);
    });

    test('accepts encrypted state supplied by the frame config pipeline', () => {
        const info = deriveBuildInfo(
            baseCtx({ target: 'app', command: 'pack' }),
            pkgJson,
            { encrypted: true, encryptKey: '0123456789abcdef0123456789abcdef' },
        );
        expect(info.encrypted).toBe(true);
        expect(info.encryptKey).toBe('0123456789abcdef0123456789abcdef');
    });

    test('does not expose encryptKey when encryption is disabled', () => {
        const info = deriveBuildInfo(
            baseCtx({ target: 'app', command: 'pack' }),
            pkgJson,
            { encrypted: false, encryptKey: 'shouldBeIgnored' },
        );
        expect(info.encrypted).toBe(false);
        expect(info.encryptKey).toBeUndefined();
    });
});
