const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '../..');

function runNode(script) {
    return spawnSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' });
}

describe('frame 运行时导出解析', () => {
    test('根聚合与 package.json 可通过包自引用解析', () => {
        const script = `
            const path = require('path');
            const resolved = require.resolve('@base-client/frame');
            if (!resolved.endsWith(path.join('src', 'index.js'))) {
                console.error('unexpected root target: ' + resolved);
                process.exit(1);
            }
            require.resolve('@base-client/frame/package.json');
        `;
        const result = runNode(script);
        if (result.status !== 0) console.error(result.stderr);
        expect(result.status).toBe(0);
    });

    test('内部模块深路径被 exports 边界拒绝', () => {
        const script = `
            const blocked = [
                '@base-client/frame/src/pack/encrypt',
                '@base-client/frame/src/cli/commands/pack',
                '@base-client/frame/src/config/bc-config',
            ];
            for (const specifier of blocked) {
                try {
                    require.resolve(specifier);
                    console.error('not blocked: ' + specifier);
                    process.exit(1);
                } catch (error) {
                    if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
                        console.error(specifier + ' -> unexpected ' + error.code);
                        process.exit(1);
                    }
                }
            }
        `;
        const result = runNode(script);
        if (result.status !== 0) console.error(result.stderr);
        expect(result.status).toBe(0);
    });

    test('根聚合导出形状固定', () => {
        const script = `
            const frame = require('@base-client/frame');
            const keys = Object.keys(frame).sort();
            const expected = ['MODES', 'TARGETS', 'createCli', 'customMerge', 'logger', 'replace', 'runCommand', 'styleLoader'].sort();
            if (JSON.stringify(keys) !== JSON.stringify(expected)) {
                console.error('aggregate keys: ' + keys.join(','));
                process.exit(1);
            }
        `;
        const result = runNode(script);
        if (result.status !== 0) console.error(result.stderr);
        expect(result.status).toBe(0);
    });
});