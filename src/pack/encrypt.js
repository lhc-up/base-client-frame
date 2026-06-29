const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function computeCryptoState({ rootDir, userConfig }) {
    if (userConfig.encrypt === false) return { encrypted: false };

    const keyPath = path.join(rootDir, 'build/encrypt.key');
    if (!fs.existsSync(keyPath)) {
        throw new Error(`[base-client] 启用了 encrypt 但未找到 build/encrypt.key，请提供密钥文件或在 bc.config.js 设 encrypt: false`);
    }

    const encryptKey = fs.readFileSync(keyPath, 'utf8').replace(/\r?\n$/, '');
    if (Buffer.byteLength(encryptKey, 'utf8') !== encryptKey.length) {
        throw new Error('[base-client] build/encrypt.key 必须为 ASCII 字符（IV 取前 16 字符，多字节会破坏字节对齐）');
    }
    if (encryptKey.length < 32) {
        throw new Error(`[base-client] build/encrypt.key 长度为 ${encryptKey.length}，AES-256 要求 ≥ 32 字符`);
    }
    return { encrypted: true, encryptKey };
}

async function encryptRenderer({ appDir, encryptKey }) {
    const key = Buffer.from(encryptKey, 'utf8');
    const iv = Buffer.from(encryptKey.slice(0, 16), 'utf8');

    const entries = fs.readdirSync(appDir, { withFileTypes: true });
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (ent.name === 'main') continue;
        await encryptDirRecursive(path.join(appDir, ent.name), key, iv);
    }
}

async function encryptDirRecursive(dir, key, iv) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            await encryptDirRecursive(p, key, iv);
            continue;
        }
        if (!ent.name.endsWith('.js')) continue;

        const raw = fs.readFileSync(p);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
        fs.writeFileSync(p, encrypted);
    }
}

module.exports = { computeCryptoState, encryptRenderer };
