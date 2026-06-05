describe('命令清单', () => {
  test('src/cli/commands/index 导出数组', () => {
    const commands = require('../../src/cli/commands');
    expect(Array.isArray(commands)).toBe(true);
  });

  test('清单中的每个元素是合法命令模板（含 name / action）', () => {
    const commands = require('../../src/cli/commands');
    for (const cmd of commands) {
      expect(typeof cmd.name).toBe('string');
      expect(typeof cmd.action).toBe('function');
    }
  });
});
