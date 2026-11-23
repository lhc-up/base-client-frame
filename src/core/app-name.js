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
const APP_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/;
const APP_NAME_MAX_LENGTH = 116;

/**
 * @param {*} name package.json 的 name
 * @throws {Error} 不符合可用形式
 */
function assertAppName(name) {
    const valid = typeof name === 'string'
        && APP_NAME_RE.test(name)
        && !name.endsWith('.')
        && !WINDOWS_RESERVED_RE.test(name)
        && name.length <= APP_NAME_MAX_LENGTH;
    if (valid) {
        return;
    }
    throw new Error(
        `package.json 的 name「${name}」不可用：只能用小写字母、数字、. _ -，以小写字母或数字开头、不以 . 结尾，`
        + `不能是 Windows 保留名（con、nul 等），不超过 ${APP_NAME_MAX_LENGTH} 个字符，不支持 @scope/（见 frame README「package.json 的 name」）`,
    );
}

module.exports = { assertAppName };
