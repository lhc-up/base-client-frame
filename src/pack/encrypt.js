const path = require('path');
const fse = require('fs-extra');
const { normalizeKey, normalizeIv, encryptBuffer } = require('./crypto/aes-256-cbc');

function computeCryptoState({ userConfig }) {
    if (userConfig.encrypt === false) return { encrypted: false };

    const encryptConfig = userConfig.encrypt;
    if (!encryptConfig || typeof encryptConfig !== 'object' || !encryptConfig.key) {
        throw new Error('[base-client] encrypt.key is required when encryption is enabled');
    }

    const encryptKey = String(encryptConfig.key).replace(/\r?\n$/, '');
    const encryptIv = encryptConfig.iv;
    try {
        normalizeKey(encryptKey);
        if (encryptIv !== undefined) normalizeIv(encryptIv);
    } catch (err) {
        throw new Error(`[base-client] encrypt config invalid: ${err.message}`);
    }
    return {
        encrypted: true,
        encryptKey,
        ...(encryptIv === undefined ? {} : { encryptIv }),
    };
}

async function encryptRenderer({ appDir, encryptKey, encryptIv }) {
    normalizeKey(encryptKey);
    if (encryptIv !== undefined) normalizeIv(encryptIv);

    const entries = fse.readdirSync(appDir, { withFileTypes: true });
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (ent.name === 'main') continue;
        await encryptDirRecursive(path.join(appDir, ent.name), encryptKey, encryptIv);
    }
}

async function encryptDirRecursive(dir, encryptKey, encryptIv) {
    const entries = fse.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            await encryptDirRecursive(p, encryptKey, encryptIv);
            continue;
        }
        if (!ent.name.endsWith('.js')) continue;

        const raw = fse.readFileSync(p);
        fse.writeFileSync(p, encryptBuffer(raw, encryptKey, encryptIv));
    }
}

module.exports = { computeCryptoState, encryptRenderer };
