const { spawn } = require('child_process');
const { resolveElectron, resolveMainEntry } = require('../utils/electron');

async function action() {
    const rootDir = process.cwd();
    const electronBin = resolveElectron(rootDir);
    const mainEntry = resolveMainEntry(rootDir);

    const child = spawn(electronBin, [mainEntry], {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' },
    });

    return new Promise((_, reject) => {
        child.on('close', (code) => {
            try {
                process.exit(code ?? 0);
            } catch (e) {
                reject(e);
            }
        });
    });
}

module.exports = {
    name: 'preview',
    description: '启动已构建产物（生产模式）',
    mode: 'production',
    skipEnv: true,
    options: [],
    action,
};
