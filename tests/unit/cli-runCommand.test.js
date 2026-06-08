const fs = require('fs');
const path = require('path');
const { withTempCwd } = require('./_helpers');

let exitSpy, errorSpy, envSnapshot;
beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`__EXIT__:${code}`);
    });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    envSnapshot = Object.fromEntries(
        Object.entries(process.env).filter(([k]) => k.startsWith('BC_'))
    );
});
afterEach(() => {
    for (const k of Object.keys(process.env)) {
        if (k.startsWith('BC_')) delete process.env[k];
    }
    Object.assign(process.env, envSnapshot);
});

const { runCommand } = require('../../src/cli');

describe('runCommand', () => {
    test('action 收到完整 ctx：cliOptions / env / mode / command', async () => {
        const tmp = withTempCwd();
        try {
            fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'BC_API=http://x\n');

            const action = jest.fn().mockResolvedValue();
            const cmd = {
                name: 'mycmd',
                mode: 'production',
                action,
            };
            const cliOptions = { env: 'prod', config: undefined, debug: false };

            await runCommand(cmd, cliOptions);

            expect(action).toHaveBeenCalledTimes(1);
            expect(action.mock.calls[0][0]).toEqual({
                cliOptions,
                env: { BC_API: 'http://x', BC_ENV: 'prod' },
                mode: 'production',
                command: 'mycmd',
            });
        } finally {
            tmp.cleanup();
        }
    });

    test('skipEnv: true 时 ctx.env 为 undefined，且不读 .env.*', async () => {
        const tmp = withTempCwd();
        try {
            const action = jest.fn().mockResolvedValue();
            const cmd = { name: 'preview', mode: 'production', skipEnv: true, action };
            const cliOptions = { env: 'prod', debug: false };

            await runCommand(cmd, cliOptions);

            expect(action).toHaveBeenCalledTimes(1);
            expect(action.mock.calls[0][0].env).toBeUndefined();
        } finally {
            tmp.cleanup();
        }
    });

    test('skipEnv 缺省（false）且 .env.<name> 缺失 → 抛错走错误分支', async () => {
        const tmp = withTempCwd();
        try {
            const action = jest.fn();
            const cmd = { name: 'build', mode: 'production', action };
            const cliOptions = { env: 'prod', debug: false };

            await expect(runCommand(cmd, cliOptions)).rejects.toThrow('__EXIT__:1');

            expect(action).not.toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringMatching(/\[base-client\] build 失败：/)
            );
        } finally {
            tmp.cleanup();
        }
    });

    test('cmd.mode 未声明时，ctx.mode = production', async () => {
        const tmp = withTempCwd();
        try {
            fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'X=1\n');
            const action = jest.fn().mockResolvedValue();
            const cmd = { name: 'foo', action };
            await runCommand(cmd, { env: 'prod', debug: false });
            expect(action.mock.calls[0][0].mode).toBe('production');
        } finally {
            tmp.cleanup();
        }
    });

    test('cmd.mode = "development" 时透传', async () => {
        const tmp = withTempCwd();
        try {
            fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'X=1\n');
            const action = jest.fn().mockResolvedValue();
            const cmd = { name: 'dev', mode: 'development', action };
            await runCommand(cmd, { env: 'prod', debug: false });
            expect(action.mock.calls[0][0].mode).toBe('development');
        } finally {
            tmp.cleanup();
        }
    });

    test('action 抛错 → console.error 输出 message，exit 1', async () => {
        const tmp = withTempCwd();
        try {
            fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'X=1\n');
            const cmd = {
                name: 'pack',
                mode: 'production',
                action: () => { throw new Error('something broke'); },
            };
            await expect(runCommand(cmd, { env: 'prod', debug: false })).rejects.toThrow('__EXIT__:1');
            expect(errorSpy).toHaveBeenCalledWith('[base-client] pack 失败：something broke');
        } finally {
            tmp.cleanup();
        }
    });

    test('默认不打印 err.stack', async () => {
        const tmp = withTempCwd();
        try {
            fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'X=1\n');
            const cmd = { name: 'pack', action: () => { throw new Error('broke'); } };
            await expect(runCommand(cmd, { env: 'prod', debug: false })).rejects.toThrow();

            const stackCalls = errorSpy.mock.calls.filter((c) => /\n\s+at /.test(String(c[0])));
            expect(stackCalls).toHaveLength(0);
        } finally {
            tmp.cleanup();
        }
    });

    test('--debug 为真时附打印 err.stack', async () => {
        const tmp = withTempCwd();
        try {
            fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'X=1\n');
            const cmd = { name: 'pack', action: () => { throw new Error('broke'); } };
            await expect(runCommand(cmd, { env: 'prod', debug: true })).rejects.toThrow();

            const stackCalls = errorSpy.mock.calls.filter((c) => /\n\s+at /.test(String(c[0])));
            expect(stackCalls.length).toBeGreaterThanOrEqual(1);
        } finally {
            tmp.cleanup();
        }
    });

    test('BC_ 前缀键整体写入 process.env；非 BC_ 不写', async () => {
        const tmp = withTempCwd();
        try {
            fs.writeFileSync(
                path.join(tmp.dir, '.env.prod'),
                'BC_API=http://x\nBC_LOG=info\nFOO=bar\n'
            );
            const action = jest.fn().mockResolvedValue();
            const cmd = { name: 'mycmd', mode: 'production', action };

            await runCommand(cmd, { env: 'prod', debug: false });

            expect(process.env.BC_API).toBe('http://x');
            expect(process.env.BC_LOG).toBe('info');
            expect(process.env.FOO).toBeUndefined();
        } finally {
            tmp.cleanup();
        }
    });

    test('BC_ENV 未声明时 fallback 为 cliOptions.env，env 对象与 process.env 同步更新', async () => {
        const tmp = withTempCwd();
        try {
            fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'BC_API=http://x\n');
            const action = jest.fn().mockResolvedValue();
            const cmd = { name: 'pack', mode: 'production', action };

            await runCommand(cmd, { env: 'prod', debug: false });

            expect(process.env.BC_ENV).toBe('prod');
            expect(action.mock.calls[0][0].env.BC_ENV).toBe('prod');
        } finally {
            tmp.cleanup();
        }
    });

    test('BC_ENV 在 .env 中显式声明时不被 fallback 覆盖', async () => {
        const tmp = withTempCwd();
        try {
            fs.writeFileSync(
                path.join(tmp.dir, '.env.staging'),
                'BC_ENV=staging-custom\nBC_API=http://x\n'
            );
            const action = jest.fn().mockResolvedValue();
            const cmd = { name: 'pack', mode: 'production', action };

            await runCommand(cmd, { env: 'staging', debug: false });

            expect(process.env.BC_ENV).toBe('staging-custom');
            expect(action.mock.calls[0][0].env.BC_ENV).toBe('staging-custom');
        } finally {
            tmp.cleanup();
        }
    });

    test('BC_ENV 为空串时仍 fallback（避免 artifactName 等出现空段）', async () => {
        const tmp = withTempCwd();
        try {
            fs.writeFileSync(path.join(tmp.dir, '.env.prod'), 'BC_ENV=\nBC_API=http://x\n');
            const action = jest.fn().mockResolvedValue();
            const cmd = { name: 'pack', mode: 'production', action };

            await runCommand(cmd, { env: 'prod', debug: false });

            expect(process.env.BC_ENV).toBe('prod');
        } finally {
            tmp.cleanup();
        }
    });

    test('skipEnv: true 时不动 process.env', async () => {
        const tmp = withTempCwd();
        try {
            const action = jest.fn().mockResolvedValue();
            const cmd = { name: 'preview', mode: 'production', skipEnv: true, action };

            await runCommand(cmd, { env: 'prod', debug: false });

            expect(process.env.BC_ENV).toBeUndefined();
            expect(process.env.BC_API).toBeUndefined();
        } finally {
            tmp.cleanup();
        }
    });
});
