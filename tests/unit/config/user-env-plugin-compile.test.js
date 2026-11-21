const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const webpack = require('webpack');
const { userEnvPlugin } = require('../../../src/config/presets/user-env-plugin');
const logger = require('../../../src/core/logger');

const tmpRoot = path.join(__dirname, '../../tmp/user-env-compile');

function compile(source, env) {
    fse.outputFileSync(path.join(tmpRoot, 'src/entry.js'), source);
    return new Promise((resolve, reject) => {
        webpack({
            mode: 'none',
            target: 'node',
            context: tmpRoot,
            entry: './src/entry.js',
            output: { path: path.join(tmpRoot, 'out'), filename: 'bundle.js' },
            plugins: [userEnvPlugin(env)],
        }, (err, stats) => {
            if (err) return reject(err);
            const out = fs.readFileSync(path.join(tmpRoot, 'out/bundle.js'), 'utf8');
            resolve({ out, warnings: stats.compilation.warnings.map(w => w.message) });
        });
    });
}

describe('config/presets/user-env-plugin（实际编译）', () => {
    let warnSpy;
    beforeEach(() => { warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {}); });
    afterEach(() => { warnSpy.mockRestore(); fse.removeSync(tmpRoot); });

    test('已声明替换为值；未声明替换为 undefined 并警告；非 BC_ 不动', async () => {
        const { out, warnings } = await compile([
            'exports.a = process.env.BC_A;',
            'exports.b = process.env.BC_B;',
            'exports.n = process.env.NODE_X;',
        ].join('\n'), { BC_A: 'a', OTHER: 'x' });

        expect(out).toContain('exports.a = "a"');
        expect(out).toContain('exports.b = undefined');
        expect(out).toContain('process.env.NODE_X');
        expect(out).not.toContain('BC_B');
        expect(warnings).toEqual([expect.stringMatching(/^BC_B 未在 .*声明，已替换为 undefined（src[\\/]entry\.js:2）$/)]);
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    test('带属性、方法调用、作为参数：只替换 process.env.BC_xxx 这一段', async () => {
        const { out } = await compile([
            'exports.l = process.env.BC_C.length;',
            'exports.t = process.env.BC_D.trim();',
            'exports.p = JSON.parse(process.env.BC_E);',
            'exports.k = process.env.BC_A.length;',
        ].join('\n'), { BC_A: 'a' });

        expect(out).toContain('exports.l = undefined.length');
        expect(out).toContain('exports.t = undefined.trim()');
        expect(out).toContain('exports.p = JSON.parse(undefined)');
        expect(out).toContain('exports.k = "a".length');
        expect(out).not.toMatch(/process\.env\.BC_/);
    });

    test('typeof 写法：未声明替换为 typeof undefined 并警告；已声明（含空值）求值为 "string"', async () => {
        const { out, warnings } = await compile([
            'exports.u = typeof process.env.BC_U;',
            'exports.d = typeof process.env.BC_A;',
            'exports.e = typeof process.env.BC_EMPTY;',
            'if (typeof process.env.BC_U !== "undefined") exports.x = 1;',
        ].join('\n'), { BC_A: 'a', BC_EMPTY: '' });

        expect(out).toContain('exports.u = typeof undefined');
        expect(out).toContain('exports.d = "string"');
        expect(out).toContain('exports.e = "string"');
        expect(out).toContain('if (typeof undefined !== "undefined")');
        expect(out).not.toMatch(/process\.env\.BC_/);
        expect(warnings).toEqual([expect.stringMatching(/^BC_U 未在 .*声明，已替换为 undefined（src[\\/]entry\.js:1）$/)]);
    });

    test('空值也算声明：不警告，替换为空串', async () => {
        const { out, warnings } = await compile('exports.e = process.env.BC_EMPTY;', { BC_EMPTY: '' });
        expect(out).toContain('exports.e = ""');
        expect(warnings).toEqual([]);
        expect(warnSpy).not.toHaveBeenCalled();
    });
});
