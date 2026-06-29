const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const crypto = require('crypto');
const { computeCryptoState, encryptRenderer } = require('../../../src/pack/encrypt');

const tmpRoot = path.join(__dirname, '../../tmp/encrypt');
const KEY = '0123456789abcdef0123456789abcdef';

beforeEach(() => { fse.ensureDirSync(tmpRoot); });
afterEach(() => { fse.removeSync(tmpRoot); });

describe('pack/encrypt.computeCryptoState', () => {
    test('encrypt 默认 (undefined) 且 build/encrypt.key 存在 → encrypted=true', () => {
        fse.ensureDirSync(path.join(tmpRoot, 'build'));
        fs.writeFileSync(path.join(tmpRoot, 'build/encrypt.key'), KEY + '\n');
        const s = computeCryptoState({ rootDir: tmpRoot, userConfig: {} });
        expect(s.encrypted).toBe(true);
        expect(s.encryptKey).toBe(KEY);
    });

    test('encrypt: false → encrypted=false，不读密钥', () => {
        fse.ensureDirSync(path.join(tmpRoot, 'build'));
        fs.writeFileSync(path.join(tmpRoot, 'build/encrypt.key'), KEY);
        const s = computeCryptoState({ rootDir: tmpRoot, userConfig: { encrypt: false } });
        expect(s.encrypted).toBe(false);
        expect(s.encryptKey).toBeUndefined();
    });

    test('encrypt: true 但密钥文件缺失 → 抛错', () => {
        expect(() => computeCryptoState({ rootDir: tmpRoot, userConfig: { encrypt: true } })).toThrow(/encrypt\.key/);
    });

    test('encrypt 缺省（默认 true）且密钥缺失 → 抛错（与显式 encrypt:true 等价）', () => {
        expect(() => computeCryptoState({ rootDir: tmpRoot, userConfig: {} })).toThrow(/encrypt\.key/);
    });

    test('密钥文件末尾换行被去除', () => {
        fse.ensureDirSync(path.join(tmpRoot, 'build'));
        fs.writeFileSync(path.join(tmpRoot, 'build/encrypt.key'), KEY + '\r\n');
        const s = computeCryptoState({ rootDir: tmpRoot, userConfig: { encrypt: true } });
        expect(s.encryptKey).toBe(KEY);
    });

    test('密钥含多字节字符 → 抛错（IV 字节对齐要求 ASCII）', () => {
        fse.ensureDirSync(path.join(tmpRoot, 'build'));
        const nonAscii = '密钥0123456789abcdef0123456789abcd';
        fs.writeFileSync(path.join(tmpRoot, 'build/encrypt.key'), nonAscii);
        expect(() => computeCryptoState({ rootDir: tmpRoot, userConfig: {} })).toThrow(/ASCII/);
    });

    test('密钥长度 < 32 → 抛错（AES-256 长度约束）', () => {
        fse.ensureDirSync(path.join(tmpRoot, 'build'));
        fs.writeFileSync(path.join(tmpRoot, 'build/encrypt.key'), 'tooshort');
        expect(() => computeCryptoState({ rootDir: tmpRoot, userConfig: {} })).toThrow(/≥ 32/);
    });
});

describe('pack/encrypt.encryptRenderer', () => {
    test('加密 app/<除 main 外>/**/*.js，main 不动', async () => {
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

    test('加密产物可用同算法解密回原文（aes-256-cbc，IV=key.slice(0,16)）', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(path.join(appDir, 'renderer'));
        const original = 'console.log("hello world");';
        const filePath = path.join(appDir, 'renderer/index.js');
        fs.writeFileSync(filePath, original);

        await encryptRenderer({ appDir, encryptKey: KEY });

        const encrypted = fs.readFileSync(filePath);
        const iv = Buffer.from(KEY.slice(0, 16), 'utf8');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(KEY, 'utf8'), iv);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
        expect(decrypted).toBe(original);
    });

    test('递归加密渲染入口下的所有 .js（不仅顶层）', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(path.join(appDir, 'renderer/sub'));
        const original = 'console.log("nested");';
        const filePath = path.join(appDir, 'renderer/sub/deep.js');
        fs.writeFileSync(filePath, original);

        await encryptRenderer({ appDir, encryptKey: KEY });

        expect(fs.readFileSync(filePath, 'utf8')).not.toBe(original);
    });

    test('非 .js 文件不加密（如 .html / .css / asset）', async () => {
        const appDir = path.join(tmpRoot, 'app');
        fse.ensureDirSync(path.join(appDir, 'renderer'));
        const htmlContent = '<html></html>';
        const cssContent = 'body { color: red; }';
        fs.writeFileSync(path.join(appDir, 'renderer/index.html'), htmlContent);
        fs.writeFileSync(path.join(appDir, 'renderer/style.css'), cssContent);

        await encryptRenderer({ appDir, encryptKey: KEY });

        expect(fs.readFileSync(path.join(appDir, 'renderer/index.html'), 'utf8')).toBe(htmlContent);
        expect(fs.readFileSync(path.join(appDir, 'renderer/style.css'), 'utf8')).toBe(cssContent);
    });
});
