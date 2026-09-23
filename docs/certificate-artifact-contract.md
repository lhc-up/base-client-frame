# 证书文件契约

## 目录约定

业务项目的签名证书直接放在项目根目录的 `build/` 下。例如：

```text
business-project/
├─ build/
│  └─ cert.pfx
├─ bc.config.js
└─ electron-builder.config.js
```

`build/` 是业务项目的证书归属目录。frame 不创建证书、不猜测文件名，也不扫描目录寻找证书。

## 配置方式

由业务项目在 `electron-builder.config.js` 中显式配置路径：

```js
module.exports = ({ cliOptions }) => ({
    win: {
        certificateFile: cliOptions.sign ? 'build/cert.pfx' : undefined,
    },
});
```

- `certificateFile` 的路径由 electron-builder 按业务项目根目录解析。
- 证书文件名和证书类型由业务自行决定，例如 `.pfx`、`.p12`。
- 未传 `--sign` 时，业务配置应保持签名证书字段为空或关闭。
- frame 只负责合并并透传业务的 electron-builder 配置，不负责读取、复制、校验或打印证书内容。
- 证书密码通过业务自己的安全配置提供，不写入仓库、构建产物或日志。
