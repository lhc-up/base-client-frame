const { derivePackageDescriptor } = require('../../../src/pack/package-descriptor');

describe('pack/package-descriptor', () => {
    test('取 12 字段（含 child / encrypted），不含 encryptKey', () => {
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
            unpack: false,
            sign: true,
            child: false,
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
            unpack: false,
            sign: true,
            child: false,
            encrypted: true,
        });
        expect('encryptKey' in d).toBe(false);
        expect('target' in d).toBe(false);
    });

    test('child 命令产物：child=true，platform/arch 为 undefined（保留键）', () => {
        const buildInfo = {
            target: 'app',
            name: 'child-app',
            productName: 'Child App',
            version: '2.0.0',
            env: 'prod',
            envName: undefined,
            buildTime: 1700000000000,
            platform: undefined,
            arch: undefined,
            unpack: false,
            sign: false,
            child: true,
            encrypted: false,
        };
        const d = derivePackageDescriptor(buildInfo);
        expect(d.child).toBe(true);
        expect(d.platform).toBeUndefined();
        expect(d.arch).toBeUndefined();
        expect('platform' in d).toBe(true);
        expect('arch' in d).toBe(true);
    });
});
