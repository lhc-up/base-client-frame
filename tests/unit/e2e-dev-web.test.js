const path = require('path');
const http = require('http');

const fixtureDir = path.join(__dirname, '../fixtures/minimal-web');
let mockServer;

jest.mock('../../src/webpack-runner/run-dev-server', () => {
    const actual = jest.requireActual('../../src/webpack-runner/run-dev-server');
    return {
        ...actual,
        runDevServer: async (...args) => {
            mockServer = await actual.runDevServer(...args);
            return mockServer;
        },
    };
});

function httpGet(url, { timeoutMs = 3000 } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
    });
}

describe('E2E: dev:web 起 dev-server，浏览器路径可访问', () => {
    let oldCwd;

    beforeAll(() => {
        oldCwd = process.cwd();
        process.chdir(fixtureDir);
    });

    afterAll(async () => {
        if (mockServer) await mockServer.stop?.();
        process.chdir(oldCwd);
    });

    test('dev:web 起 19099 端口，GET / 返回 200 含 banner', async () => {
        const cmd = require('../../src/cli/commands/dev-web');
        const { runCommand } = require('../../src/cli/index');

        await runCommand(cmd, { env: 'prod' });
        await new Promise((r) => setTimeout(r, 3000));
        const res = await httpGet('http://localhost:19099/');
        expect(res.status).toBe(200);
        expect(res.body).toContain('<title>minimal-web</title>');
    }, 30000);
});
