const path = require('path');
const fse = require('fs-extra');

function resolveMainEntry(rootDir) {
    const pkgPath = path.resolve(rootDir, 'package.json');
    const pkg = fse.readJsonSync(pkgPath);
    if (!pkg.main) {
        throw new Error(`[base-client] package.json 缺少 main 字段（${pkgPath}）`);
    }
    const entry = path.resolve(rootDir, pkg.main);
    if (!fse.existsSync(entry)) {
        throw new Error(`[base-client] 主进程入口不存在：${entry}（请先构建，或检查 package.json 的 main 字段）`);
    }
    return entry;
}

module.exports = { resolveMainEntry };
