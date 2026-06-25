module.exports = (ctx) => ({
    web: {
        entry: 'src/renderer/index.js',
        plugins: [],
        devServer: { port: 9876 },
    },
});
