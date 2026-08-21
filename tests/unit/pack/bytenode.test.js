const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

const fixtureDir = path.join(__dirname, '../../tmp/bytenode');
const bytenodeMock = path.join(fixtureDir, 'node_modules/bytenode');
const electronMock = path.join(fixtureDir, 'node_modules/electron');
const electronExe = path.join(electronMock, 'electron.exe');

beforeEach(() => {
    fse.ensureDirSync(bytenodeMock);
    fs.writeFileSync(path.join(bytenodeMock, 'package.json'), JSON.stringify({ name: 'bytenode', main: 'index.js' }));
    fs.writeFileSync(path.join(bytenodeMock, 'index.js'), `
        const fs = require('fs');
        module.exports = {
            compileFile: (options) => {
                const { filename, output } = options;
                fs.writeFileSync(${JSON.stringify(path.join(fixtureDir, 'compile-options.json'))}, JSON.stringify(options));
                fs.writeFileSync(output, '<FAKE_BYTECODE_OF:' + fs.readFileSync(filename, 'utf8') + '>');
                return output;
            },
        };
    `);
    fse.ensureDirSync(electronMock);
    fs.writeFileSync(path.join(electronMock, 'package.json'), JSON.stringify({ name: 'electron', main: 'index.js' }));
    fs.writeFileSync(path.join(electronMock, 'index.js'), `module.exports = ${JSON.stringify(electronExe)};`);
    fs.writeFileSync(electronExe, 'fake electron');
});
afterEach(() => { fse.removeSync(fixtureDir); });

describe('pack/bytenode (path A)', () => {
    test('rejects bytecode compilation for a different target OS or architecture', () => {
        const { assertBytenodeTarget } = require('../../../src/pack/bytenode');
        expect(() => assertBytenodeTarget({
            hostPlatform: 'win32', hostArch: 'x64', targetPlatform: 'linux', targetArch: 'x64',
        })).toThrow(/target OS\/arch/);
        expect(() => assertBytenodeTarget({
            hostPlatform: 'win32', hostArch: 'x64', targetPlatform: 'win', targetArch: 'arm64',
        })).toThrow(/target OS\/arch/);
        expect(() => assertBytenodeTarget({
            hostPlatform: 'win32', hostArch: 'x64', targetPlatform: 'win', targetArch: 'x64',
        })).not.toThrow();
    });
    test('产 main/index.jsc + main/loader.js，原 main/index.js 删除', async () => {
        const appDir = path.join(fixtureDir, 'app');
        fse.ensureDirSync(path.join(appDir, 'main'));
        fs.writeFileSync(path.join(appDir, 'main/index.js'), 'console.log("hello main");');

        const { bytenodeMain } = require('../../../src/pack/bytenode');
        const mergedBuilderConfig = {};
        await bytenodeMain({ rootDir: fixtureDir, appDir, mergedBuilderConfig });

        expect(fs.existsSync(path.join(appDir, 'main/index.jsc'))).toBe(true);
        const jsc = fs.readFileSync(path.join(appDir, 'main/index.jsc'), 'utf8');
        expect(jsc).toContain('FAKE_BYTECODE_OF');

        const loader = fs.readFileSync(path.join(appDir, 'main/loader.js'), 'utf8');
        expect(loader).toContain(`require('./vendor/bytenode')`);
        expect(loader).toContain(`require('./index.jsc')`);

        expect(fs.existsSync(path.join(appDir, 'main/vendor/bytenode/package.json'))).toBe(true);
        expect(fs.existsSync(path.join(appDir, 'main/vendor/bytenode/index.js'))).toBe(true);

        const compileOptions = fse.readJsonSync(path.join(fixtureDir, 'compile-options.json'));
        expect(compileOptions.electronPath).toBe(electronExe);

        expect(fs.existsSync(path.join(appDir, 'main/index.js'))).toBe(false);

        expect(mergedBuilderConfig.extraMetadata.main).toBe('main/loader.js');
    });

    test('已有 extraMetadata.main 时被覆盖为 main/loader.js（bytenode 是 frame 注入的产物，需 frame 自己说算）', async () => {
        const appDir = path.join(fixtureDir, 'app');
        fse.ensureDirSync(path.join(appDir, 'main'));
        fs.writeFileSync(path.join(appDir, 'main/index.js'), 'x');

        const { bytenodeMain } = require('../../../src/pack/bytenode');
        const mergedBuilderConfig = { extraMetadata: { main: 'custom/path.js' } };
        await bytenodeMain({ rootDir: fixtureDir, appDir, mergedBuilderConfig });

        expect(mergedBuilderConfig.extraMetadata.main).toBe('main/loader.js');
    });

    test('rootDir 下未装 bytenode 时抛错', async () => {
        fse.removeSync(bytenodeMock);
        const appDir = path.join(fixtureDir, 'app');
        fse.ensureDirSync(path.join(appDir, 'main'));
        fs.writeFileSync(path.join(appDir, 'main/index.js'), 'x');

        const { bytenodeMain } = require('../../../src/pack/bytenode');
        await expect(bytenodeMain({ rootDir: fixtureDir, appDir, mergedBuilderConfig: {} })).rejects.toThrow(/bytenode/);
    });
});
