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

    test('build 跑通：dist/index.html 与 dist/index.js 都存在，且清空 dist 前有 info 提示', async () => {
        const infoSpy = jest.spyOn(require('../../src/core/logger'), 'info').mockImplementation(() => {});
        try {
            const cmd = require('../../src/cli/commands/build');
            await runCommand(cmd, { env: 'prod' });

            const distDir = path.join(fixtureDir, 'dist');
            expect(fs.existsSync(path.join(distDir, 'index.html'))).toBe(true);
            expect(fs.existsSync(path.join(distDir, 'index.js'))).toBe(true);

            const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
            expect(html).toContain('<title>minimal-web</title>');

            const js = fs.readFileSync(path.join(distDir, 'index.js'), 'utf8');
            expect(js).toContain('target=web');

            // M2/FB-018：清空 dist 前必须有 info
            expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/清空 dist\//));
        } finally {
            infoSpy.mockRestore();
        }
    }, 60000);
});
