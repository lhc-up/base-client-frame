const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { resolveModule } = require('../../../src/core/resolve-module');

const fixtureDir = path.join(__dirname, '../../tmp/resolve-module');

function writePkg(dir, name, main, content, extra = {}) {
    const pkgDir = path.join(dir, 'node_modules', name);
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({ name, main, version: '1.0.0', ...extra }),
    );
    fs.writeFileSync(path.join(pkgDir, main), content);
}

beforeEach(() => {
    fs.mkdirSync(fixtureDir, { recursive: true });
    writePkg(fixtureDir, 'cjs-pkg', 'index.js', `module.exports = { hello: 'cjs' };`);
    writePkg(fixtureDir, 'esm-pkg', 'index.js',
        `export default { hello: 'esm' };`,
        { type: 'module' });
});
afterEach(() => { fs.rmSync(fixtureDir, { recursive: true, force: true }); });

describe('core/resolve-module', () => {
    test('加载 CJS 包，返回其默认导出', async () => {
        const mod = await resolveModule('cjs-pkg', { rootDir: fixtureDir });
        expect(mod).toEqual({ hello: 'cjs' });
    });

    test('包不存在时抛出 missingHint', async () => {
        await expect(
            resolveModule('non-existent-pkg', { rootDir: fixtureDir })
        ).rejects.toThrow(/non-existent-pkg 未安装/);
    });

    test('包位于上游 node_modules 时抛出 missingHint（不复用上游）', async () => {
        // jest 一定在 base-client-frame/node_modules 里，fixtureDir 内没有 jest，
        // require.resolve 会回退到上游找到，但 relative 以 .. 开头，应触发 missingHint
        await expect(
            resolveModule('jest', { rootDir: fixtureDir })
        ).rejects.toThrow(/jest 未安装/);
    });

    test('esmCompat 为 true 时通过 dynamic import 加载 ESM 包（子进程真实加载）', () => {
        // Jest 30 VM 沙箱在 Babel 转换阶段就拦截 ESM 语法，无法真实触发 ERR_REQUIRE_ESM。
        // 此测试在 node 子进程里执行 resolveModule，验证真实 Node 环境下 esmCompat 分支正确工作。
        const resolveModulePath = path.resolve(__dirname, '../../../src/core/resolve-module.js');
        const script = `
            const { resolveModule } = require(${JSON.stringify(resolveModulePath)});
            (async () => {
                const mod = await resolveModule('esm-pkg', {
                    rootDir: ${JSON.stringify(fixtureDir)},
                    esmCompat: true,
                });
                process.stdout.write(JSON.stringify(mod));
            })().catch((err) => {
                process.stderr.write(String(err && err.stack || err));
                process.exit(1);
            });
        `;
        const out = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' });
        expect(JSON.parse(out)).toEqual({ hello: 'esm' });
    });

    test('rootDir 未提供时默认 process.cwd()', async () => {
        const origCwd = process.cwd();
        process.chdir(fixtureDir);
        try {
            const mod = await resolveModule('cjs-pkg');
            expect(mod).toEqual({ hello: 'cjs' });
        } finally {
            process.chdir(origCwd);
        }
    });
});
