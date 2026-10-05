# 实际安装版本仍有签名冲突

用户通过 Windows adb install -r 获取明确错误 INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package com.forcefocus.app signatures do not match newer version。

随后 adb pull 得到实际安装 APK。静态 Manifest package=com.forcefocus.app、versionCode=29、versionName=0.2.27-home。META-INF/FORCEFOC.RSA 证书 SHA256=27b6c4ecdcef607328a6e575dee7cbe89ff0233198361140db4f86d8c0a3197c，subject CN=ForceFocus,O=ForceFocus,C=CN。

已核对现有备份：forcefocus-guidebook.p12 为 fc56a1cb...；0.2.17 corrected、0.2.18、0.2.19、0.2.20 工程ZIP的 forcefocus-release.p12 都为 d268ef6d4d4e41aba6cc7e1f44292d977e20c7bdb3ae9ac98409eaca3577986b；0.2.26 source ZIP、regular_home ZIP无密钥。当前已检索到的密钥均不能匹配实际安装版本。

之前 recovered-original 签名包仅匹配用户最初上传的0.2.26，不能覆盖手机当前0.2.27。必须以实际安装签名为准，禁止宣称安装问题已解决。

实际 APK Manifest 无 debuggable=true，allowBackup=true。下一步探测 adb run-as 是否可导出持久数据；未确认数据完整备份前保留旧应用。实际安装、无障碍、日志和白名单验收仍未完成。不要将更改包名作为正式解决方式。
