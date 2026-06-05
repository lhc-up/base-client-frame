const fs = require('fs');
const os = require('os');
const path = require('path');

function withTempCwd() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-m2-'));
    const originalCwd = process.cwd();
    process.chdir(dir);
    return {
        dir,
        cleanup() {
            process.chdir(originalCwd);
            fs.rmSync(dir, { recursive: true, force: true });
        },
    };
}

function writeFakePackage(rootDir, pkgName, exportsContent) {
    const fs = require('fs');
    const path = require('path');
    const pkgDir = path.join(rootDir, 'node_modules', pkgName);
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({ name: pkgName, main: 'index.js' })
    );
    fs.writeFileSync(path.join(pkgDir, 'index.js'), exportsContent);
    return pkgDir;
}

module.exports = { withTempCwd, writeFakePackage };
