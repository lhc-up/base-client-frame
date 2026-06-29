const { killElectron } = require('../../../src/electron/kill-electron');

describe('electron/kill-electron', () => {
    test('child 为 null/undefined 时不报错', () => {
        expect(() => killElectron(null)).not.toThrow();
        expect(() => killElectron(undefined)).not.toThrow();
    });

    test('child 已退出（exitCode 非 null）时跳过', () => {
        const child = { pid: 123, exitCode: 0, kill: jest.fn() };
        killElectron(child);
        expect(child.kill).not.toHaveBeenCalled();
    });

    test('Linux/macOS：调 child.kill(SIGTERM)', () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', { value: 'linux' });
        try {
            const child = { pid: 999, exitCode: null, kill: jest.fn() };
            killElectron(child);
            expect(child.kill).toHaveBeenCalledWith('SIGTERM');
        } finally {
            Object.defineProperty(process, 'platform', { value: original });
        }
    });

    test('Windows：调 taskkill /pid <pid> /T /F（execSync 静默 stdio）', () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const cp = require('child_process');
        const spy = jest.spyOn(cp, 'execSync').mockImplementation(() => {});
        try {
            killElectron({ pid: 1234, exitCode: null, kill: jest.fn() });
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('taskkill /pid 1234 /T /F'), expect.objectContaining({ stdio: 'ignore' }));
        } finally {
            Object.defineProperty(process, 'platform', { value: original });
            spy.mockRestore();
        }
    });

    test('Windows execSync 抛错时被静默吞', () => {
        const original = process.platform;
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const cp = require('child_process');
        const spy = jest.spyOn(cp, 'execSync').mockImplementation(() => { throw new Error('not found'); });
        try {
            expect(() => killElectron({ pid: 1234, exitCode: null, kill: jest.fn() })).not.toThrow();
        } finally {
            Object.defineProperty(process, 'platform', { value: original });
            spy.mockRestore();
        }
    });
});
