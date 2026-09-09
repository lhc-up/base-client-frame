const path = require('path');
const fse = require('fs-extra');
const os = require('os');
const asar = require('@electron/asar');
const { derivePackageDescriptor } = require('./package-descriptor');

async function buildIncrementalAsax({ appDir, distDir, buildInfo }) {
    const tmpDir = fse.mkdtempSync(path.join(os.tmpdir(), 'bc-frame-asax-'));
    try {
        const entries = fse.readdirSync(appDir, { withFileTypes: true });
        for (const ent of entries) {
            if (!ent.isDirectory() || ent.name === 'main') continue;
            await fse.copy(path.join(appDir, ent.name), path.join(tmpDir, ent.name));
        }

        const communicationContract = path.join(appDir, 'communication-contract.json');
        if (fse.existsSync(communicationContract)) {
            await fse.copy(communicationContract, path.join(tmpDir, 'communication-contract.json'));
        }

        const descriptor = derivePackageDescriptor(buildInfo);
        fse.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(descriptor, null, 2));

        fse.ensureDirSync(distDir);
        const out = path.join(distDir, `${buildInfo.env}-v${buildInfo.version}.asax`);
        await asar.createPackage(tmpDir, out);
    } finally {
        fse.removeSync(tmpDir);
    }
}

module.exports = { buildIncrementalAsax };
