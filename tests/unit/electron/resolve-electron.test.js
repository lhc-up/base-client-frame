const path = require('path');
const fs = require('fs');
const { resolveElectron } = require('../../../src/electron/resolve-electron');

const fixtureDir = path.join(__dirname, '../../tmp/resolve-electron');

beforeEach(() => {
    fs.mkdirSync(fixtureDir, { recursive: true });
    const electronDir = path.join(fixtureDir, 'node_modules/electron');
    fs.mkdirSync(electronDir, { recursive: true });
    fs.writeFileSync(path.join(electronDir, 'package.json'), JSON.stringify({
        name: 'electron', main: 'index.js', version: '99.0.0',
    }));
    fs.writeFileSync(path.join(electronDir, 'index.js'), `module.exports = '/fake/electron/binary';`);
});
afterEach(() => { fs.rmSync(fixtureDir, { recursive: true, force: true }); });

describe('electron/resolve-electron', () => {
    test('从 rootDir 解析 electron 包，返回其默认导出（可执行文件路径）', () => {
        const exe = resolveElectron(fixtureDir);
        expect(exe).toBe('/fake/electron/binary');
    });

    test('rootDir 下无 electron 时抛错', () => {
        const empty = path.join(__dirname, '../../tmp/no-electron');
        fs.mkdirSync(empty, { recursive: true });
        try {
            expect(() => resolveElectron(empty)).toThrow(/electron/i);
        } finally {
            fs.rmSync(empty, { recursive: true, force: true });
        }
    });
});
