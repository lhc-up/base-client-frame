const cmd = require('../../../src/cli/commands/dev-app');
const { TARGETS } = require('../../../src/core/target');
const { MODES } = require('../../../src/core/mode');

describe('cli/commands/dev-app', () => {
    test('命令文件导出契约', () => {
        expect(cmd.name).toBe('dev:app');
        expect(cmd.target).toBe(TARGETS.APP);
        expect(cmd.mode).toBe(MODES.DEV);
        expect(cmd.needsBcConfig).toBe(true);
        expect(cmd.needsBuilderConfig).toBe(false);
        expect(cmd.aliases || []).toEqual([]);
    });

    test('options 含 --port 与 --host', () => {
        const flags = cmd.options.map(o => o[0]);
        expect(flags.some(f => f.includes('--port'))).toBe(true);
        expect(flags.some(f => f.includes('--host'))).toBe(true);
    });

    test('action 是 async function', () => {
        expect(cmd.action.constructor.name).toBe('AsyncFunction');
    });
});
