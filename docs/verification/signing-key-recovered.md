# 原版签名密钥恢复成功

已从保存文件中取回 forcefocus-guidebook.p12（library_file_id: libfile_9ae43181e1248191b65acb01eabb7e34）。通过 PKCS12 读取验证私钥存在，其证书 SHA256 为 fc56a1cbdeed6729667358a436d4cc8d470a7d6b3d6b36a05dd79efab1789306，与用户上传的 ForceFocus-0.2.26-home.apk v1 证书一致。密钥和密码不提交 Git。

对已经 Gradle 编译完成的 0.3.0 APK 使用官方 com.android.tools.build:apksig:8.7.3 重新签名。不是替换旧 APK assets；输入是标准 Gradle 新编译产物。ApkVerifier 验证 v1/v2/v3 全通过、错误为空。246 assets、DEX、Manifest 与原 Gradle debug 构建字节一致。

输出 ForceFocus-0.3.0-home-original-signature.apk，SHA256: 6bab6481863682278d5f3fdd11b425195a24cdb1c1065cb5d96161ac73c6982e。

下一步用户直接覆盖安装，保留旧版数据；实际安装结果以及无障碍开关、FF_A11Y 日志、白名单/非白名单行为仍需手机验证，尚未宣称完成实机验收。
