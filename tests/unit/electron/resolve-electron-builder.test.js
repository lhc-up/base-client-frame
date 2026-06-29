const path = require('path');
const fs = require('fs');
const { resolveElectronBuilder } = require('../../../src/electron/resolve-electron-builder');

const fixtureDir = path.join(__dirname, '../../tmp/resolve-electron-builder');

beforeEach(() => {
    fs.mkdirSync(fixtureDir, { recursive: true });
    const ebDir = path.join(fixtureDir, 'node_modules/electron-builder');
    fs.mkdirSync(ebDir, { recursive: true });
    fs.writeFileSync(path.join(ebDir, 'package.json'), JSON.stringify({
        name: 'electron-builder', main: 'out/index.js', version: '24.0.0',
    }));
    fs.mkdirSync(path.join(ebDir, 'out'), { recursive: true });
    fs.writeFileSync(path.join(ebDir, 'out/index.js'), `module.exports = { build: () => Promise.resolve([]) };`);
});
afterEach(() => { fs.rmSync(fixtureDir, { recursive: true, force: true }); });

describe('electron/resolve-electron-builder', () => {
    test('从 rootDir 解析 electron-builder 模块，返回其默认导出', () => {
        const eb = resolveElectronBuilder(fixtureDir);
        expect(typeof eb.build).toBe('function');
    });

    test('rootDir 下无 electron-builder 时抛错', () => {
        const empty = path.join(__dirname, '../../tmp/no-eb');
        fs.mkdirSync(empty, { recursive: true });
        try {
            expect(() => resolveElectronBuilder(empty)).toThrow(/electron-builder/i);
        } finally {
            fs.rmSync(empty, { recursive: true, force: true });
        }
    });
});
