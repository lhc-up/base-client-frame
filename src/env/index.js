const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function readEnvFile(file) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return null;
  return dotenv.parse(fs.readFileSync(p));
}

module.exports = { readEnvFile };
