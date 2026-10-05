package com.forcefocus.app;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

final class AppCandidatePolicy {
    private static final Set<String> PACKAGES = new HashSet<>(Arrays.asList(
"com.tencent.mobileqq","com.android.vending","com.ucmobile","com.ss.android.ugc.aweme","com.eg.android.alipaygphone","com.taobao.taobao","com.jingdong.app.mall","com.xunmeng.pinduoduo","com.sankuai.meituan","com.sankuai.meituan.takeoutnew","com.autonavi.minimap","com.baidu.baidumap","com.MobileTicket","com.unionpay","com.unionpay.tsmservice","com.cmbchina.ccd.pluto.cmbActivity","cmb.pb","com.icbc","com.chinamworld.main","com.greenpoint.android.mc10086.activity","com.miui.weather2","com.android.contacts","com.android.calendar","com.android.browser","com.vivo.browser","com.vivo.weather","com.vivo.contacts","com.vivo.appstore","com.vivo.easyshare","com.vivo.smartmultiwindow","com.boohee.one"
));
    private static final Set<String> LABELS = new HashSet<>(Arrays.asList("biubiu加速器","keep","play商店","qq","uc浏览器","vivo官网","vivo健康","vivo摄影","一淘","一键锁屏","中国工商银行","中国建设银行","中国移动","中国移动云盘","主题","云·星穹铁道","云闪付","互传","京东","代号鸢","使用技巧","免费电子书","同程旅行","同城旅行","咪咕视频","天气","天猫","完美校园","对讲机","崩坏：星穹铁道","应用商店","意见反馈","手机管家","抖音","招商银行","拼多多","指南针","携程旅行","支付宝","新世界狂欢","日历","智慧生活","智能遥控","江西农商","浏览器","淘宝","百度地图","河马","米游社","绝区零","美团","美团外卖","联系人","蓝心小v","薄荷健康","解压专家","钱包","铁路12306","闲鱼","高德地图","鲨鱼记账"));
    static boolean isExcluded(String packageName, String label) {
        String pkg = packageName == null ? "" : packageName.toLowerCase(Locale.ROOT);
        for (String value : PACKAGES) if (value.toLowerCase(Locale.ROOT).equals(pkg)) return true;
        return LABELS.contains(label == null ? "" : label.replaceAll("\\s+", "").toLowerCase(Locale.ROOT));
    }
}
