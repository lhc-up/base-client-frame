const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const envList = new Set(['dev', 'test', 'prod', 'net']);
function init() {
    const env = process.argv.find(v => !!envList.has(v)) || 'prod';
    const envPath = path.resolve(process.cwd(), `.env.${env}`);
    if (fs.existsSync(envPath)) {
        // 当前环境变量，先配置的优先级更高
        dotenv.config({
            path: envPath
        });
    }
    // 默认环境变量
    dotenv.config({
        path: path.resolve(__dirname, './.env')
    });
}


module.exports = init;