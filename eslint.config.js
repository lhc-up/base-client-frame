/**
 * ESLint 配置：只检查「代码运行在哪个 Node 版本上」，不含代码风格规则。
 *
 * frame 的代码大多在构建机的 Node 上运行（版本由 engines 约束、命令入口检查），只有两类例外：
 * - `src/paths.js`：其中的 `resolveLayout` 会打进项目的主进程，运行在 Electron 内置的 Node 上
 * - 构建 Node 版本检查（`bin/`、`src/core/node-version.js`）：在检查通过之前运行，必须能在旧版 Node 上执行
 *
 * eslint 10 要求 Node ^20.19 || ^22.13 || >=24。
 */
const n = require('eslint-plugin-n');

// Electron 22.3.1 内置 Node。项目 peer 的 electron 下限变化时同步修改
const ELECTRON_MAIN_NODE = '16.17.1';
// 版本检查需要在多旧的 Node 上也能给出提示
const VERSION_CHECK_NODE = '14.0.0';

const nodeGlobals = n.configs['flat/recommended-script'].languageOptions.globals;

function nodeFloor(version) {
    return {
        'n/no-unsupported-features/es-syntax': ['error', { version }],
        'n/no-unsupported-features/es-builtins': ['error', { version }],
        'n/no-unsupported-features/node-builtins': ['error', { version }],
    };
}

module.exports = [
    {
        files: ['src/paths.js'],
        languageOptions: { sourceType: 'commonjs', ecmaVersion: 2022, globals: nodeGlobals },
        plugins: { n },
        rules: nodeFloor(ELECTRON_MAIN_NODE),
    },
    {
        files: ['bin/**/*.js', 'src/core/node-version.js'],
        languageOptions: { sourceType: 'commonjs', ecmaVersion: 2022, globals: nodeGlobals },
        plugins: { n },
        rules: nodeFloor(VERSION_CHECK_NODE),
    },
];
