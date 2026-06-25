const path = require('path');
const fs = require('fs-extra');
const { runProductionBuild } = require('../../../src/webpack-runner/run-build');
const logger = require('../../../src/core/logger');

const tmpRoot = path.join(__dirname, '../../tmp/run-build');

function makeMinimalConfig(name, entryContent) {
    const dir = path.join(tmpRoot, name);
    fs.ensureDirSync(dir);
    const entry = path.join(dir, 'entry.js');
    fs.writeFileSync(entry, entryContent);
    return {
        name,
        mode: 'production',
        entry,
        output: { path: path.join(dir, 'out'), filename: 'bundle.js' },
        target: 'node',
        stats: 'none',
        infrastructureLogging: { level: 'warn' },
    };
}

describe('webpack-runner/run-build', () => {
    let logSpy, errSpy;
    beforeEach(() => {
        logSpy = jest.spyOn(logger, 'compileSuccess').mockImplementation(() => {});
        errSpy = jest.spyOn(logger, 'compileFailure').mockImplementation(() => {});
        jest.spyOn(logger, 'compileWarning').mockImplementation(() => {});
        fs.removeSync(tmpRoot);
    });
    afterAll(() => { fs.removeSync(tmpRoot); });

    test('runProductionBuild 编译单 config 成功，调 logger.compileSuccess', async () => {
        const cfg = makeMinimalConfig('single', 'module.exports = 1;');
        await runProductionBuild([cfg], { target: 'web', env: {} });
        expect(logSpy).toHaveBeenCalledWith('single', expect.any(Number), expect.any(Number));
        expect(fs.existsSync(path.join(tmpRoot, 'single/out/bundle.js'))).toBe(true);
    });

    test('runProductionBuild 编译多 config 并行成功', async () => {
        const a = makeMinimalConfig('a', 'module.exports = "a";');
        const b = makeMinimalConfig('b', 'module.exports = "b";');
        await runProductionBuild([a, b], { target: 'web', env: {} });
        expect(logSpy).toHaveBeenCalledWith('a', expect.any(Number), expect.any(Number));
        expect(logSpy).toHaveBeenCalledWith('b', expect.any(Number), expect.any(Number));
    });

    test('runProductionBuild 任一 config 失败时 reject 并调 logger.compileFailure', async () => {
        const ok = makeMinimalConfig('ok', 'module.exports = 1;');
        const bad = makeMinimalConfig('bad', 'this is not valid javascript ===');
        await expect(runProductionBuild([ok, bad], { target: 'web', env: {} })).rejects.toThrow();
        expect(errSpy).toHaveBeenCalledWith('bad');
    });
});
