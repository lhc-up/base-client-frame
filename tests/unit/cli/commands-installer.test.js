const cmd = require('../../../src/cli/commands/installer');
const { TARGETS } = require('../../../src/core/target');
const { MODES } = require('../../../src/core/mode');

describe('cli/commands/installer', () => {
    test('命令文件导出契约', () => {
        expect(cmd.name).toBe('installer');
        expect(cmd.target).toBe(TARGETS.APP);
        expect(cmd.mode).toBe(MODES.PROD);
        expect(cmd.needsBcConfig).toBe(false);
        expect(cmd.needsBuilderConfig).toBe(true);
    });

    test('options 含 --platform / --arch / --sign（无 --dir）', () => {
        const flags = cmd.options.map(o => o[0]).join(' ');
        expect(flags).toContain('--platform');
        expect(flags).toContain('--arch');
        expect(flags).toContain('--sign');
        expect(flags).not.toContain('--dir');
    });

    test('action 是 async function', () => {
        expect(cmd.action.constructor.name).toBe('AsyncFunction');
    });
});
