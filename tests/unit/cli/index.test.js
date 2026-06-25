const path = require('path');
const { createCli, runCommand } = require('../../../src/cli/index');

const fixtureDir = path.join(__dirname, '../../fixtures/cli-runCommand');

beforeAll(() => {
    const fs = require('fs');
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(
        path.join(fixtureDir, '.env.prod'),
        'BC_ENV=prod\nBC_API_BASE=https://api.test\n',
    );
    fs.writeFileSync(
        path.join(fixtureDir, 'package.json'),
        JSON.stringify({ name: 'demo', version: '1.0.0' }),
    );
});

afterAll(() => {
    const fs = require('fs');
    fs.rmSync(fixtureDir, { recursive: true, force: true });
});

describe('cli/index', () => {
    test('createCli 返回 cac 实例并注册命令（含 alias）', () => {
        const cli = createCli();
        const names = cli.commands.map(c => c.name);
        expect(names).toContain('dev:web');
        expect(names).toContain('build');
    });

    describe('runCommand', () => {
        const fakeCmd = {
            name: 'fake',
            target: 'web',
            mode: 'development',
            needsBcConfig: false,
            needsBuilderConfig: false,
            options: [],
            action: jest.fn().mockResolvedValue(undefined),
        };

        let oldCwd;
        beforeEach(() => {
            oldCwd = process.cwd();
            process.chdir(fixtureDir);
            fakeCmd.action.mockClear();
        });
        afterEach(() => { process.chdir(oldCwd); });

        test('runCommand 加载 env、构造 ctx、调 action(ctx)', async () => {
            await runCommand(fakeCmd, { env: 'prod' });
            expect(fakeCmd.action).toHaveBeenCalledTimes(1);
            const ctx = fakeCmd.action.mock.calls[0][0];
            expect(ctx.command).toBe('fake');
            expect(ctx.target).toBe('web');
            expect(ctx.env.BC_ENV).toBe('prod');
            expect(ctx.env.BC_API_BASE).toBe('https://api.test');
            expect(ctx.isWeb).toBe(true);
            expect(ctx.isDev).toBe(true);
        });

        test('runCommand 把 BC_ 子集写入 process.env', async () => {
            delete process.env.BC_API_BASE;
            await runCommand(fakeCmd, { env: 'prod' });
            expect(process.env.BC_API_BASE).toBe('https://api.test');
        });

        test('BC_ENV 未声明时用 cliOptions.env 兜底', async () => {
            const fs = require('fs');
            fs.writeFileSync(path.join(fixtureDir, '.env.staging'), 'BC_API_BASE=https://api\n');
            await runCommand(fakeCmd, { env: 'staging' });
            const ctx = fakeCmd.action.mock.calls[0][0];
            expect(ctx.env.BC_ENV).toBe('staging');
        });

        test('action 抛错时 runCommand 经 logger.error 报告，并以 1 退出', async () => {
            const errCmd = { ...fakeCmd, action: jest.fn().mockRejectedValue(new Error('boom')) };
            const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
            const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            await runCommand(errCmd, { env: 'prod' });
            expect(exitSpy).toHaveBeenCalledWith(1);
            exitSpy.mockRestore();
            errSpy.mockRestore();
        });
    });
});
