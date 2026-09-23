# 加密构建产物契约

本文档定义 `@base-client/frame` 的加密构建输入、产物范围和运行时兼容约束。

## 构建配置

在业务项目的 `bc.config.js` 中配置：

```js
module.exports = () => ({
    encrypt: {
        key: '0123456789abcdef0123456789abcdef',
        iv: 'fedcba9876543210', // 可选；省略时使用 key 前 16 字节
    },
});
```

- `encrypt.key` 是唯一的 key 来源。启用加密时必须提供，去掉末尾换行后必须是恰好 32 个 ASCII 字节。
- 不读取 `build/encrypt.key`，也不读取环境变量。`encrypt: false` 才是显式关闭加密。
- `encrypt.iv` 可选，必须是 16 个 ASCII 字节；省略时沿用兼容行为，使用 key 的前 16 字节。
- key 和 IV 不写入 asax、child descriptor、`__BC_BUILD__` 或普通构建日志。

## 算法与文件范围

- 算法：AES-256-CBC，Node.js crypto 默认 PKCS#7 padding。
- 输入/输出：原始文件 Buffer → 密文 Buffer，不添加 header、salt 或 base64。
- `app/` 下除 `main/` 外的所有 `**/*.js` 会被加密；HTML、CSS、图片和 descriptor 保持明文。
- `package.json` descriptor 只记录 `encrypted: true/false`，禁止写入 key。

## 兼容向量

```text
key (ASCII): 0123456789abcdef0123456789abcdef
plaintext UTF-8: base-client-stage5-vector\n
ciphertext hex: 505bcd2871a6fde9daaea46d1738706727b0d2b74325e8548efdb193112eddf6
```

运行时解密由业务 consumer 自己实现；不要依赖 frame 的内部加密模块作为运行时公共 API。
