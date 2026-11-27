const { LOONG_TARGETS, assertLoongTargetSupported } = require('../../../src/electron/loong');

describe('electron/loong', () => {
    test('loongarch64：旧世界，龙芯镜像 Electron 22.3.27，deb 架构名 loongarch64', () => {
        const t = LOONG_TARGETS.loongarch64;
        expect(t).toMatchObject({ world: '旧世界', builderArch: 'loong64', debArchitecture: 'loongarch64', supported: true });
        expect(t.electron.electronVersion).toBe('22.3.27');
        expect(t.electron.electronDownload).toMatchObject({
            mirror: 'http://ftp.loongnix.cn/electron/LoongArch/',
            customDir: 'v22.3.27',
            arch: 'loong64',
        });
        expect(() => assertLoongTargetSupported('loongarch64')).not.toThrow();
    });

    test('loong64：新世界尚未支持，选择即报错并提示改用 loongarch64', () => {
        expect(LOONG_TARGETS.loong64).toMatchObject({ debArchitecture: 'loong64', supported: false });
        expect(() => assertLoongTargetSupported('loong64')).toThrow(/新世界.*尚未支持[\s\S]*--arch loongarch64/);
    });

    test('非龙芯架构不检查', () => {
        for (const arch of ['x64', 'arm64', 'ia32', undefined]) {
            expect(() => assertLoongTargetSupported(arch)).not.toThrow();
        }
    });
});
