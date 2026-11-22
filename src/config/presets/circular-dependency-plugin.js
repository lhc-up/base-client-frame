const path = require('path');
const webpack = require('webpack');
const logger = require('../../core/logger');

const PLUGIN_NAME = 'BaseClientCircularDependencyPlugin';

/** bc.config `circularDependency` 的可选值 */
const MODES = ['warn', 'error', false];
const DEFAULT_MODE = 'warn';

/**
 * 循环依赖检测：只看项目自己的代码（排除 node_modules），`import` 与 `require` 都算，
 * `import()` 等异步加载不算（懒加载不会在初始化阶段互相等待）。
 *
 * 写在函数里的 `require('./x')` 也会报出来：webpack 的依赖信息分不出 require 写在顶层还是函数里，
 * 因此默认只警告、不让构建失败。
 */
class CircularDependencyPlugin {
    /**
     * @param {{ mode: 'warn' | 'error' }} options
     */
    constructor({ mode }) {
        this.mode = mode;
    }

    apply(compiler) {
        compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
            compilation.hooks.finishModules.tap(PLUGIN_NAME, (modules) => {
                const cycles = findCycles(modules, compilation.moduleGraph);
                for (const cycle of cycles) {
                    const msg = formatCycle(cycle, compiler.context);
                    if (this.mode === 'error') {
                        compilation.errors.push(new webpack.WebpackError(msg));
                        continue;
                    }
                    compilation.warnings.push(new webpack.WebpackError(msg));
                    logger.warn(msg);
                }
            });
        });
    }
}

function isOwnModule(module) {
    if (!module || typeof module.resource !== 'string') {
        return false;
    }
    return !/[\\/]node_modules[\\/]/.test(module.resource);
}

/**
 * 每个模块同步引用的项目模块（去重、保持出现顺序）。
 *
 * @returns {Map<object, object[]>}
 */
function buildGraph(modules, moduleGraph) {
    const graph = new Map();
    for (const module of modules) {
        if (isOwnModule(module)) {
            graph.set(module, []);
        }
    }
    for (const [module, targets] of graph) {
        const seen = new Set();
        for (const connection of moduleGraph.getOutgoingConnections(module)) {
            const target = connection.module;
            // 指向自己的连接（如 CommonJS 的 module.exports 赋值）不构成循环
            if (target === module || !graph.has(target) || seen.has(target)) {
                continue;
            }
            if (connection.weak) {
                continue;
            }
            const block = connection.dependency ? moduleGraph.getParentBlock(connection.dependency) : null;
            if (block instanceof webpack.AsyncDependenciesBlock) {
                continue;
            }
            seen.add(target);
            targets.push(target);
        }
    }
    return graph;
}

/**
 * 强连通分量（Tarjan，迭代实现避免深递归栈溢出）：一次遍历找出所有互相引用的模块组。
 *
 * @returns {object[][]} 只返回构成循环的分量（两个及以上模块）
 */
function stronglyConnected(graph) {
    const index = new Map();
    const low = new Map();
    const onStack = new Set();
    const stack = [];
    const result = [];
    let counter = 0;

    for (const root of graph.keys()) {
        if (index.has(root)) {
            continue;
        }
        const work = [{ node: root, next: 0 }];
        index.set(root, counter);
        low.set(root, counter);
        counter += 1;
        stack.push(root);
        onStack.add(root);

        while (work.length) {
            const frame = work[work.length - 1];
            const targets = graph.get(frame.node);
            if (frame.next < targets.length) {
                const target = targets[frame.next];
                frame.next += 1;
                if (!index.has(target)) {
                    index.set(target, counter);
                    low.set(target, counter);
                    counter += 1;
                    stack.push(target);
                    onStack.add(target);
                    work.push({ node: target, next: 0 });
                } else if (onStack.has(target)) {
                    low.set(frame.node, Math.min(low.get(frame.node), index.get(target)));
                }
                continue;
            }
            work.pop();
            if (work.length) {
                const parent = work[work.length - 1].node;
                low.set(parent, Math.min(low.get(parent), low.get(frame.node)));
            }
            if (low.get(frame.node) !== index.get(frame.node)) {
                continue;
            }
            const component = [];
            let member;
            do {
                member = stack.pop();
                onStack.delete(member);
                component.push(member);
            } while (member !== frame.node);
            if (component.length > 1) {
                result.push(component);
            }
        }
    }
    return result;
}

/**
 * 在一个分量内找一条从起点出发回到起点的最短路径，作为示例展示。
 */
function shortestCycle(start, component, graph) {
    const members = new Set(component);
    const previous = new Map([[start, null]]);
    const queue = [start];
    while (queue.length) {
        const current = queue.shift();
        for (const target of graph.get(current)) {
            if (!members.has(target)) {
                continue;
            }
            if (target === start) {
                const route = [];
                let node = current;
                while (node) {
                    route.unshift(node);
                    node = previous.get(node);
                }
                return route;
            }
            if (!previous.has(target)) {
                previous.set(target, current);
                queue.push(target);
            }
        }
    }
    return [start];
}

/**
 * @returns {{ route: object[], size: number }[]} 每组循环一条示例路径，以及该组的模块数
 */
function findCycles(modules, moduleGraph) {
    const graph = buildGraph(modules, moduleGraph);
    const cycles = [];
    for (const component of stronglyConnected(graph)) {
        // 路径从资源路径最小的模块开始，保证每次输出一致
        const sorted = [...component].sort((a, b) => a.resource.localeCompare(b.resource));
        cycles.push({ route: shortestCycle(sorted[0], component, graph), size: component.length });
    }
    cycles.sort((a, b) => a.route[0].resource.localeCompare(b.route[0].resource));
    return cycles;
}

function displayPath(module, context) {
    return path.relative(context, module.resource).split(path.sep).join('/');
}

function formatCycle({ route, size }, context) {
    const names = route.map(module => displayPath(module, context));
    names.push(names[0]);
    let msg = `循环依赖：${names.join(' → ')}`;
    if (size > route.length) {
        msg += `（这一组共 ${size} 个文件互相引用）`;
    }
    return msg;
}

/**
 * 校验并取得 bc.config `circularDependency`。
 *
 * @param {*} value
 * @returns {'warn' | 'error' | false}
 */
function resolveCircularDependencyMode(value) {
    if (value === undefined) {
        return DEFAULT_MODE;
    }
    if (!MODES.includes(value)) {
        throw new Error(`[base-client] bc.config 的 circularDependency 只能是 'warn'、'error' 或 false，收到：${JSON.stringify(value)}`);
    }
    return value;
}

/**
 * 给一份已合并的配置加上检测（原地修改）；mode 为 false 时不加。
 *
 * @param {Object} config
 * @param {'warn' | 'error' | false} mode
 */
function applyCircularDependencyCheck(config, mode) {
    if (mode === false) {
        return;
    }
    // 生成新数组：合并后的多份 renderer 配置可能共用同一个 plugins 数组
    config.plugins = [...(config.plugins || []), new CircularDependencyPlugin({ mode })];
}

module.exports = {
    CircularDependencyPlugin,
    applyCircularDependencyCheck,
    resolveCircularDependencyMode,
    findCycles,
};
