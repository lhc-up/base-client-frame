const path = require('path');
const fse = require('fs-extra');
const { normalizeKey, normalizeIv, encryptBuffer } = require('./crypto/aes-256-cbc');
const { createLayout } = require('../paths');

const UNSUPPORTED_MESSAGE = '[base-client] 暂不支持产物加密：运行时解密尚未实现，开启后页面与 preload 无法加载。'
    + '请删除 bc.config 的 encrypt 配置（或写 encrypt: false）';

/**
 * 加密状态。产物加密暂不支持（运行时没有解密，见 docs/crypto-artifact-contract.md）：
 * 不写 `encrypt` 或写 `false` 为不加密，写了其他值直接报错，避免打出打不开的包。
 *
 * @param {{ userConfig: Object }} options
 * @returns {{ encrypted: false }}
 * @throws {Error} 配置了 encrypt
 */
function computeCryptoState({ userConfig }) {
    if (userConfig.encrypt === undefined || userConfig.encrypt === false) {
        return { encrypted: false };
    }
    throw new Error(UNSUPPORTED_MESSAGE);
}

/**
 * 解析并校验 `encrypt: { key, iv? }`。
 *
 * 加密暂不支持，当前没有调用方；与 `encryptRenderer` 一起保留，恢复加密时由 computeCryptoState 调用。
 *
 * @param {*} encryptConfig
 * @returns {{ encrypted: true, encryptKey: string, encryptIv?: string }}
 */
function parseEncryptConfig(encryptConfig) {
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

    // 主进程产物目录不加密（由 Electron 直接加载）
    const { out } = createLayout('');
    const mainDirName = path.relative(out.root, path.dirname(out.main));
    const entries = fse.readdirSync(appDir, { withFileTypes: true });
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (ent.name === mainDirName) continue;
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

module.exports = { computeCryptoState, parseEncryptConfig, encryptRenderer, UNSUPPORTED_MESSAGE };
