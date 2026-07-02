const path = require('path');
const fse = require('fs-extra');
const os = require('os');
const asar = require('@electron/asar');
const { derivePackageDescriptor } = require('./package-descriptor');

async function buildChildAsar({ appDir, distDir, buildInfo }) {
    const tmpDir = fse.mkdtempSync(path.join(os.tmpdir(), 'bc-frame-child-'));
    try {
        await fse.copy(appDir, tmpDir);

        const descriptor = derivePackageDescriptor(buildInfo);
        fse.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(descriptor, null, 2));

        fse.ensureDirSync(distDir);
        const out = path.join(distDir, `child-${buildInfo.name}-${buildInfo.env}-v${buildInfo.version}.asar`);
        await asar.createPackage(tmpDir, out);
    } finally {
        fse.removeSync(tmpDir);
    }
}

module.exports = { buildChildAsar };
