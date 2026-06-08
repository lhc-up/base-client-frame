const childProcess = require('child_process');
const { killElectron } = require('../../src/cli/utils/electron');

describe('killElectron', () => {
    test('child 为 undefined 时安静返回', () => {
        expect(() => killElectron()).not.toThrow();
    });

    test('child 无 pid 时安静返回', () => {
        expect(() => killElectron({})).not.toThrow();
    });
});

describe('killElectron 平台分支', () => {
    let origPlatform;
    let execSyncSpy, processKillSpy;

    beforeEach(() => {
        origPlatform = process.platform;
        execSyncSpy = jest.spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));
        processKillSpy = jest.spyOn(process, 'kill').mockImplementation(() => {});
    });
    afterEach(() => {
        Object.defineProperty(process, 'platform', { value: origPlatform });
    });

    test('Windows: 调用 taskkill /T /F', () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        killElectron({ pid: 1234 });
        expect(execSyncSpy).toHaveBeenCalledWith('taskkill /pid 1234 /T /F', { stdio: 'ignore' });
        expect(processKillSpy).not.toHaveBeenCalled();
    });

    test('非 Windows：先 process.kill(-pid, SIGTERM)（杀进程组）', () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        killElectron({ pid: 1234, kill: jest.fn() });
        expect(processKillSpy).toHaveBeenCalledWith(-1234, 'SIGTERM');
    });

    test('非 Windows + 进程组 kill 失败 → fallback child.kill(SIGTERM)', () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        processKillSpy.mockImplementation(() => { throw new Error('ESRCH'); });
        const child = { pid: 1234, kill: jest.fn() };
        killElectron(child);
        expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    });
});
