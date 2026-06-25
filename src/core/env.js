const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function readEnvFile(file) {
    if (!fs.existsSync(file)) return null;
    return dotenv.parse(fs.readFileSync(file));
}

function loadEnv(envName, { cwd = process.cwd() } = {}) {
    const base = readEnvFile(path.join(cwd, '.env')) || {};
    const specificPath = path.join(cwd, `.env.${envName}`);
    const specific = readEnvFile(specificPath);
    if (!specific) {
        throw new Error(`[base-client] 未找到 .env.${envName}（cwd=${cwd}）`);
    }
    return { ...base, ...specific };
}

module.exports = { loadEnv };
