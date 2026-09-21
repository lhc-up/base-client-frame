const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('frame 包边界', () => {
    test('显式导出根聚合入口与 package.json，不暴露内部模块', () => {
        expect(packageJson.exports).toEqual({
            '.': './src/index.js',
            './package.json': './package.json',
        });
        expect(packageJson.main).toBe('src/index.js');
    });

    test('发布内容只含 bin 与 src', () => {
        expect(packageJson.files).toEqual(['bin', 'src']);
    });

    test('bin 入口是薄壳：shebang 后委托 createCli', () => {
        const binPath = path.join(root, 'bin/base-client.js');
        expect(fs.existsSync(binPath)).toBe(true);
        const source = fs.readFileSync(binPath, 'utf8');
        expect(source.startsWith('#!/usr/bin/env node')).toBe(true);
        expect(source).toContain("require('../src/cli')");
        expect(source).toContain('createCli()');
    });

    test('根聚合入口只装配 core/cli/config 模块，导出公开 API', () => {
        const source = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
        const requires = [...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)]
            .map(m => m[1])
            .sort();
        expect(requires).toEqual([
            './cli',
            './config/merge',
            './core/logger',
            './core/mode',
            './core/target',
        ]);
        for (const key of ['MODES', 'TARGETS', 'createCli', 'runCommand', 'replace', 'customMerge', 'logger']) {
            expect(source).toContain(key);
        }
    });
});