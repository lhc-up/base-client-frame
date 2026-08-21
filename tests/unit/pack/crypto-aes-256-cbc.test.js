const {
    normalizeKey,
    encryptBuffer,
    decryptBuffer,
} = require('../../../src/pack/crypto/aes-256-cbc');

const KEY = '0123456789abcdef0123456789abcdef';
const PLAINTEXT = Buffer.from('base-client-stage5-vector\n', 'utf8');
const CIPHERTEXT_HEX = '505bcd2871a6fde9daaea46d1738706727b0d2b74325e8548efdb193112eddf6';

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
});
