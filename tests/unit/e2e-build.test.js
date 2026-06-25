const path = require('path');
const fs = require('fs');
const { runCommand } = require('../../src/cli/index');

const fixtureDir = path.join(__dirname, '../fixtures/minimal-web');

describe('E2E: build 命令在 fixture project 产出 dist/', () => {
    let oldCwd;

    beforeAll(() => {
        oldCwd = process.cwd();
        process.chdir(fixtureDir);
    });

    afterAll(() => {
        process.chdir(oldCwd);
    });

    test('build 跑通：dist/index.html 与 dist/index.js 都存在', async () => {
        const cmd = require('../../src/cli/commands/build');
        await runCommand(cmd, { env: 'prod' });

        const distDir = path.join(fixtureDir, 'dist');
        expect(fs.existsSync(path.join(distDir, 'index.html'))).toBe(true);
        expect(fs.existsSync(path.join(distDir, 'index.js'))).toBe(true);

        const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
        expect(html).toContain('<title>minimal-web</title>');

        const js = fs.readFileSync(path.join(distDir, 'index.js'), 'utf8');
        // production 经 terser 压缩后模板字面量被合并为单一字符串，验证 __BC_BUILD__.target 注入：
        expect(js).toContain('target=web');
    }, 60000);
});
