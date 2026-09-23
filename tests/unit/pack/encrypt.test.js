const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const crypto = require('crypto');
const { computeCryptoState, encryptRenderer } = require('../../../src/pack/encrypt');

const tmpRoot = path.join(__dirname, '../../tmp/encrypt');
const KEY = '0123456789abcdef0123456789abcdef';
const LEGACY_IV = 'fedcba9876543210';

beforeEach(() => fse.ensureDirSync(tmpRoot));
afterEach(() => fse.removeSync(tmpRoot));

describe('pack/encrypt.computeCryptoState', () => {
    test('reads the key from bc.config encrypt.key without a key file', () => {
        expect(computeCryptoState({
            rootDir: tmpRoot,
            userConfig: { encrypt: { key: KEY } },
        })).toEqual({ encrypted: true, encryptKey: KEY });
    });

    test('requires encrypt.key when encryption is enabled', () => {
        expect(() => computeCryptoState({ rootDir: tmpRoot, userConfig: {} }))
            .toThrow(/encrypt\.key/);
        expect(() => computeCryptoState({ rootDir: tmpRoot, userConfig: { encrypt: true } }))
            .toThrow(/encrypt\.key/);
    });

    test('encrypt false remains an explicit opt-out', () => {
        expect(computeCryptoState({ rootDir: tmpRoot, userConfig: { encrypt: false } }))
            .toEqual({ encrypted: false });
    });

    test('validates key and optional IV', () => {
        expect(() => computeCryptoState({
            rootDir: tmpRoot,
            userConfig: { encrypt: { key: 'short' } },
        })).toThrow(/32/);
        expect(() => computeCryptoState({
            rootDir: tmpRoot,
            userConfig: { encrypt: { key: `${KEY}x` } },
        })).toThrow(/32/);
        expect(() => computeCryptoState({
            rootDir: tmpRoot,
            userConfig: { encrypt: { key: KEY, iv: 'short' } },
        })).toThrow(/16/);
        expect(computeCryptoState({
            rootDir: tmpRoot,
            userConfig: { encrypt: { key: `${KEY}\r\n`, iv: LEGACY_IV } },
        })).toEqual({ encrypted: true, encryptKey: KEY, encryptIv: LEGACY_IV });
    });

    test('rejects non-ASCII keys', () => {
        expect(() => computeCryptoState({
            rootDir: tmpRoot,
            userConfig: { encrypt: { key: '密钥0123456789abcdef0123456789abcd' } },
        })).toThrow(/ASCII/);
    });
});

describe('pack/encrypt.encryptRenderer', () => {
    test('encrypts app/<except main>/**/*.js and leaves main untouched', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(path.join(appDir, 'main'));
        fse.ensureDirSync(path.join(appDir, 'renderer'));
        fse.ensureDirSync(path.join(appDir, 'preload'));
        fse.ensureDirSync(path.join(appDir, 'update'));
        const mainContent = 'console.log("main");';
        const rendererContent = 'console.log("renderer");';
        const preloadContent = 'console.log("preload");';
        const updateContent = 'console.log("update");';
        fs.writeFileSync(path.join(appDir, 'main/index.js'), mainContent);
        fs.writeFileSync(path.join(appDir, 'renderer/index.js'), rendererContent);
        fs.writeFileSync(path.join(appDir, 'preload/index.js'), preloadContent);
        fs.writeFileSync(path.join(appDir, 'update/index.js'), updateContent);

        await encryptRenderer({ appDir, encryptKey: KEY });

        expect(fs.readFileSync(path.join(appDir, 'main/index.js'), 'utf8')).toBe(mainContent);
        expect(fs.readFileSync(path.join(appDir, 'renderer/index.js'), 'utf8')).not.toBe(rendererContent);
        expect(fs.readFileSync(path.join(appDir, 'preload/index.js'), 'utf8')).not.toBe(preloadContent);
        expect(fs.readFileSync(path.join(appDir, 'update/index.js'), 'utf8')).not.toBe(updateContent);
    });

    test('encrypted output decrypts with the default IV', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(path.join(appDir, 'renderer'));
        const original = 'console.log("hello world");';
        const filePath = path.join(appDir, 'renderer/index.js');
        fs.writeFileSync(filePath, original);
        await encryptRenderer({ appDir, encryptKey: KEY });

        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(KEY), Buffer.from(KEY.slice(0, 16)));
        const decrypted = Buffer.concat([
            decipher.update(fs.readFileSync(filePath)),
            decipher.final(),
        ]).toString('utf8');
        expect(decrypted).toBe(original);
    });

    test('supports an explicit legacy IV', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(path.join(appDir, 'renderer'));
        const original = 'console.log("legacy iv");';
        const filePath = path.join(appDir, 'renderer/index.js');
        fs.writeFileSync(filePath, original);
        await encryptRenderer({ appDir, encryptKey: KEY, encryptIv: LEGACY_IV });

        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(KEY), Buffer.from(LEGACY_IV));
        const decrypted = Buffer.concat([
            decipher.update(fs.readFileSync(filePath)),
            decipher.final(),
        ]).toString('utf8');
        expect(decrypted).toBe(original);
    });

    test('recursively encrypts nested JavaScript files', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(path.join(appDir, 'renderer/sub'));
        const filePath = path.join(appDir, 'renderer/sub/deep.js');
        fs.writeFileSync(filePath, 'console.log("nested");');
        await encryptRenderer({ appDir, encryptKey: KEY });
        expect(fs.readFileSync(filePath, 'utf8')).not.toBe('console.log("nested");');
    });

    test('leaves non-JavaScript files unencrypted', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(path.join(appDir, 'renderer'));
        fs.writeFileSync(path.join(appDir, 'renderer/index.html'), '<html></html>');
        fs.writeFileSync(path.join(appDir, 'renderer/style.css'), 'body { color: red; }');
        await encryptRenderer({ appDir, encryptKey: KEY });
        expect(fs.readFileSync(path.join(appDir, 'renderer/index.html'), 'utf8')).toBe('<html></html>');
        expect(fs.readFileSync(path.join(appDir, 'renderer/style.css'), 'utf8')).toBe('body { color: red; }');
    });
});
