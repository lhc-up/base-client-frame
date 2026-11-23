const net = require('net');
const { execFile } = require('child_process');

/** 从配置的端口起往后试的个数（含配置的端口） */
const PORT_ATTEMPTS = 20;
/** 查占用进程的命令超时 */
const LOOKUP_TIMEOUT_MS = 5000;

/**
 * 端口在 host 上是否可以监听：试着监听，成功即关闭。
 *
 * @param {number} port
 * @param {string} host
 * @returns {Promise<boolean>}
 */
function isPortFree(port, host) {
    return new Promise(resolve => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => server.close(() => resolve(true)));
        server.listen(port, host);
    });
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<string|null>} stdout；命令不存在、失败或超时时为 null
 */
function run(cmd, args) {
    return new Promise(resolve => {
        execFile(cmd, args, { timeout: LOOKUP_TIMEOUT_MS, windowsHide: true }, (err, stdout) => {
            if (err) {
                resolve(null);
                return;
            }
            resolve(stdout);
        });
    });
}

/**
 * `netstat -ano -p TCP` 输出中监听该端口的 PID。
 *
 * @param {string} output
 * @param {number} port
 * @returns {number|null}
 */
function parseNetstatPid(output, port) {
    for (const line of output.split(/\r?\n/)) {
        const cols = line.trim().split(/\s+/);
        // 协议  本地地址  外部地址  状态  PID
        if (cols.length !== 5 || cols[3] !== 'LISTENING') {
            continue;
        }
        if (cols[1].endsWith(`:${port}`)) {
            return Number(cols[4]);
        }
    }
    return null;
}

/**
 * `lsof -Fpc` 输出：`p<pid>`、`c<命令名>` 各占一行。
 *
 * @param {string} output
 * @returns {{ pid: number, name: string }|null}
 */
function parseLsof(output) {
    let pid = null;
    let name = null;
    for (const line of output.split(/\r?\n/)) {
        if (line.startsWith('p') && pid === null) {
            pid = Number(line.slice(1));
        } else if (line.startsWith('c') && name === null) {
            name = line.slice(1);
        }
    }
    if (pid === null || name === null) {
        return null;
    }
    return { pid, name };
}

/**
 * `ss -ltnpH` 输出中的 `users:(("node",pid=123,fd=20))`。非 root 用户看不到其他用户的进程，此时没有该字段。
 *
 * @param {string} output
 * @returns {{ pid: number, name: string }|null}
 */
function parseSs(output) {
    const match = output.match(/users:\(\("([^"]+)",pid=(\d+)/);
    if (!match) {
        return null;
    }
    return { pid: Number(match[2]), name: match[1] };
}

async function findOwnerWindows(port) {
    const netstat = await run('netstat', ['-ano', '-p', 'TCP']);
    if (!netstat) {
        return null;
    }
    const pid = parseNetstatPid(netstat, port);
    if (!pid) {
        return null;
    }
    // 进程名用 PowerShell 按 UTF-8 输出：tasklist 按系统代码页输出，中文进程名在不同代码页下会乱码
    const script = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; (Get-Process -Id ${pid}).ProcessName`;
    const name = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
    if (!name || !name.trim()) {
        return null;
    }
    return { pid, name: `${name.trim()}.exe` };
}

async function findOwnerUnix(port) {
    const lsof = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc']);
    if (lsof) {
        const owner = parseLsof(lsof);
        if (owner) {
            return owner;
        }
    }
    const ss = await run('ss', ['-ltnpH', `sport = :${port}`]);
    if (ss) {
        return parseSs(ss);
    }
    return null;
}

/**
 * 监听该端口的进程。查不到（命令不存在、无权限、超时）时为 null。
 *
 * @param {number} port
 * @returns {Promise<{ pid: number, name: string }|null>}
 */
function findPortOwner(port) {
    if (process.platform === 'win32') {
        return findOwnerWindows(port);
    }
    return findOwnerUnix(port);
}

/**
 * 确定 dev server 端口：配置的端口被占用时往后找可用端口，并打印警告（能查到时写明占用的进程）。
 * 须在创建 webpack 编译器之前调用：dev server 地址会写进宿主代码（`__BC_BUILD__.devUrl`）。
 *
 * @param {{ port: number, host: string, warn: (msg: string) => void }} option
 * @returns {Promise<number>} 可用端口
 * @throws {Error} 从配置的端口起连续 PORT_ATTEMPTS 个都被占用
 */
async function resolveFreePort({ port, host, warn }) {
    const start = Number(port);
    for (let candidate = start; candidate < start + PORT_ATTEMPTS && candidate <= 65535; candidate++) {
        if (!(await isPortFree(candidate, host))) {
            continue;
        }
        if (candidate !== start) {
            const owner = await findPortOwner(start);
            if (owner) {
                warn(`端口 ${start} 已被 ${owner.name}（PID ${owner.pid}）占用，改用 ${candidate}`);
            } else {
                warn(`端口 ${start} 已被占用，改用 ${candidate}`);
            }
        }
        return candidate;
    }
    throw new Error(`端口 ${start} 起的 ${PORT_ATTEMPTS} 个端口都已被占用`);
}

module.exports = {
    resolveFreePort,
    isPortFree,
    findPortOwner,
    parseNetstatPid,
    parseLsof,
    parseSs,
    PORT_ATTEMPTS,
};
