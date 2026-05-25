import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);
const builtinModules = require('module').builtinModules;

/**
 * Rollup configuration for framework bundling
 * - CLI: Single bundle output
 * - Framework: Main bundle + preload independent output
 */

const frameworkExternal = [
    'electron',
    ...builtinModules,
    ...builtinModules.map(m => `node:${m}`),
    'lodash'
];

/** @type {import('rollup').RollupOptions[]} */
export default [
    // CLI: Single bundle output
    {
        input: 'src/cli/index.js',
        output: {
            dir: 'dist/cli',
            format: 'cjs',
            entryFileNames: 'index.js',
            exports: 'auto'
        },
        external: frameworkExternal,
        plugins: [
            commonjs({
                ignoreDynamicRequires: true
            }),
            json()
        ]
    },
    // Framework: Main bundle (except preload) + preload independent
    {
        input: {
            'index': 'src/index.js',
            'preload': 'src/preload/index.js'
        },
        output: {
            dir: 'dist',
            format: 'cjs',
            entryFileNames: '[name].js',
            chunkFileNames: '[name]-[hash].js'
        },
        external: frameworkExternal,
        plugins: [
            nodeResolve(),
            commonjs({
                ignoreDynamicRequires: true
            }),
            json()
        ]
    }
];