const ora = require('ora');

function createCompileSpinner(text = '编译中...', expectedCount = 1) {
    const startedAt = Date.now();
    const spinner = ora({ text, color: 'cyan' });
    let running = false;
    let initialCount = 0;
    let timer = null;

    function refresh() {
        const ms = Date.now() - startedAt;
        const sec = (ms / 1000).toFixed(1);
        spinner.text = `${text} ${sec}s`;
    }

    return {
        start() {
            if (running) return;
            running = true;
            spinner.start();
            timer = setInterval(refresh, 1000);
            timer.unref?.();
        },
        stop() {
            if (!running) return;
            running = false;
            clearInterval(timer);
            spinner.stop();
        },
        clear() {
            spinner.clear();
        },
        tickInitial() {
            initialCount += 1;
            if (initialCount >= expectedCount) {
                this.stop();
            }
        },
        isRunning() {
            return running;
        },
    };
}

module.exports = { createCompileSpinner };
