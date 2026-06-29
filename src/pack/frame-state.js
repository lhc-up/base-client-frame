const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

const FILE_NAME = '.frame-state.json';

function statePath(distDir) {
    return path.join(distDir, FILE_NAME);
}

function writeFrameState(distDir, state) {
    fse.ensureDirSync(distDir);
    fs.writeFileSync(statePath(distDir), JSON.stringify(state, null, 4));
}

function readFrameState(distDir) {
    const p = statePath(distDir);
    if (!fs.existsSync(p)) return null;
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
        return null;
    }
}

module.exports = { readFrameState, writeFrameState };
