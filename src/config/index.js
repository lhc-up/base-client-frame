const fs = require('fs');
const path = require('path');

const SUPPORTED_EXTS = ['.js', '.cjs'];
const UNSUPPORTED_EXTS_WITH_HINT = ['.mjs'];

function loadUserConfig(configPath) {
  const resolvedPath = configPath
    ? path.resolve(process.cwd(), configPath)
    : probeFromCwd();

  if (!resolvedPath) {
    throw new Error('未找到 bc.config.js（在 ' + process.cwd() + '）');
  }

  const ext = path.extname(resolvedPath);
  if (UNSUPPORTED_EXTS_WITH_HINT.includes(ext)) {
    throw new Error(
      `${path.basename(resolvedPath)} 暂不支持，请改用 .js / .cjs`
    );
  }

  delete require.cache[resolvedPath];
  const mod = require(resolvedPath);
  const fn = mod && mod.__esModule ? mod.default : mod;

  if (typeof fn !== 'function') {
    throw new Error('bc.config.js 必须导出函数 (ctx) => config');
  }
  return fn;
}

function probeFromCwd() {
  for (const ext of [...SUPPORTED_EXTS, ...UNSUPPORTED_EXTS_WITH_HINT]) {
    const p = path.resolve(process.cwd(), `bc.config${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = { loadUserConfig };
