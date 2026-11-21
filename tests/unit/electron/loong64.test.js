const path = require('path');
const fse = require('fs-extra');
const { assertLoong64Builder, builderSupportsLoong64 } = require('../../../src/electron/loong64');

const tmpRoot = path.join(__dirname, '../../tmp/loong64');

/** 在 rootDir 下造一个 electron-builder 与它依赖的 builder-util，builder-util 的 Arch 由参数决定 */
function fakeProject(name, arch) {
    const rootDir = path.join(tmpRoot, name);
    const builderDir = path.join(rootDir, 'node_modules/electron-builder');
    const utilDir = path.join(rootDir, 'node_modules/builder-util');
    fse.outputJsonSync(path.join(builderDir, 'package.json'), { name: 'electron-builder', main: 'index.js' });
    fse.outputFileSync(path.join(builderDir, 'index.js'), 'module.exports = {};');
    fse.outputJsonSync(path.join(utilDir, 'package.json'), { name: 'builder-util', main: 'index.js' });
    fse.outputFileSync(path.join(utilDir, 'index.js'), `module.exports = { Arch: ${JSON.stringify(arch)} };`);
    return rootDir;
}

const OFFICIAL_ARCH = { ia32: 0, x64: 1, armv7l: 2, arm64: 3, universal: 4 };
const LOONG_ARCH = { ...OFFICIAL_ARCH, loong64: 5 };

describe('electron/loong64', () => {
    afterAll(() => fse.removeSync(tmpRoot));

    test('龙芯版 builder-util（Arch 含 loong64）：支持，检查通过', () => {
        const rootDir = fakeProject('loong', LOONG_ARCH);
        expect(builderSupportsLoong64(rootDir)).toBe(true);
        expect(() => assertLoong64Builder({ rootDir, arch: 'loong64', command: 'npx base-client pack' })).not.toThrow();
    });

    test('官方版 builder-util：loong64 时抛错，message 含完整处理步骤与本次命令', () => {
        const rootDir = fakeProject('official', OFFICIAL_ARCH);
        expect(builderSupportsLoong64(rootDir)).toBe(false);
        const command = 'npx base-client pack --platform linux --arch loong64 --env test';
        let message = '';
        try {
            assertLoong64Builder({ rootDir, arch: 'loong64', command });
        } catch (err) {
            message = err.message;
        }
        expect(message).toContain('当前项目装的是官方版，已停止打包');
        expect(message).toContain('标成 amd64');
        expect(message).toContain('rm -rf node_modules/electron-builder node_modules/builder-util package-lock.json');
        expect(message).toContain('npm i electron-builder@24.13.3 -D --registry=https://registry.loongnix.cn:4873/');
        expect(message).toContain(`  3. ${command}`);
        expect(message).toContain('git checkout -- package.json package-lock.json');
        expect(message).toContain('rm -rf node_modules && npm i');
    });

    test('非 loong64 架构不检查', () => {
        const rootDir = fakeProject('official-x64', OFFICIAL_ARCH);
        for (const arch of ['x64', 'arm64', 'ia32', undefined]) {
            expect(() => assertLoong64Builder({ rootDir, arch, command: 'x' })).not.toThrow();
        }
    });

    test('项目未安装 electron-builder：不在这里报错，交给后续的「未安装」提示', () => {
        const rootDir = path.join(tmpRoot, 'empty');
        fse.ensureDirSync(rootDir);
        expect(() => assertLoong64Builder({ rootDir, arch: 'loong64', command: 'x' })).not.toThrow();
    });
});
