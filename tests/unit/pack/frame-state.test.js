const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const { readFrameState, writeFrameState } = require('../../../src/pack/frame-state');

const tmpDir = path.join(__dirname, '../../tmp/frame-state');

beforeEach(() => { fse.ensureDirSync(tmpDir); });
afterEach(() => { fse.removeSync(tmpDir); });

describe('pack/frame-state', () => {
    test('writeFrameState 写入 lastUnpack 字段，readFrameState 读出', () => {
        const state = {
            lastUnpack: {
                platform: 'win', arch: 'x64', env: 'prod', version: '1.2.3',
                unpackedPath: 'dist/win-unpacked', timestamp: 1700000000000,
            },
        };
        writeFrameState(tmpDir, state);
        const read = readFrameState(tmpDir);
        expect(read).toEqual(state);
    });

    test('readFrameState 文件不存在时返回 null', () => {
        expect(readFrameState(tmpDir)).toBeNull();
    });

    test('readFrameState JSON 损坏时返回 null', () => {
        fs.writeFileSync(path.join(tmpDir, '.frame-state.json'), '{ not json');
        expect(readFrameState(tmpDir)).toBeNull();
    });

    test('writeFrameState distDir 不存在时自动创建', () => {
        const sub = path.join(tmpDir, 'nested/dist');
        writeFrameState(sub, { lastUnpack: { unpackedPath: 'x' } });
        expect(fs.existsSync(path.join(sub, '.frame-state.json'))).toBe(true);
    });

    test('JSON 文件可读（人类可读格式化）', () => {
        writeFrameState(tmpDir, { lastUnpack: { unpackedPath: 'x' } });
        const raw = fs.readFileSync(path.join(tmpDir, '.frame-state.json'), 'utf8');
        expect(raw).toContain('\n');
        expect(raw).toContain('"unpackedPath"');
    });
});
