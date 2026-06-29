const cmd = require('../../../src/cli/commands/child');
const { TARGETS } = require('../../../src/core/target');
const { MODES } = require('../../../src/core/mode');

describe('cli/commands/child', () => {
    test('命令文件导出契约', () => {
        expect(cmd.name).toBe('child');
        expect(cmd.target).toBe(TARGETS.APP);
        expect(cmd.mode).toBe(MODES.PROD);
        expect(cmd.needsBcConfig).toBe(true);
        expect(cmd.needsBuilderConfig).toBe(false);
    });

    test('child 命令无专属 flag（仅全局选项）', () => {
        expect(cmd.options || []).toEqual([]);
    });

    test('action 是 async function', () => {
        expect(cmd.action.constructor.name).toBe('AsyncFunction');
    });
});
