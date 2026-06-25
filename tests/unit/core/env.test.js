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

    test('loadEnv .env.<name> 不存在时抛错', () => {
        expect(() => loadEnv('nope', { cwd: fixtureDir })).toThrow(/未找到 .env\.nope/);
    });

    test('loadEnv 不修改 process.env', () => {
        const before = process.env.BC_API_BASE;
        loadEnv('prod', { cwd: fixtureDir });
        expect(process.env.BC_API_BASE).toBe(before);
    });
});
