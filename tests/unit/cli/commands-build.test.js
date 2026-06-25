const cmd = require('../../../src/cli/commands/build');
const { TARGETS } = require('../../../src/core/target');
const { MODES } = require('../../../src/core/mode');

describe('cli/commands/build', () => {
    test('命令文件导出契约：name / target / mode / needsBcConfig', () => {
        expect(cmd.name).toBe('build');
        expect(cmd.target).toBe(TARGETS.WEB);
        expect(cmd.mode).toBe(MODES.PROD);
        expect(cmd.needsBcConfig).toBe(true);
        expect(cmd.needsBuilderConfig).toBe(false);
        expect(cmd.aliases || []).toEqual([]);
    });

    test('options 为空（build 无专属选项）', () => {
        expect(cmd.options || []).toEqual([]);
    });

    test('action 是 async function', () => {
        expect(cmd.action.constructor.name).toBe('AsyncFunction');
    });
});
