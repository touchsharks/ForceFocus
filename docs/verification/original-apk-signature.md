# 原版 APK 安装冲突核对

用户上传 ForceFocus-0.2.26-home.apk 后，从 META-INF/FORCEFOC.RSA 的 PKCS#7 证书读取：

- Subject: CN=ForceFocus,O=ForceFocus,C=CN
- 原版证书 SHA-256: fc56a1cbdeed6729667358a436d4cc8d470a7d6b3d6b36a05dd79efab1789306
- 已交付 Gradle debug APK 证书 SHA-256: 48d99744e7ec697048b1fcab4161524d3bf9c0244fdb6c124c894de32831addd

两个签名证书不同；当前测试包不能作为原版的同签名覆盖更新。这里读取的是原版 v1 签名证书，不等同于完整 apksigner 验签或手机安装错误日志。

当前 GitHub main 文件树没有原版 .jks/.keystore 私钥文件，上传 APK 也不能恢复签名私钥。下一步寻找旧构建环境的 ForceFocus 签名密钥并核对证书。保持 applicationId=com.forcefocus.app；未授权改包名或卸载旧版。先保留旧版数据，实机无障碍测试仍未完成。
