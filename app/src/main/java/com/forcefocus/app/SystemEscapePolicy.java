package com.forcefocus.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** System permission, app management and uninstall controls always remain reachable. */
final class SystemEscapePolicy {
    private final Set<String> packages = new HashSet<>(Arrays.asList(
            "android", "com.android.systemui", "com.android.settings",
            "com.android.packageinstaller", "com.google.android.packageinstaller",
            "com.android.permissioncontroller", "com.google.android.permissioncontroller",
            "com.android.intentresolver", "com.vivo.permissionmanager",
            "com.vivo.safecenter", "com.iqoo.secure"));
    private final String ownLabel;

    SystemEscapePolicy(Context context) {
        ownLabel = context.getApplicationInfo().loadLabel(context.getPackageManager()).toString();
        Uri ownPackage = Uri.parse("package:" + context.getPackageName());
        addSystemHandler(context, new Intent(Intent.ACTION_DELETE, ownPackage));
        addSystemHandler(context, new Intent(Intent.ACTION_UNINSTALL_PACKAGE, ownPackage));
        addSystemHandler(context, new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, ownPackage));
        addSystemHandler(context, new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
        // Home is an intentional escape route; OEM uninstall dialogs can be hosted by the launcher.
        try {
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            for (ResolveInfo resolved : context.getPackageManager().queryIntentActivities(home, PackageManager.MATCH_DEFAULT_ONLY)) {
                if (resolved.activityInfo != null) packages.add(resolved.activityInfo.packageName);
            }
        } catch (RuntimeException ignored) { /* Built-in system escape packages remain allowed. */ }
    }

    private void addSystemHandler(Context context, Intent intent) {
        ResolveInfo resolved;
        try { resolved = context.getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY); }
        catch (RuntimeException ignored) { return; }
        if (resolved == null || resolved.activityInfo == null) return;
        ApplicationInfo application = resolved.activityInfo.applicationInfo;
        if (application != null && (application.flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0) {
            packages.add(resolved.activityInfo.packageName);
        }
    }

    boolean allows(String packageName, AccessibilityEvent event) {
        if (packages.contains(packageName)) return true;
        // OEM launchers may host their own uninstall confirmation window.
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return false;
        String text = event.getText().toString().toLowerCase(Locale.ROOT);
        return text.contains(ownLabel.toLowerCase(Locale.ROOT))
                && (text.contains("卸载") || text.contains("uninstall"));
    }
}
