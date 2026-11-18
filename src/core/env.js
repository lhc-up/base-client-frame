const fse = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('./logger');

function readEnvFile(file) {
    if (!fse.existsSync(file)) return null;
    return dotenv.parse(fse.readFileSync(file));
}

function loadEnv(envName, { cwd = process.cwd() } = {}) {
    const base = readEnvFile(path.join(cwd, '.env')) || {};
    const specificPath = path.join(cwd, `.env.${envName}`);
    const specific = readEnvFile(specificPath);
    if (!specific) {
        logger.info(`未找到 .env.${envName}，视作空环境`);
    }
    return { ...base, ...(specific || {}) };
}

module.exports = { loadEnv };
