const path = require('path');
const { spawn } = require('child_process');

/**
 * 预览构建结果
 * 直接启动 Electron 打开已构建的文件
 */
async function preview() {
    console.log('[Base] 启动预览...');

    const mainPath = path.join(process.cwd(), 'out/main/index.js');

    // 检查构建产物是否存在
    const fs = require('fs');
    if (!fs.existsSync(mainPath)) {
        console.error('[Base] 错误: 找不到主进程构建文件。请先运行 `base-client build`。');
        process.exit(1);
    }

    const electronPath = require('electron');

    console.log('[Base] 主进程:', mainPath);

    const electron = spawn(electronPath, [mainPath], {
        stdio: 'inherit',
        env: {
            ...process.env,
            NODE_ENV: 'production'
        }
    });

    electron.on('close', (code) => {
        process.exit(code);
    });
}

module.exports = { preview };