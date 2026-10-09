package com.forcefocus.app;

import java.util.Set;

public final class FocusWindowPolicyTest {
    private static final String OWN = "com.forcefocus.app";
    private static final Set<String> TASK_A = Set.of("test.notes");
    private static final Set<String> IMES = Set.of("test.keyboard");
    private static int checks;

    private static void check(String expected, boolean state, boolean gone,
                              String pkg, String cls, boolean escape, Set<String> task) {
        String actual = FocusWindowPolicy.decide(state, gone, pkg, cls, OWN, escape, task, IMES);
        if (!expected.equals(actual)) throw new AssertionError(expected + " != " + actual);
        checks++;
    }

    public static void main(String[] args) {
        check("allow-current-task", true, false, "test.notes", "SearchActivity", false, TASK_A);
        check("allow-keyboard-window", true, false, "test.keyboard", "android.inputmethodservice.SoftInputWindow", false, TASK_A);
        check("block-not-in-current-task", true, false, "test.keyboard", "SettingsActivity", false, TASK_A);
        check("block-not-in-current-task", true, false, "test.other", "android.inputmethodservice.SoftInputWindow", false, TASK_A);
        check("ignore-window-metadata", false, false, "test.other", "", false, TASK_A);
        check("ignore-pane-disappeared", true, true, "test.other", "", false, TASK_A);
        check("block-not-in-current-task", true, false, "test.other", "MainActivity", false, TASK_A);
        check("allow-self", true, false, OWN, "MainActivity", false, TASK_A);
        check("allow-system-escape", true, false, "test.settings", "UninstallActivity", true, TASK_A);
        // Switching tasks does not merge the previous task's whitelist.
        check("block-not-in-current-task", true, false, "test.notes", "SearchActivity", false, Set.of("test.reader"));
        check("ignore-no-package", true, false, "", "", false, TASK_A);
        System.out.println("FocusWindowPolicy: " + checks + " checks passed");
    }
}
