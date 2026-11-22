const path = require('path');
const fse = require('fs-extra');
const webpack = require('webpack');
const {
    CircularDependencyPlugin,
    applyCircularDependencyCheck,
    resolveCircularDependencyMode,
} = require('../../../src/config/presets/circular-dependency-plugin');
const logger = require('../../../src/core/logger');

const tmpRoot = path.join(__dirname, '../../tmp/circular-dependency');

/**
 * @param {Record<string, string>} files 相对 tmpRoot 的文件 → 内容；入口固定为 src/index.js
 * @param {'warn' | 'error'} mode
 */
function compile(files, mode = 'warn') {
    // 不继承 frame 自己 package.json 的 "type": "commonjs"，让 import 与 require 都能解析
    fse.outputFileSync(path.join(tmpRoot, 'package.json'), '{}');
    for (const [file, content] of Object.entries(files)) {
        fse.outputFileSync(path.join(tmpRoot, file), content);
    }
    return new Promise((resolve, reject) => {
        webpack({
            mode: 'none',
            target: 'node',
            context: tmpRoot,
            entry: './src/index.js',
            output: { path: path.join(tmpRoot, 'out'), filename: 'bundle.js' },
            plugins: [new CircularDependencyPlugin({ mode })],
        }, (err, stats) => {
            if (err) return reject(err);
            const pick = list => list.map(e => e.message).filter(m => m.startsWith('循环依赖'));
            resolve({
                warnings: pick(stats.compilation.warnings),
                errors: pick(stats.compilation.errors),
            });
        });
    });
}

describe('config/presets/circular-dependency-plugin（实际编译）', () => {
    let warnSpy;
    beforeEach(() => { warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {}); });
    afterEach(() => { warnSpy.mockRestore(); fse.removeSync(tmpRoot); });

    test('import 形成的循环：警告并写出路径，同时打印到控制台', async () => {
        const { warnings, errors } = await compile({
            'src/index.js': "import './a';\n",
            'src/a.js': "import { b } from './b';\nexport const a = 1;\nconsole.log(b);\n",
            'src/b.js': "import { a } from './a';\nexport const b = () => a;\n",
        });
        expect(warnings).toEqual(['循环依赖：src/a.js → src/b.js → src/a.js']);
        expect(errors).toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith('循环依赖：src/a.js → src/b.js → src/a.js');
    });

    test('require 形成的循环也报出', async () => {
        const { warnings } = await compile({
            'src/index.js': "require('./a');\n",
            'src/a.js': "const b = require('./b');\nmodule.exports = { b };\n",
            'src/b.js': "const { a } = require('./a');\nmodule.exports = { a };\n",
        });
        expect(warnings).toEqual(['循环依赖：src/a.js → src/b.js → src/a.js']);
    });

    test('import 与 require 混用的循环也报出', async () => {
        const { warnings } = await compile({
            'src/index.js': "import './a';\n",
            'src/a.js': "import { b } from './b';\nexport const a = b;\n",
            'src/b.js': "exports.b = () => require('./a');\n",
        });
        expect(warnings).toEqual(['循环依赖：src/a.js → src/b.js → src/a.js']);
    });

    test('import() 动态导入不算循环', async () => {
        const { warnings } = await compile({
            'src/index.js': "import './a';\n",
            'src/a.js': "import { b } from './b';\nexport const a = b;\n",
            'src/b.js': "export const b = () => import('./a');\n",
        });
        expect(warnings).toEqual([]);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    test('node_modules 内部的循环不报', async () => {
        const { warnings } = await compile({
            'src/index.js': "require('lib-x');\n",
            'node_modules/lib-x/package.json': '{ "name": "lib-x", "main": "a.js" }',
            'node_modules/lib-x/a.js': "require('./b');\n",
            'node_modules/lib-x/b.js': "require('./a');\n",
        });
        expect(warnings).toEqual([]);
    });

    test('没有循环时不警告', async () => {
        const { warnings } = await compile({
            'src/index.js': "import { a } from './a';\nimport { b } from './b';\nconsole.log(a, b);\n",
            'src/a.js': "import { b } from './b';\nexport const a = b;\n",
            'src/b.js': 'export const b = 1;\n',
        });
        expect(warnings).toEqual([]);
    });

    test('多个文件互相引用：每组只报一条，写明这一组的文件数', async () => {
        const { warnings } = await compile({
            'src/index.js': "import './a';\n",
            'src/a.js': "import './b';\n",
            'src/b.js': "import './a';\nimport './c';\n",
            'src/c.js': "import './b';\n",
        });
        expect(warnings).toEqual(['循环依赖：src/a.js → src/b.js → src/a.js（这一组共 3 个文件互相引用）']);
    });

    test('互不相关的两组循环各报一条，按路径排序', async () => {
        const { warnings } = await compile({
            'src/index.js': "import './x1';\nimport './a1';\n",
            'src/x1.js': "import './x2';\n",
            'src/x2.js': "import './x1';\n",
            'src/a1.js': "import './a2';\n",
            'src/a2.js': "import './a1';\n",
        });
        expect(warnings).toEqual([
            '循环依赖：src/a1.js → src/a2.js → src/a1.js',
            '循环依赖：src/x1.js → src/x2.js → src/x1.js',
        ]);
    });

    test("mode 为 'error' 时作为编译错误，不再警告", async () => {
        const { warnings, errors } = await compile({
            'src/index.js': "import './a';\n",
            'src/a.js': "import './b';\n",
            'src/b.js': "import './a';\n",
        }, 'error');
        expect(errors).toEqual(['循环依赖：src/a.js → src/b.js → src/a.js']);
        expect(warnings).toEqual([]);
        expect(warnSpy).not.toHaveBeenCalled();
    });
});

describe('config/presets/circular-dependency-plugin（配置）', () => {
    test("resolveCircularDependencyMode：未写时默认 'warn'，合法值原样返回", () => {
        expect(resolveCircularDependencyMode(undefined)).toBe('warn');
        expect(resolveCircularDependencyMode('warn')).toBe('warn');
        expect(resolveCircularDependencyMode('error')).toBe('error');
        expect(resolveCircularDependencyMode(false)).toBe(false);
    });

    test.each([true, 'off', 0, null, {}])('resolveCircularDependencyMode：非法值 %p 报错', (value) => {
        expect(() => resolveCircularDependencyMode(value)).toThrow("circularDependency 只能是 'warn'、'error' 或 false");
    });

    test('applyCircularDependencyCheck：追加插件；false 时不加', () => {
        const config = { plugins: [{ apply() {} }] };
        applyCircularDependencyCheck(config, 'warn');
        expect(config.plugins).toHaveLength(2);
        expect(config.plugins[1]).toBeInstanceOf(CircularDependencyPlugin);
        expect(config.plugins[1].mode).toBe('warn');

        const off = {};
        applyCircularDependencyCheck(off, false);
        expect(off.plugins).toBeUndefined();
    });
});
