const { derivePackageDescriptor } = require('../../../src/pack/package-descriptor');

describe('pack/package-descriptor', () => {
    test('取 11 字段（含 encrypted），不含 encryptKey / target / child', () => {
        const buildInfo = {
            target: 'app',
            name: 'demo',
            productName: 'Demo App',
            version: '1.0.0',
            env: 'prod',
            envName: '生产',
            buildTime: 1700000000000,
            platform: 'win',
            arch: 'x64',
            dir: false,
            sign: true,
            encrypted: true,
            encryptKey: 'SECRET_KEY_THIS_SHOULD_NOT_LEAK',
        };
        const d = derivePackageDescriptor(buildInfo);
        expect(d).toEqual({
            name: 'demo',
            productName: 'Demo App',
            version: '1.0.0',
            env: 'prod',
            envName: '生产',
            buildTime: 1700000000000,
            platform: 'win',
            arch: 'x64',
            dir: false,
            sign: true,
            encrypted: true,
        });
        expect('encryptKey' in d).toBe(false);
        expect('target' in d).toBe(false);
        expect('child' in d).toBe(false);
    });

    test('platform/arch 为 undefined 时保留键', () => {
        const d = derivePackageDescriptor({
            name: 'demo', version: '2.0.0', env: 'prod', platform: undefined, arch: undefined,
        });
        expect('platform' in d).toBe(true);
        expect('arch' in d).toBe(true);
    });
});
