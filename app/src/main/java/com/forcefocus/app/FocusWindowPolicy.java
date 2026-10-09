package com.forcefocus.app;

import java.util.Set;

/** Decisions about window events, independent of Activity/WebView and Android APIs. */
final class FocusWindowPolicy {
    static String decide(boolean windowStateChanged, boolean paneDisappeared,
                         String packageName, String className, String ownPackage,
                         boolean systemEscape, Set<String> whitelist, Set<String> enabledImePackages) {
        if (!windowStateChanged) return "ignore-window-metadata";
        if (paneDisappeared) return "ignore-pane-disappeared";
        if (packageName == null || packageName.isEmpty()) return "ignore-no-package";
        if (ownPackage.equals(packageName)) return "allow-self";
        if (systemEscape) return "allow-system-escape";
        if (whitelist.contains(packageName)) return "allow-current-task";
        // Only the actual keyboard window is exempt. The keyboard app's other Activities
        // remain subject to the current task whitelist, as do other apps spoofing this class.
        if ("android.inputmethodservice.SoftInputWindow".equals(className)
                && enabledImePackages.contains(packageName)) return "allow-keyboard-window";
        return "block-not-in-current-task";
    }
}
