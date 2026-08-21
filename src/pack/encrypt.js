const path = require('path');
const fse = require('fs-extra');
const { normalizeKey, encryptBuffer } = require('./crypto/aes-256-cbc');

function computeCryptoState({ rootDir, userConfig }) {
    if (userConfig.encrypt === false) return { encrypted: false };

    const keyPath = path.join(rootDir, 'build/encrypt.key');
    if (!fse.existsSync(keyPath)) {
        throw new Error(`[base-client] 启用了 encrypt 但未找到 build/encrypt.key，请提供密钥文件或在 bc.config.js 设 encrypt: false`);
    }

    const encryptKey = fse.readFileSync(keyPath, 'utf8').replace(/\r?\n$/, '');
    try {
        normalizeKey(encryptKey);
    } catch (err) {
        throw new Error(`[base-client] build/encrypt.key 无效：${err.message}`);
    }
    return { encrypted: true, encryptKey };
}

async function encryptRenderer({ appDir, encryptKey }) {
    normalizeKey(encryptKey);

    const entries = fse.readdirSync(appDir, { withFileTypes: true });
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (ent.name === 'main') continue;
        await encryptDirRecursive(path.join(appDir, ent.name), encryptKey);
    }
}

async function encryptDirRecursive(dir, encryptKey) {
    const entries = fse.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            await encryptDirRecursive(p, encryptKey);
            continue;
        }
        if (!ent.name.endsWith('.js')) continue;

        const raw = fse.readFileSync(p);
        fse.writeFileSync(p, encryptBuffer(raw, encryptKey));
    }
}

module.exports = { computeCryptoState, encryptRenderer };
