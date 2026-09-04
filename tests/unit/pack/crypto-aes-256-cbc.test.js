const {
    normalizeKey,
    normalizeIv,
    encryptBuffer,
    decryptBuffer,
} = require('../../../src/pack/crypto/aes-256-cbc');

const KEY = '0123456789abcdef0123456789abcdef';
const PLAINTEXT = Buffer.from('base-client-stage5-vector\n', 'utf8');
const CIPHERTEXT_HEX = '505bcd2871a6fde9daaea46d1738706727b0d2b74325e8548efdb193112eddf6';
const LEGACY_IV = 'fedcba9876543210';
const LEGACY_PLAINTEXT = Buffer.from('base-client-stage1-legacy-iv\n', 'utf8');
const LEGACY_CIPHERTEXT_HEX = '6cfe6f0d30f8ce78e9a7d49d6298ea7e5cc90026cbc595f5b05f600bab553b26';

describe('pack/crypto/aes-256-cbc', () => {
    test('固定向量可确定性加密并解密', () => {
        const encrypted = encryptBuffer(PLAINTEXT, KEY);
        expect(encrypted.toString('hex')).toBe(CIPHERTEXT_HEX);
        expect(decryptBuffer(encrypted, KEY)).toEqual(PLAINTEXT);
    });

    test.each([
        ['少于 32 字节', 'a'.repeat(31), /32/],
        ['多于 32 字节', 'a'.repeat(33), /32/],
        ['包含非 ASCII 字符', `密${'a'.repeat(30)}`, /ASCII/],
    ])('%s 时拒绝 key', (_label, key, error) => {
        expect(() => normalizeKey(key)).toThrow(error);
    });

    test('只接受 Buffer 数据，避免 codec 隐式承担文本编码', () => {
        expect(() => encryptBuffer('plain text', KEY)).toThrow(/Buffer/);
        expect(() => decryptBuffer('cipher text', KEY)).toThrow(/Buffer/);
    });

    test('显式 legacy IV 产生固定密文并可解密', () => {
        const encrypted = encryptBuffer(LEGACY_PLAINTEXT, KEY, LEGACY_IV);
        expect(encrypted.toString('hex')).toBe(LEGACY_CIPHERTEXT_HEX);
        expect(decryptBuffer(encrypted, KEY, LEGACY_IV)).toEqual(LEGACY_PLAINTEXT);
    });

    test.each([
        ['少于 16 字节', 'a'.repeat(15), /16/],
        ['多于 16 字节', 'a'.repeat(17), /16/],
        ['包含非 ASCII 字符', `密${'a'.repeat(14)}`, /ASCII/],
    ])('%s 时拒绝显式 IV', (_label, iv, error) => {
        expect(() => normalizeIv(iv)).toThrow(error);
    });
});
