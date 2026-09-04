const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const KEY_BYTES = 32;
const IV_BYTES = 16;

function normalizeKey(value) {
    const key = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(String(value), 'utf8');
    const isAscii = [...key].every(byte => byte <= 0x7f);
    if (!isAscii) {
        throw new Error('AES-256-CBC key 必须为 ASCII 字符');
    }
    if (key.length !== KEY_BYTES) {
        throw new Error(`AES-256-CBC key 必须恰好为 ${KEY_BYTES} 字节，收到 ${key.length} 字节`);
    }
    return {
        key,
        iv: key.subarray(0, IV_BYTES),
    };
}

function normalizeIv(value) {
    const iv = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(String(value), 'utf8');
    const isAscii = [...iv].every(byte => byte <= 0x7f);
    if (!isAscii) {
        throw new Error('AES-256-CBC IV 必须为 ASCII 字符');
    }
    if (iv.length !== IV_BYTES) {
        throw new Error(`AES-256-CBC IV 必须恰好为 ${IV_BYTES} 字节，收到 ${iv.length} 字节`);
    }
    return iv;
}

function resolveKeyAndIv(keyValue, ivValue) {
    const normalized = normalizeKey(keyValue);
    if (ivValue !== undefined) normalized.iv = normalizeIv(ivValue);
    return normalized;
}

function assertBuffer(value, name) {
    if (!Buffer.isBuffer(value)) {
        throw new TypeError(`${name} 必须是 Buffer`);
    }
}

function encryptBuffer(plain, keyValue, ivValue) {
    assertBuffer(plain, 'plain');
    const { key, iv } = resolveKeyAndIv(keyValue, ivValue);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    return Buffer.concat([cipher.update(plain), cipher.final()]);
}

function decryptBuffer(encrypted, keyValue, ivValue) {
    assertBuffer(encrypted, 'encrypted');
    const { key, iv } = resolveKeyAndIv(keyValue, ivValue);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

module.exports = {
    ALGORITHM,
    KEY_BYTES,
    IV_BYTES,
    normalizeKey,
    normalizeIv,
    encryptBuffer,
    decryptBuffer,
};
