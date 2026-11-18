const path = require('path');
const { loadEnv } = require('../../../src/core/env');

const fixtureDir = path.join(__dirname, '../../fixtures/env-cases');

describe('core/env', () => {
    test('loadEnv 合并 .env 与 .env.<name>，后者覆盖', () => {
        const env = loadEnv('prod', { cwd: fixtureDir });
        expect(env.BC_ENV).toBe('prod');
        expect(env.BC_API_BASE).toBe('https://api.prod.example');
        expect(env.SHARED_TOKEN).toBe('top-secret');
        expect(env.WIN_CODE_SIGN_PWD).toBe('cert-pwd');
    });

    test('loadEnv .env 不存在时不报错，仅取 .env.<name>', () => {
        const fixtureOnly = path.join(__dirname, '../../fixtures/env-only-specific');
        const fs = require('fs');
        fs.mkdirSync(fixtureOnly, { recursive: true });
        fs.writeFileSync(path.join(fixtureOnly, '.env.dev'), 'BC_ENV=dev\n');
        try {
            const env = loadEnv('dev', { cwd: fixtureOnly });
            expect(env.BC_ENV).toBe('dev');
        } finally {
            fs.rmSync(fixtureOnly, { recursive: true, force: true });
        }
    });

    test('loadEnv .env.<name> 不存在时 info 提示 + 视作空环境（不抛错）', () => {
        const infoSpy = jest.spyOn(require('../../../src/core/logger'), 'info').mockImplementation(() => {});
        try {
            const env = loadEnv('nope', { cwd: fixtureDir });
            // fixtureDir 里有 .env（base），loadEnv 应返回 base 内容
            expect(env.SHARED_TOKEN).toBeDefined();
            expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/未找到 \.env\.nope/));
        } finally {
            infoSpy.mockRestore();
        }
    });

    test('loadEnv：.env 文件声明 frame 生成的变量时报错', () => {
        const dir = path.join(__dirname, '../../fixtures/env-reserved');
        const fs = require('fs');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, '.env'), 'BC_DEV=true\n');
        try {
            expect(() => loadEnv('dev', { cwd: dir })).toThrow(/\.env 不能声明 BC_DEV/);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('setRuntimeEnv 同时写入 ctx.env 与 process.env，只接受 frame 生成的变量', () => {
        const { setRuntimeEnv } = require('../../../src/core/env');
        const ctx = { env: {} };
        const before = process.env.BC_DEV_URL;
        try {
            setRuntimeEnv(ctx, 'BC_DEV_URL', 'http://localhost:1/');
            expect(ctx.env.BC_DEV_URL).toBe('http://localhost:1/');
            expect(process.env.BC_DEV_URL).toBe('http://localhost:1/');
            expect(() => setRuntimeEnv(ctx, 'BC_API', 'x')).toThrow(/不是 frame 生成的变量/);
        } finally {
            if (before === undefined) delete process.env.BC_DEV_URL; else process.env.BC_DEV_URL = before;
        }
    });

    test('loadEnv 不修改 process.env', () => {
        const before = process.env.BC_API_BASE;
        loadEnv('prod', { cwd: fixtureDir });
        expect(process.env.BC_API_BASE).toBe(before);
    });

    test('loadEnv .env 与 .env.<name> 都不存在时返回 {} + info（.env 缺失沉默）', () => {
        const emptyDir = path.join(__dirname, '../../fixtures/env-empty');
        const fs = require('fs');
        fs.mkdirSync(emptyDir, { recursive: true });
        const infoSpy = jest.spyOn(require('../../../src/core/logger'), 'info').mockImplementation(() => {});
        try {
            const env = loadEnv('anything', { cwd: emptyDir });
            expect(env).toEqual({});
            expect(infoSpy).toHaveBeenCalledTimes(1);
            expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/未找到 \.env\.anything/));
        } finally {
            infoSpy.mockRestore();
            fs.rmSync(emptyDir, { recursive: true, force: true });
        }
    });
});
