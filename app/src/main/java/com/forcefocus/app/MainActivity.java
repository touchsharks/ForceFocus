package com.forcefocus.app;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String TAG = "ForceFocus";
    private static final String ENTRY = "file:///android_asset/ForceFocus_v16.html";

    private FrameLayout root;
    private WebView webView;
    private View statusOverlay;
    private View navigationOverlay;
    private int statusInset;
    private int navigationInset;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWindow();
        buildContent();
        setContentView(root);
        installInsets();
        webView.loadUrl(ENTRY);
    }

    private void configureWindow() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
        } else {
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                            | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
    }

    private void buildContent() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(255, 253, 228));

        ImageView background = new ImageView(this);
        background.setScaleType(ImageView.ScaleType.FIT_START);
        background.setImageBitmap(loadBitmap("ui/home-paper-background.png"));
        root.addView(background, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.TRANSPARENT);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setTextZoom(100);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pushMetrics();
                view.evaluateJavascript("window.ForceFocusData&&window.ForceFocusData.initializeNativeHistory&&window.ForceFocusData.initializeNativeHistory(false);", null);
            }
        });
        webView.addJavascriptInterface(new NativeBridge(this, webView), "NativeBridge");
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        statusOverlay = new View(this);
        navigationOverlay = new View(this);
        statusOverlay.setVisibility(View.GONE);
        navigationOverlay.setVisibility(View.GONE);
        root.addView(statusOverlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, Gravity.TOP));
        root.addView(navigationOverlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, Gravity.BOTTOM));
    }

    private void installInsets() {
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets system = insets.getInsets(WindowInsets.Type.systemBars());
                statusInset = system.top;
                navigationInset = system.bottom;
            } else {
                statusInset = insets.getSystemWindowInsetTop();
                navigationInset = insets.getSystemWindowInsetBottom();
            }
            FrameLayout.LayoutParams webParams = (FrameLayout.LayoutParams) webView.getLayoutParams();
            webParams.topMargin = statusInset;
            webParams.bottomMargin = navigationInset;
            webView.setLayoutParams(webParams);

            FrameLayout.LayoutParams top = (FrameLayout.LayoutParams) statusOverlay.getLayoutParams();
            top.height = statusInset;
            top.gravity = Gravity.TOP;
            statusOverlay.setLayoutParams(top);
            FrameLayout.LayoutParams bottom = (FrameLayout.LayoutParams) navigationOverlay.getLayoutParams();
            bottom.height = navigationInset;
            bottom.gravity = Gravity.BOTTOM;
            navigationOverlay.setLayoutParams(bottom);
            pushMetrics();
            return insets;
        });
        root.requestApplyInsets();
    }

    private Bitmap loadBitmap(String asset) {
        try (InputStream input = getAssets().open(asset)) {
            return BitmapFactory.decodeStream(input);
        } catch (IOException exception) {
            Log.e(TAG, "Missing asset " + asset, exception);
            return null;
        }
    }

    void setSidebarSystemBarsVisible(boolean visible) {
        runOnUiThread(() -> {
            if (visible) {
                Bitmap sidebar = loadBitmap("sidebar/侧边栏背景图.png");
                SidebarSplitDrawable drawable = new SidebarSplitDrawable(sidebar);
                statusOverlay.setBackground(drawable);
                navigationOverlay.setBackground(new SidebarSplitDrawable(sidebar));
            }
            statusOverlay.setVisibility(visible ? View.VISIBLE : View.GONE);
            navigationOverlay.setVisibility(visible ? View.VISIBLE : View.GONE);
        });
    }

    private void pushMetrics() {
        if (webView == null) return;
        int width = root == null ? 0 : root.getWidth();
        int height = root == null ? 0 : root.getHeight();
        float density = getResources().getDisplayMetrics().density;
        String script = String.format(Locale.US,
                "window.setForceFocusMetrics&&window.setForceFocusMetrics({fullWidthPx:%d,fullHeightPx:%d,density:%f,statusInsetPx:%d,navigationInsetPx:%d});",
                width, height, density, statusInset, navigationInset);
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.post(() -> webView.evaluateJavascript(
                "window.ForceFocusData&&window.ForceFocusData.onHostResume&&window.ForceFocusData.onHostResume();"
                        + "window.ForceFocusFocus&&window.ForceFocusFocus.onHostResume&&window.ForceFocusFocus.onHostResume();", null));
    }

    @Override
    public void onBackPressed() {
        if (new AppStateRepository(this).isFocusActive()) {
            if (webView != null) webView.evaluateJavascript("window.ForceFocusFocus&&window.ForceFocusFocus.onHostResume&&window.ForceFocusFocus.onHostResume();", null);
            return;
        }
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript("(function(){try{return !!(window.ForceFocusBack&&window.ForceFocusBack())}catch(e){return false}})()", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }
}
