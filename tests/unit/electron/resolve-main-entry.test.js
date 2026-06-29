const path = require('path');
const fs = require('fs');
const { resolveMainEntry } = require('../../../src/electron/resolve-main-entry');

const fixtureDir = path.join(__dirname, '../../tmp/resolve-main-entry');

beforeEach(() => { fs.mkdirSync(fixtureDir, { recursive: true }); });
afterEach(() => { fs.rmSync(fixtureDir, { recursive: true, force: true }); });

describe('electron/resolve-main-entry', () => {
    test('package.json.main 指向已存在的入口时正常返回绝对路径', () => {
        fs.writeFileSync(path.join(fixtureDir, 'package.json'), JSON.stringify({
            name: 'demo', main: 'app/main/index.js',
        }));
        const dir = path.join(fixtureDir, 'app/main');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.js'), 'console.log("main");');
        const entry = resolveMainEntry(fixtureDir);
        expect(entry).toBe(path.join(fixtureDir, 'app/main/index.js'));
    });

    test('入口不存在时抛错', () => {
        fs.writeFileSync(path.join(fixtureDir, 'package.json'), JSON.stringify({
            name: 'demo', main: 'app/main/index.js',
        }));
        expect(() => resolveMainEntry(fixtureDir)).toThrow(/主进程入口不存在/);
    });

    test('package.json 不存在时抛错', () => {
        expect(() => resolveMainEntry(fixtureDir)).toThrow();
    });
});
