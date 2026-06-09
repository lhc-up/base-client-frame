const ora = require('ora');

function createCompileSpinner(text = '编译中...') {
    let startedAt = null;
    let timer = null;
    let spinner = null;
    let active = false;

    function elapsed() {
        const ms = Date.now() - startedAt;
        return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
    }

    return {
        start() {
            if (active) return;
            active = true;
            startedAt = Date.now();
            spinner = ora(`${text} 0s`).start();
            timer = setInterval(() => {
                if (spinner) spinner.text = `${text} ${elapsed()}`;
            }, 1000);
            if (timer && timer.unref) timer.unref();
        },
        stop() {
            if (!active) return;
            active = false;
            if (timer) clearInterval(timer);
            timer = null;
            if (spinner) spinner.stop();
            spinner = null;
        },
        clear() {
            if (spinner) spinner.clear();
        },
        isActive() {
            return active;
        },
    };
}

module.exports = { createCompileSpinner };
