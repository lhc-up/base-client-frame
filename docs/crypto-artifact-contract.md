# 加密构建产物契约

本文档属于 `@base-client/frame`，只定义 frame 生成加密产物时的稳定格式和构建行为。运行时解密由使用方实现；frame 不依赖 toolkit，也不要求使用方导入 frame 内部源码。

## 格式

| 项 | 契约 |
|---|---|
| 算法 | AES-256-CBC |
| padding | Node.js crypto 默认 PKCS#7 |
| key | `build/encrypt.key` 去掉一个末尾换行后，必须恰好是 32 个 ASCII 字节 |
| IV | 默认取 key 的前 16 个字节；兼容既有产物时可由 `bc.config.js` 的 `encrypt.iv` 显式提供 16 个 ASCII 字节 |
| 输入/输出 | 文件原始 Buffer -> 密文 Buffer；无额外 header、salt 或 base64 |
| 文件范围 | `app/` 下除 `main/` 外所有目录中的 `**/*.js`；HTML、CSS、图片和 descriptor 保持明文 |
| descriptor | `package.json` 只记录 `encrypted: true/false`，禁止写入 key |

当前格式是为了兼容既有业务构建链，不代表推荐的新密码学协议。固定 IV 不提供语义安全；若未来设计新格式，应版本化 descriptor 并保留旧格式读取能力，不能原地改变密文含义。

`encrypt: { iv }` 只改变本次构建使用的 IV，不会把 IV 或 key 写入 asax/child descriptor。运行时必须通过自身既有契约知道对应 IV。省略 `iv` 时继续使用 key 前 16 字节，保证现有使用方和固定向量不变。

## 固定兼容向量

```text
key (ASCII): 0123456789abcdef0123456789abcdef
plaintext UTF-8: base-client-stage5-vector\n
ciphertext hex: 505bcd2871a6fde9daaea46d1738706727b0d2b74325e8548efdb193112eddf6
```

frame 构建端和 consumer runtime 必须各自在所属仓库用该向量测试。consumer 不得依赖 `src/pack/crypto/aes-256-cbc.js`，避免把 frame 的内部模块变成运行时公共 API。

## 代码边界

- `src/pack/crypto/aes-256-cbc.js`：纯 Buffer codec，可在未来独立抽包时整体迁移。
- `src/pack/encrypt.js`：frame 专属配置读取、文件选择和目录遍历。
- CLI `pack`/`child`：决定构建时机和产物编排。

只有 codec 格式在多个独立使用方稳定后，才讨论抽取独立 crypto npm 包；在此之前不增加 frame/toolkit 之间的依赖。
