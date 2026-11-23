const { assertAppName } = require('../../../src/core/app-name');

describe('core/app-name', () => {
    test.each([
        'questionaire',
        'eachinacoreframe',
        'my-app.v2_x',
        '9app',
        'a'.repeat(116),
        'console',
        'com10',
    ])('可用：%s', name => {
        expect(() => assertAppName(name)).not.toThrow();
    });

    test.each([
        ['大写', 'MyApp'],
        ['作用域', '@eachina/app'],
        ['空格', 'my app'],
        ['中文', '中文名'],
        ['以 . 开头', '.app'],
        ['以 _ 开头', '_app'],
        ['以 - 开头', '-app'],
        ['以 . 结尾', 'app.'],
        ['shell 特殊字符', 'a$b'],
        ['npm 不允许的特殊字符', 'a~b'],
        ['Windows 保留名', 'con'],
        ['Windows 保留名带扩展名', 'nul.app'],
        ['Windows 保留名 com0-9', 'com1'],
        ['超过 116 个字符', 'a'.repeat(117)],
        ['空字符串', ''],
        ['非字符串', undefined],
    ])('不可用（%s）：%s', (_reason, name) => {
        expect(() => assertAppName(name)).toThrow(/package\.json 的 name/);
    });

    function messageOf(name) {
        try {
            assertAppName(name);
        } catch (err) {
            return err.message;
        }
        return '';
    }

    test('报错列出每一条具体原因', () => {
        const scoped = messageOf('@Eachina/my app.');
        expect(scoped).toContain('  - 带 @scope/ 作用域');
        expect(scoped).toContain('  - 含大写字母：「E」');
        expect(scoped).toContain('  - 含不支持的字符：空格');
        expect(scoped).toContain('  - 以 . 结尾');
        expect(scoped).not.toContain('「@」');
        expect(messageOf('MyApp')).toContain('  - 含大写字母：「M」、「A」');
        expect(messageOf('MyApp')).not.toContain('  - 以「');
        expect(messageOf('-app')).toContain('  - 以「-」开头');
        expect(messageOf('中文')).toContain('  - 含不支持的字符：「中」、「文」');
        expect(messageOf('nul.app')).toContain('  - 是 Windows 保留名（nul）');
        expect(messageOf('a'.repeat(117))).toContain('  - 长度 117，超过 116 个字符');
        expect(messageOf(undefined)).toContain('  - 没有填写 name');
    });

    test('报错列出完整的支持格式', () => {
        const message = messageOf('MyApp');
        expect(message).toContain('支持的格式：');
        expect(message).toContain('  - 只用小写字母 a-z、数字 0-9、. _ -');
        expect(message).toContain('  - 以小写字母或数字开头，不以 . 结尾');
        expect(message).toContain('  - 不是 Windows 保留名');
        expect(message).toContain('  - 不超过 116 个字符，不支持 @scope/ 作用域');
    });
});
