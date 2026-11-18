const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

let capturedServer;

jest.mock('child_process', () => {
    const real = jest.requireActual('child_process');
    return { ...real, spawn: jest.fn() };
});

jest.mock('../../src/webpack-runner/run-dev-server', () => {
    const real = jest.requireActual('../../src/webpack-runner/run-dev-server');
    return {
        ...real,
        runDevServer: async (...args) => {
            const s = await real.runDevServer(...args);
            capturedServer = s;
            return s;
        },
    };
});

const cp = require('child_process');

const fixtureDir = path.join(__dirname, '../fixtures/minimal-app');

describe('E2E: dev:app 编排链路（mock spawn）', () => {
    let oldCwd;
    let fakeChild;

    beforeAll(() => {
        oldCwd = process.cwd();
        process.chdir(fixtureDir);
        fakeChild = new EventEmitter();
        fakeChild.pid = 999;
        fakeChild.exitCode = null;
        fakeChild.kill = jest.fn();
        fakeChild.stdout = new EventEmitter();
        fakeChild.stderr = new EventEmitter();
        cp.spawn.mockReturnValue(fakeChild);
    });

    afterAll(async () => {
        if (capturedServer) {
            try { await capturedServer.stop(); } catch {}
        }
        process.chdir(oldCwd);
    });

    test('编译 main+preload + 起 dev-server + spawn Electron；BC_DEV / BC_DEV_URL 静态替换进产物，不经子进程环境变量', async () => {
        const cmd = require('../../src/cli/commands/dev-app');
        const { runCommand } = require('../../src/cli/index');

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

        try {
            runCommand(cmd, { env: 'prod' });
            await new Promise((r) => setTimeout(r, 8000));

            expect(fs.existsSync(path.join(fixtureDir, 'app/main/index.js'))).toBe(true);
            expect(fs.existsSync(path.join(fixtureDir, 'app/preload/index.js'))).toBe(true);
            expect(fs.existsSync(path.join(fixtureDir, 'app/update/update.js'))).toBe(true);

            expect(cp.spawn).toHaveBeenCalledTimes(1);
            const [exe, args, opts] = cp.spawn.mock.calls[0];
            expect(exe).toBe('/fake/electron-binary');
            expect(args[0]).toContain(path.join('app', 'main', 'index.js'));
            expect(opts.env.NODE_ENV).toBe('development');
            expect(opts.env.RENDERER_DEV_URL).toBeUndefined();
            expect(opts.env.BC_DEV_URL).toBeUndefined();
            const mainOut = fs.readFileSync(path.join(fixtureDir, 'app/main/index.js'), 'utf8');
            expect(mainOut).toContain('"true"');
            expect(mainOut).toContain('"http://localhost:19023/"');
            expect(opts.stdio).toEqual(['inherit', 'pipe', 'pipe']);

            fakeChild.exitCode = 0;
            fakeChild.emit('close', 0);

            await new Promise((r) => setTimeout(r, 500));
            expect(exitSpy).toHaveBeenCalled();
        } finally {
            exitSpy.mockRestore();
        }
    }, 30000);
});
