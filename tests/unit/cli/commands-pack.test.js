const cmd = require('../../../src/cli/commands/pack');
const { TARGETS } = require('../../../src/core/target');
const { MODES } = require('../../../src/core/mode');

describe('cli/commands/pack', () => {
    test('命令文件导出契约', () => {
        expect(cmd.name).toBe('pack');
        expect(cmd.target).toBe(TARGETS.APP);
        expect(cmd.mode).toBe(MODES.PROD);
        expect(cmd.needsBcConfig).toBe(true);
        expect(cmd.needsBuilderConfig).toBe(true);
        expect(cmd.resolveCliOptions).toEqual(expect.any(Function));
    });

    test('options 含 --platform / --arch / --dir / --sign（--pack-config 已下沉至 cli 全局 option，避免重复注册）', () => {
        const flags = cmd.options.map(o => o[0]).join(' ');
        expect(flags).toContain('--platform');
        expect(flags).toContain('--arch');
        expect(flags).toContain('--dir');
        expect(flags).toContain('--sign');
        expect(flags).not.toContain('--pack-config');
    });

    test('action 是 async function', () => {
        expect(cmd.action.constructor.name).toBe('AsyncFunction');
    });
});
