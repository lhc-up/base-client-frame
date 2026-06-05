const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function readEnvFile(file) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) return null;
    return dotenv.parse(fs.readFileSync(p));
}

function initEnv(envName = 'prod') {
    const base = readEnvFile('.env') || {};
    const specific = readEnvFile(`.env.${envName}`);
    if (specific === null) {
        throw new Error(`.env.${envName} not found in ${process.cwd()}`);
    }
    return { ...base, ...specific };
}

module.exports = { readEnvFile, initEnv };
