const cp = require('child_process');

function killElectron(child) {
    if (!child || child.exitCode != null) return;

    if (process.platform === 'win32') {
        try {
            cp.execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
        } catch {
            // 进程可能已退出，吞掉 taskkill not-found 类错误
        }
        return;
    }

    try {
        child.kill('SIGTERM');
    } catch {
        // 进程已退出
    }
}

module.exports = { killElectron };
