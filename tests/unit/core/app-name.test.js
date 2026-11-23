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
});
