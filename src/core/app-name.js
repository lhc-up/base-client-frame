/**
 * 客户端 package.json 的 name 检查（dev:app / pack / installer 启动时）。
 *
 * 可用形式：小写字母、数字、`.`、`_`、`-`，以小写字母或数字开头，不以 `.` 结尾；
 * 不是 Windows 保留名（con、prn、aux、nul、com0–9、lpt0–9，含 `con.x` 这类带扩展名的形式）；
 * 不超过 116 个字符；不支持 `@scope/` 作用域。
 *
 * 依据：name 原样用作 Linux 可执行文件名与安装脚本的 APP_NAME（两者须一致，脚本中未加引号）、
 * Windows 安装目录名、更新包文件名，以及项目 appId `com.eachina.<name>`（Windows AppUserModelID 最长 128 字符、
 * 不能有空格）。npm 不检查项目自身的 name，所以在这里拦下。
 */
const ALLOWED_CHAR_RE = /[a-z0-9._-]/;
const FIRST_CHAR_RE = /^[a-z0-9]/;
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/;
const APP_NAME_MAX_LENGTH = 116;

const SUPPORTED_FORMAT = [
    '只用小写字母 a-z、数字 0-9、. _ -',
    '以小写字母或数字开头，不以 . 结尾',
    '不是 Windows 保留名（con、prn、aux、nul、com0–com9、lpt0–lpt9，以及 con.x 这类加了扩展名的形式）',
    `不超过 ${APP_NAME_MAX_LENGTH} 个字符，不支持 @scope/ 作用域`,
];

/** 报错里显示的字符：空白字符写成文字，其他原样加引号 */
function displayChar(char) {
    if (char === ' ') {
        return '空格';
    }
    if (/\s/.test(char)) {
        return '空白字符';
    }
    return `「${char}」`;
}

/**
 * @param {string} name
 * @returns {string[]} 不符合的原因，符合时为空数组
 */
function collectProblems(name) {
    const problems = [];
    // 作用域单独报一条，其中的 @ 与 / 不再重复报为字符或开头问题
    const scoped = name.startsWith('@') && name.includes('/');
    if (scoped) {
        problems.push('带 @scope/ 作用域');
    }
    const upperChars = [];
    const badChars = [];
    for (const char of name) {
        if (ALLOWED_CHAR_RE.test(char)) {
            continue;
        }
        if (scoped && (char === '@' || char === '/')) {
            continue;
        }
        if (/[A-Z]/.test(char)) {
            if (!upperChars.includes(char)) {
                upperChars.push(char);
            }
            continue;
        }
        if (!badChars.includes(char)) {
            badChars.push(char);
        }
    }
    if (upperChars.length > 0) {
        problems.push(`含大写字母：${upperChars.map(displayChar).join('、')}`);
    }
    if (badChars.length > 0) {
        problems.push(`含不支持的字符：${badChars.map(displayChar).join('、')}`);
    }
    if (!scoped && !FIRST_CHAR_RE.test(name) && !/^[A-Z]/.test(name)) {
        problems.push(`以${displayChar(name[0])}开头`);
    }
    if (name.endsWith('.')) {
        problems.push('以 . 结尾');
    }
    if (WINDOWS_RESERVED_RE.test(name)) {
        problems.push(`是 Windows 保留名（${name.split('.')[0]}）`);
    }
    if (name.length > APP_NAME_MAX_LENGTH) {
        problems.push(`长度 ${name.length}，超过 ${APP_NAME_MAX_LENGTH} 个字符`);
    }
    return problems;
}

/**
 * @param {*} name package.json 的 name
 * @throws {Error} 不符合可用形式；消息列出具体原因与支持的格式
 */
function assertAppName(name) {
    let problems;
    if (typeof name !== 'string' || name === '') {
        problems = ['没有填写 name'];
    } else {
        problems = collectProblems(name);
    }
    if (problems.length === 0) {
        return;
    }
    const lines = [
        `package.json 的 name「${name}」不可用：`,
        ...problems.map(problem => `  - ${problem}`),
        '支持的格式：',
        ...SUPPORTED_FORMAT.map(rule => `  - ${rule}`),
        '原因：name 用作 Linux 可执行文件名与安装脚本的 APP_NAME、Windows 安装目录名、更新包文件名和项目 appId，'
            + '详见 frame README「package.json 的 name」',
    ];
    throw new Error(lines.join('\n'));
}

module.exports = { assertAppName };
