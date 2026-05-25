const dotenv = require('dotenv');
const path = require('path');
const envList = new Set(['dev', 'test', 'prod', 'net']);
function init() {
    const env = process.argv.find(v => !!envList.has(v)) || 'prod';
    // 最终生效的配置写在前面
    dotenv.config({
        path: path.resolve(__dirname, `./.env.${env}`)
    });
    dotenv.config({
        path: path.resolve(__dirname, './.env')
    });
}


module.exports = init;