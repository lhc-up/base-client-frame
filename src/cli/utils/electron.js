const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

function resolveElectron(rootDir) {
  let entry;
  try {
    entry = require.resolve('electron', { paths: [rootDir] });
  } catch (e) {
    throw new Error(`未找到 electron（在 ${rootDir}），请在项目中安装 electron`);
  }
  return require(entry);
}

function resolveMainEntry(rootDir) {
  const pkgPath = path.resolve(rootDir, 'package.json');
  delete require.cache[pkgPath];
  const pkg = require(pkgPath);
  const entry = path.resolve(rootDir, pkg.main || '');
  if (!fs.existsSync(entry) || !fs.statSync(entry).isFile()) {
    throw new Error(
      `主进程入口不存在：${entry}（请先构建，或检查 package.json 的 main 字段）`
    );
  }
  return entry;
}

function killElectron(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      childProcess.execSync(`taskkill /pid ${child.pid} /T /F`);
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch (_) {
        child.kill('SIGTERM');
      }
    }
  } catch (_) {
    // 进程已退出或 kill 失败，安静吞掉
  }
}

module.exports = { resolveElectron, resolveMainEntry, killElectron };
