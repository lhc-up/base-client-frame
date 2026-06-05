const fs = require('fs');
const os = require('os');
const path = require('path');

function withTempCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-m2-'));
  const originalCwd = process.cwd();
  process.chdir(dir);
  return {
    dir,
    cleanup() {
      process.chdir(originalCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

module.exports = { withTempCwd };
