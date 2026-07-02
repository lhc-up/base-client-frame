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
    test('web 命令派生：app-only 字段取缺省值', () => {
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

    test('productName 缺失时回退 name', () => {
        const info = deriveBuildInfo(baseCtx(), { name: 'demo', version: '1.0.0' });
        expect(info.productName).toBe('demo');
    });

    test('envName 来自 BC_ENV_NAME', () => {
        const info = deriveBuildInfo(baseCtx({ env: { BC_ENV: 'prod', BC_ENV_NAME: '生产' } }), pkgJson);
        expect(info.envName).toBe('生产');
    });

    test('pack 命令派生：app-only 字段从 cliOptions 取', () => {
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

    test('child 命令派生：child=true，platform/arch=undefined，dir/sign=false', () => {
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

    test('encrypted/encryptKey 由外部传入（来自 bc.config + build/encrypt.key）', () => {
        const info = deriveBuildInfo(
            baseCtx({ target: 'app', command: 'pack' }),
            pkgJson,
            { encrypted: true, encryptKey: '0123456789abcdef0123456789abcdef' },
        );
        expect(info.encrypted).toBe(true);
        expect(info.encryptKey).toBe('0123456789abcdef0123456789abcdef');
    });

    test('encrypted=false 时 encryptKey 不出现于结果（即使被传入）', () => {
        const info = deriveBuildInfo(
            baseCtx({ target: 'app', command: 'pack' }),
            pkgJson,
            { encrypted: false, encryptKey: 'shouldBeIgnored' },
        );
        expect(info.encrypted).toBe(false);
        expect(info.encryptKey).toBeUndefined();
    });
});
