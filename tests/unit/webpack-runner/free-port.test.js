const net = require('net');
const {
    resolveFreePort, isPortFree, findPortOwner, parseNetstatPid, parseLsof, parseSs, PORT_ATTEMPTS,
} = require('../../../src/webpack-runner/free-port');

const HOST = '127.0.0.1';

/** 在 host 上占住一个系统分配的端口 */
function occupy(port = 0) {
    return new Promise(resolve => {
        const server = net.createServer();
        server.listen(port, HOST, () => resolve(server));
    });
}

function close(server) {
    return new Promise(resolve => server.close(resolve));
}

describe('webpack-runner/free-port', () => {
    test('isPortFree：被占用为 false，释放后为 true', async () => {
        const server = await occupy();
        const { port } = server.address();
        expect(await isPortFree(port, HOST)).toBe(false);
        await close(server);
        expect(await isPortFree(port, HOST)).toBe(true);
    });

    test('resolveFreePort：端口空闲时原样返回，不警告', async () => {
        const server = await occupy();
        const { port } = server.address();
        await close(server);
        const warn = jest.fn();
        expect(await resolveFreePort({ port, host: HOST, warn })).toBe(port);
        expect(warn).not.toHaveBeenCalled();
    });

    test('resolveFreePort：被占用时往后找，警告写明原端口与新端口', async () => {
        const server = await occupy();
        const { port } = server.address();
        const warn = jest.fn();
        const result = await resolveFreePort({ port, host: HOST, warn });
        await close(server);
        expect(result).toBeGreaterThan(port);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(new RegExp(`^端口 ${port} 已被.*占用，改用 ${result}$`));
    });

    test('resolveFreePort：连续 PORT_ATTEMPTS 个都被占用时报错', async () => {
        const base = 64000;
        const servers = [];
        for (let i = 0; i < PORT_ATTEMPTS; i++) {
            servers.push(await occupy(base + i));
        }
        await expect(resolveFreePort({ port: base, host: HOST, warn: jest.fn() }))
            .rejects.toThrow(`端口 ${base} 起的 ${PORT_ATTEMPTS} 个端口都已被占用`);
        for (const server of servers) {
            await close(server);
        }
    });

    test('findPortOwner：查到本进程（当前平台实测）', async () => {
        const server = await occupy();
        const { port } = server.address();
        const owner = await findPortOwner(port);
        await close(server);
        if (owner === null) {
            // 查询命令不可用（如 CI 容器中没有 lsof / ss）时允许为 null
            return;
        }
        expect(owner.pid).toBe(process.pid);
        expect(owner.name.toLowerCase()).toContain('node');
    }, 20000);

    test('parseNetstatPid：只取 LISTENING 且端口完全匹配的行', () => {
        const output = [
            '活动连接',
            '  协议  本地地址          外部地址        状态           PID',
            '  TCP    127.0.0.1:18023        127.0.0.1:50000        ESTABLISHED     11',
            '  TCP    127.0.0.1:18023        0.0.0.0:0              LISTENING       22',
            '  TCP    127.0.0.1:8023         0.0.0.0:0              LISTENING       25112',
            '  TCP    [::1]:8023             [::]:0                 LISTENING       25112',
        ].join('\r\n');
        expect(parseNetstatPid(output, 8023)).toBe(25112);
        expect(parseNetstatPid(output, 9000)).toBeNull();
    });

    test('parseLsof：取 p<pid> 与 c<命令名>', () => {
        expect(parseLsof('p4321\ncnode\nf20\n')).toEqual({ pid: 4321, name: 'node' });
        expect(parseLsof('')).toBeNull();
    });

    test('parseSs：取 users 字段；没有该字段（无权限）时为 null', () => {
        const line = 'LISTEN 0 511 127.0.0.1:8023 0.0.0.0:* users:(("node",pid=4321,fd=20))';
        expect(parseSs(line)).toEqual({ pid: 4321, name: 'node' });
        expect(parseSs('LISTEN 0 511 127.0.0.1:8023 0.0.0.0:*')).toBeNull();
    });
});
