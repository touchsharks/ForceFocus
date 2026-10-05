"use strict";

(() => {
    const RECORDS_KEY = "forcefocus_focus_records_v2";
    const LEGACY_RECORDS_KEYS = Object.freeze([
        "forcefocus_focus_records_v1",
        "forcefocus_records"
    ]);
    const HOME_EVENTS_KEY = "forcefocus_home_idle_events_v1";
    const HOME_TRACKING_STARTED_KEY = "forcefocus_home_tracking_started_at";
    const FFTI_AWARDS_KEY = "forcefocus_ffti_awards_v1";
    const FFTI_SETTLED_KEY = "forcefocus_ffti_settled_v1";
    const FFTI_HISTORY_KEY = "forcefocus_ffti_history_v1";
    const FFTI_SELECTED_KEY = "forcefocus_ffti_selected_v1";
    const RULES_PATH = "ffti/ffti-rules.json";
    const HOME_IDLE_MS = 5 * 60 * 1000;
    const TASK_IDS = Object.freeze({
        "简历": "resume",
        "岗位调研": "job_research",
        "考公": "civil_service",
        "磨耳朵": "listening"
    });

    function taskIdForName(name) {
        if (TASK_IDS[name]) return TASK_IDS[name];
        if (window.ForceFocusSidebar && typeof window.ForceFocusSidebar.getWorkItemByName === "function") {
            const item = window.ForceFocusSidebar.getWorkItemByName(name);
            if (item && item.id) return item.id;
        }
        return null;
    }

    let rulesPayload = null;
    let homeInterval = null;
    let homeTimer = 0;
    let nativeMirrorReady = false;
    let backupPromptScheduled = false;

    function pad2(value) { return value < 10 ? `0${value}` : String(value); }
    function localDateKey(value = Date.now()) {
        const date = value instanceof Date ? value : new Date(Number(value));
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }
    function parseLocalDateKey(key) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
        if (!match) return null;
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
    }
    function addLocalDays(key, delta) {
        const date = parseLocalDateKey(key);
        if (!date) return null;
        date.setDate(date.getDate() + delta);
        return localDateKey(date);
    }
    function readJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value == null ? fallback : value;
        } catch (_error) {
            return fallback;
        }
    }
    function writeJson(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); }
        catch (_error) { /* Storage failure must not break focus completion. */ }
    }
    function finiteNumber(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function validLocalDateKey(value) {
        return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
    }

    function normalizeRecord(value) {
        if (!value || typeof value !== "object") return null;
        const startedAt = finiteNumber(value.startedAt != null ? value.startedAt : value.startTimestamp, NaN);
        const endedAt = finiteNumber(value.endedAt != null ? value.endedAt : value.endTimestamp, NaN);
        const actualSeconds = Math.max(0, Math.round(finiteNumber(
            value.actualFocusedSeconds != null ? value.actualFocusedSeconds
                : value.actualSeconds != null ? value.actualSeconds
                : value.focusSeconds != null ? value.focusSeconds
                    : finiteNumber(value.actualFocusedMinutes) * 60,
            0
        )));
        const task = String(value.taskName || value.task || "");
        const taskId = String(value.taskId || taskIdForName(task) || "");
        if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt || !taskId) return null;
        const dateKey = validLocalDateKey(value.localDate)
            ? String(value.localDate)
            : localDateKey(endedAt || startedAt);
        const id = String(value.sessionId || value.id || `${Math.round(startedAt)}-${taskId}`);
        return {
            id,
            sessionId: id,
            taskId,
            task,
            taskName: task,
            plannedMinutes: Math.max(0, finiteNumber(value.plannedMinutes != null
                ? value.plannedMinutes : value.totalMinutes)),
            startedAt: Math.round(startedAt),
            startTime: Math.round(startedAt),
            endedAt: Math.round(endedAt),
            endTime: Math.round(endedAt),
            actualSeconds,
            actualFocusedSeconds: actualSeconds,
            actualFocusedMinutes: actualSeconds / 60,
            localDate: dateKey,
            endReason: String(value.endReason || value.reason || "unknown"),
            whitelistClickCount: value.whitelistClickCount == null
                ? null
                : Math.max(0, Math.round(finiteNumber(value.whitelistClickCount)))
        };
    }

    function getRecords() {
        const merged = new Map();
        const sourceKeys = nativeMirrorReady ? [RECORDS_KEY] : [RECORDS_KEY, ...LEGACY_RECORDS_KEYS];
        sourceKeys.forEach(key => {
            const values = readJson(key, []);
            if (!Array.isArray(values)) return;
            values.forEach(value => {
                const record = normalizeRecord(value);
                if (record) merged.set(record.id, record);
            });
        });
        const records = Array.from(merged.values())
            .sort((left, right) => finiteNumber(left.startedAt) - finiteNumber(right.startedAt));
        const primary = readJson(RECORDS_KEY, []);
        if (!Array.isArray(primary) || JSON.stringify(primary) !== JSON.stringify(records)) saveRecords(records);
        return records;
    }

    function saveRecords(records) {
        records.sort((left, right) => finiteNumber(left.startedAt) - finiteNumber(right.startedAt));
        writeJson(RECORDS_KEY, records);
    }

    function completeFocusSession(value) {
        const startedAt = finiteNumber(value && value.startedAt, NaN);
        const endedAt = finiteNumber(value && value.endedAt, NaN);
        const actualSeconds = Math.max(0, Math.round(finiteNumber(value && value.actualSeconds)));
        const plannedMinutes = Math.max(0, finiteNumber(value && value.plannedMinutes));
        const task = String(value && value.task || "");
        const taskId = String(value && value.taskId || taskIdForName(task) || "");
        if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt || !taskId) return null;
        const localDate = validLocalDateKey(value && value.localDate)
            ? String(value.localDate)
            : localDateKey(endedAt || startedAt);
        const id = String(value && (value.sessionId || value.id) || `${Math.round(startedAt)}-${taskId}`);
        const record = {
            id,
            sessionId: id,
            taskId,
            task,
            taskName: task,
            plannedMinutes,
            startedAt: Math.round(startedAt),
            startTime: Math.round(startedAt),
            endedAt: Math.round(endedAt),
            endTime: Math.round(endedAt),
            actualSeconds,
            actualFocusedSeconds: actualSeconds,
            actualFocusedMinutes: actualSeconds / 60,
            localDate,
            endReason: String(value.endReason || "unknown"),
            whitelistClickCount: Math.max(0, Math.round(finiteNumber(value.whitelistClickCount)))
        };
        const records = getRecords();
        const existingIndex = records.findIndex(item => item.id === record.id);
        if (existingIndex >= 0) records[existingIndex] = record;
        else records.push(record);
        saveRecords(records);
        if (!localStorage.getItem(HOME_TRACKING_STARTED_KEY)) {
            localStorage.setItem(HOME_TRACKING_STARTED_KEY, String(record.startedAt));
        }
        return record;
    }

    function importFocusRecords(values) {
        if (!Array.isArray(values)) return 0;
        const records = getRecords();
        const merged = new Map(records.map(record => [record.id, record]));
        let imported = 0;
        values.forEach(value => {
            const record = normalizeRecord(value);
            if (!record) return;
            if (!merged.has(record.id)) imported += 1;
            merged.set(record.id, record);
        });
        saveRecords(Array.from(merged.values()));
        return imported;
    }

    function replaceFocusRecords(values) {
        const normalized = Array.isArray(values)
            ? values.map(normalizeRecord).filter(Boolean)
            : [];
        const unique = new Map();
        normalized.forEach(record => unique.set(record.id, record));
        const records = Array.from(unique.values())
            .sort((left, right) => finiteNumber(left.startedAt) - finiteNumber(right.startedAt))
            .slice(-1000);
        const before = JSON.stringify(readJson(RECORDS_KEY, []));
        saveRecords(records);
        nativeMirrorReady = true;
        return { records, changed: before !== JSON.stringify(records) };
    }

    function syncNativeRecords() {
        const bridge = window.NativeBridge;
        if (!bridge || typeof bridge.getFocusRecords !== "function") {
            return { records: getRecords(), changed: false, native: false };
        }
        try {
            const localBefore = getRecords();
            let nativeRecords = JSON.parse(bridge.getFocusRecords());
            if (!Array.isArray(nativeRecords)) nativeRecords = [];
            if (nativeRecords.length === 0 && !nativeMirrorReady && localBefore.length > 0
                    && typeof bridge.importFocusRecordsToNative === "function") {
                bridge.importFocusRecordsToNative(JSON.stringify(localBefore));
                nativeRecords = JSON.parse(bridge.getFocusRecords());
                if (!Array.isArray(nativeRecords)) nativeRecords = [];
            }
            const result = replaceFocusRecords(nativeRecords);
            return { records: result.records, changed: result.changed, native: true };
        } catch (_error) {
            return { records: getRecords(), changed: false, native: false };
        }
    }

    function initializeNativeHistory(allowPrompt) {
        const bridge = window.NativeBridge;
        if (!bridge) return;
        let status = null;
        try {
            if (typeof bridge.initializeFocusHistory === "function") {
                status = JSON.parse(bridge.initializeFocusHistory());
            }
        } catch (_error) { status = null; }
        const synced = syncNativeRecords();
        if (synced.changed) {
            window.dispatchEvent(new CustomEvent("forcefocus:records-changed", { detail: { restored: true } }));
        }
        if (!allowPrompt || !status || status.status !== "needs_authorization"
                || typeof bridge.requestFocusHistoryBackupAccess !== "function" || backupPromptScheduled) return;
        backupPromptScheduled = true;
        window.setTimeout(() => {
            const home = document.querySelector("#home");
            if (document.hidden || (home && home.classList.contains("focus-clock-active"))) {
                backupPromptScheduled = false;
                return;
            }
            try { bridge.requestFocusHistoryBackupAccess(); }
            catch (_error) { backupPromptScheduled = false; }
        }, 800);
    }

    function recordsForDate(dateKey, records = getRecords()) {
        return records
            .filter(record => (record.localDate || localDateKey(record.endedAt || record.startedAt)) === dateKey)
            .sort((left, right) => finiteNumber(left.startedAt) - finiteNumber(right.startedAt));
    }

    function getCalendarFocusMinutes(monthKey, throughDateKey = addLocalDays(localDateKey(), -1)) {
        const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey));
        if (!match) return {};
        const prefix = `${match[1]}-${match[2]}-`;
        const secondsByDay = {};
        for (const record of getRecords()) {
            const key = record.localDate || localDateKey(record.endedAt || record.startedAt);
            if (!key.startsWith(prefix) || (throughDateKey && key > throughDateKey)) continue;
            const day = Number(key.slice(-2));
            secondsByDay[day] = (secondsByDay[day] || 0) + Math.max(0, finiteNumber(record.actualSeconds));
        }
        const result = {};
        Object.keys(secondsByDay).forEach(day => { result[day] = Math.round(secondsByDay[day] / 60); });
        return result;
    }

    function recordSignatureForDate(dateKey, records = getRecords()) {
        return recordsForDate(dateKey, records)
            .map(record => [
                record.id,
                finiteNumber(record.startedAt),
                finiteNumber(record.endedAt),
                finiteNumber(record.actualSeconds),
                record.whitelistClickCount == null ? "unknown" : finiteNumber(record.whitelistClickCount),
                record.endReason || ""
            ].join(":"))
            .join("|");
    }

    function getHomeEvents() {
        const values = readJson(HOME_EVENTS_KEY, []);
        return Array.isArray(values) ? values : [];
    }

    function recordHomeIdle(interval) {
        if (!interval || interval.recorded) return;
        interval.recorded = true;
        const events = getHomeEvents();
        events.push({
            id: `${Math.round(interval.startedAt)}-home-idle`,
            dateKey: localDateKey(interval.startedAt),
            startedAt: interval.startedAt,
            reachedAt: interval.startedAt + HOME_IDLE_MS
        });
        writeJson(HOME_EVENTS_KEY, events.slice(-366));
    }

    function beginHomeVisible() {
        if (homeInterval || document.hidden) return;
        const startedAt = Date.now();
        homeInterval = { startedAt, recorded: false };
        if (!localStorage.getItem(HOME_TRACKING_STARTED_KEY)) {
            localStorage.setItem(HOME_TRACKING_STARTED_KEY, String(startedAt));
        }
        window.clearTimeout(homeTimer);
        homeTimer = window.setTimeout(() => {
            if (homeInterval && homeInterval.startedAt === startedAt) recordHomeIdle(homeInterval);
        }, HOME_IDLE_MS);
    }

    function endHomeVisible() {
        if (!homeInterval) return;
        window.clearTimeout(homeTimer);
        homeTimer = 0;
        if (!homeInterval.recorded && Date.now() - homeInterval.startedAt >= HOME_IDLE_MS) {
            recordHomeIdle(homeInterval);
        }
        homeInterval = null;
    }

    function dayHasFocus(key, records) {
        return records.some(record => (record.localDate || localDateKey(record.endedAt || record.startedAt)) === key && finiteNumber(record.actualSeconds) > 0);
    }

    function consecutiveFocusDays(dateKey, records) {
        let count = 0;
        let cursor = dateKey;
        while (cursor && dayHasFocus(cursor, records)) {
            count += 1;
            cursor = addLocalDays(cursor, -1);
        }
        return count;
    }

    function consecutiveAbsentDays(dateKey, records, trackingStartedAt) {
        if (!trackingStartedAt || dayHasFocus(dateKey, records)) return 0;
        const firstTrackedKey = localDateKey(trackingStartedAt);
        let count = 0;
        let cursor = dateKey;
        while (cursor && cursor >= firstTrackedKey && !dayHasFocus(cursor, records)) {
            count += 1;
            cursor = addLocalDays(cursor, -1);
        }
        return count;
    }

    function buildMetrics(dateKey, sourceRecords = getRecords()) {
        const sessions = recordsForDate(dateKey, sourceRecords);
        const durations = sessions.map(record => Math.max(0, finiteNumber(record.actualSeconds)));
        const dailyFocusSeconds = durations.reduce((total, value) => total + value, 0);
        const sessionCount = sessions.length;
        const latest = sessionCount ? sessions[sessionCount - 1] : null;
        const whitelistKnown = sessionCount > 0 && sessions.every(record => Number.isFinite(Number(record.whitelistClickCount)));
        const earlyEndCount = sessions.filter(record => record.endReason === "branch").length;
        const taskSequence = sessions.map(record => record.taskId || taskIdForName(record.task) || null).filter(Boolean);
        let taskSwitchCount = 0;
        for (let index = 1; index < taskSequence.length; index += 1) {
            if (taskSequence[index] !== taskSequence[index - 1]) taskSwitchCount += 1;
        }
        const taskDurationByName = {};
        sessions.forEach(record => {
            taskDurationByName[record.taskId] = (taskDurationByName[record.taskId] || 0) + finiteNumber(record.actualSeconds);
        });
        const startTimes = sessions.map(record => {
            const date = new Date(record.startedAt);
            return { timestamp: record.startedAt, hour: date.getHours(), minute: date.getMinutes() };
        });
        const focusTimeDistribution = new Array(24).fill(0);
        sessions.forEach(record => {
            const hour = new Date(record.startedAt).getHours();
            focusTimeDistribution[hour] += finiteNumber(record.actualSeconds);
        });
        const trackingStartedAt = finiteNumber(localStorage.getItem(HOME_TRACKING_STARTED_KEY), 0)
            || (sourceRecords.length ? Math.min(...sourceRecords.map(record => finiteNumber(record.startedAt, Infinity))) : 0);
        const homeIdleEventCount = getHomeEvents().filter(event => event.dateKey === dateKey).length;
        return {
            dateKey,
            sessions,
            dailyFocusSeconds,
            dailyFocusMinutes: dailyFocusSeconds / 60,
            sessionCount,
            latestSessionDuration: latest ? finiteNumber(latest.actualSeconds) : null,
            longestSessionDuration: sessionCount ? Math.max(...durations) : null,
            averageSessionDuration: sessionCount ? dailyFocusSeconds / sessionCount : null,
            startTimes,
            focusTimeDistribution,
            earlyEndCount,
            earlyEndRate: sessionCount ? earlyEndCount / sessionCount : null,
            taskSequence,
            taskSwitchCount: sessionCount ? taskSwitchCount : null,
            taskDurationByName,
            uniqueTaskCount: new Set(taskSequence).size,
            consecutiveFocusDays: consecutiveFocusDays(dateKey, sourceRecords),
            consecutiveAbsentDays: consecutiveAbsentDays(dateKey, sourceRecords, trackingStartedAt),
            latestWhitelistClickCount: whitelistKnown ? Number(latest.whitelistClickCount) : null,
            dailyWhitelistClickCount: whitelistKnown
                ? sessions.reduce((total, record) => total + Number(record.whitelistClickCount), 0)
                : null,
            phoneInteractionCount: null,
            weekendSlots: null,
            perfectStreak: null,
            homeIdleEventCount,
            allSessionsEndedOneSecondEarly: sessionCount > 0 && sessions.every(record => {
                const plannedSeconds = Math.round(finiteNumber(record.plannedMinutes) * 60);
                return record.endReason === "branch" && plannedSeconds - finiteNumber(record.actualSeconds) === 1;
            }),
            historyStarted: Boolean(trackingStartedAt)
        };
    }

    function compare(operator, value, threshold, threshold2) {
        if (value == null) return false;
        if (operator === "eq") return value === threshold;
        if (operator === "gt") return value > threshold;
        if (operator === "gte") return value >= threshold;
        if (operator === "lt") return value < threshold;
        if (operator === "lte") return value <= threshold;
        if (operator === "range") return value >= threshold && value < threshold2;
        if (operator === "range_inclusive") return value >= threshold && value <= threshold2;
        return false;
    }

    function ruleMatches(rule, metrics) {
        if (!rule.enabled) return false;
        if (["daily_total", "latest_session", "longest_session", "average_session", "session_count", "task_switch", "task_coverage", "early_end", "latest_whitelist", "precision_early_end"].includes(rule.category)
                && metrics.sessionCount === 0) return false;
        if (rule.category === "absence_streak" && !metrics.historyStarted) return false;
        if (rule.operator === "focus_gte_clicks_lte") {
            return metrics.dailyWhitelistClickCount != null
                && metrics.dailyFocusSeconds >= rule.threshold
                && metrics.dailyWhitelistClickCount <= rule.threshold2;
        }
        if (rule.operator === "focus_gte_clicks_gte") {
            return metrics.dailyWhitelistClickCount != null
                && metrics.dailyFocusSeconds >= rule.threshold
                && metrics.dailyWhitelistClickCount >= rule.threshold2;
        }
        if (rule.operator === "focus_lt_clicks_gte") {
            return metrics.dailyWhitelistClickCount != null
                && metrics.sessionCount > 0
                && metrics.dailyFocusSeconds < rule.threshold
                && metrics.dailyWhitelistClickCount >= rule.threshold2;
        }
        return compare(rule.operator, metrics[rule.metric], rule.threshold, rule.threshold2);
    }

    async function loadRules() {
        if (rulesPayload) return rulesPayload;
        if (window.FORCEFOCUS_FFTI_RULES) {
            rulesPayload = window.FORCEFOCUS_FFTI_RULES;
            if (!Array.isArray(rulesPayload.rules) || rulesPayload.rules.length !== 78) {
                throw new Error("Invalid embedded FFTI rules payload");
            }
            return rulesPayload;
        }
        const response = await fetch(RULES_PATH, { cache: "no-store" });
        if (!response.ok) throw new Error(`Unable to load FFTI rules: ${response.status}`);
        const payload = await response.json();
        if (!payload || !Array.isArray(payload.rules) || payload.rules.length !== 78) {
            throw new Error("Invalid FFTI rules payload");
        }
        rulesPayload = payload;
        return payload;
    }

    async function evaluateFFTIDate(dateKey, sourceRecords) {
        const payload = await loadRules();
        const metrics = buildMetrics(dateKey, sourceRecords || getRecords());
        const ids = [];
        const seen = new Set();
        for (const rule of payload.rules) {
            if (!ruleMatches(rule, metrics) || seen.has(rule.id)) continue;
            seen.add(rule.id);
            ids.push(rule.id);
        }
        return { ids, metrics };
    }

    async function settleFFTIDate(dateKey) {
        const payload = await loadRules();
        const awards = readJson(FFTI_AWARDS_KEY, {});
        const settled = readJson(FFTI_SETTLED_KEY, {});
        const selected = readJson(FFTI_SELECTED_KEY, {});
        const records = getRecords();
        const sourceSignature = recordSignatureForDate(dateKey, records);
        if (settled[dateKey] && settled[dateKey].sourceSignature === sourceSignature
                && Array.isArray(awards[dateKey])) {
            const rulesById = new Map(payload.rules.map(rule => [rule.id, rule]));
            return {
                dateKey,
                ids: awards[dateKey],
                personas: awards[dateKey].map(id => rulesById.get(id)).filter(Boolean),
                selectedId: selected[dateKey] || awards[dateKey][0] || null,
                generatedAt: settled[dateKey].generatedAt
            };
        }
        const evaluation = await evaluateFFTIDate(dateKey, records);
        const generatedAt = Date.now();
        awards[dateKey] = evaluation.ids;
        settled[dateKey] = { generatedAt, sourceSignature };
        const history = readJson(FFTI_HISTORY_KEY, {});
        evaluation.ids.forEach(id => {
            const prior = history[id] && typeof history[id] === "object" ? history[id] : {};
            const dates = Array.isArray(prior.unlockedDates) ? prior.unlockedDates : [];
            if (!dates.includes(dateKey)) dates.push(dateKey);
            history[id] = {
                count: dates.length,
                firstUnlockedAt: prior.firstUnlockedAt || generatedAt,
                lastUnlockedAt: generatedAt,
                unlockedDates: dates.sort()
            };
        });
        if (!evaluation.ids.includes(selected[dateKey])) selected[dateKey] = evaluation.ids[0] || null;
        writeJson(FFTI_AWARDS_KEY, awards);
        writeJson(FFTI_SETTLED_KEY, settled);
        writeJson(FFTI_HISTORY_KEY, history);
        writeJson(FFTI_SELECTED_KEY, selected);
        const rulesById = new Map(payload.rules.map(rule => [rule.id, rule]));
        return {
            dateKey,
            ids: evaluation.ids,
            personas: evaluation.ids.map(id => rulesById.get(id)).filter(Boolean),
            selectedId: selected[dateKey] || null,
            generatedAt
        };
    }

    function setSelectedPersona(dateKey, personaId) {
        const awards = readJson(FFTI_AWARDS_KEY, {});
        if (!Array.isArray(awards[dateKey]) || !awards[dateKey].includes(personaId)) return false;
        const selected = readJson(FFTI_SELECTED_KEY, {});
        selected[dateKey] = personaId;
        writeJson(FFTI_SELECTED_KEY, selected);
        return true;
    }

    function yesterdayKey() { return addLocalDays(localDateKey(), -1); }

    // Native history restore can deserialize and merge up to 1000 sessions.  It is
    // deliberately scheduled after the first home paint so it can never hold the
    // central circle/timeline behind a blank background during cold start.
    document.addEventListener("DOMContentLoaded", () => {
        requestAnimationFrame(() => window.setTimeout(() => initializeNativeHistory(true), 650));
    }, { once: true });
    window.addEventListener("focus", () => initializeNativeHistory(false));
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) initializeNativeHistory(false);
    });

    window.ForceFocusData = Object.freeze({
        TASK_IDS,
        localDateKey,
        addLocalDays,
        getRecords,
        completeFocusSession,
        importFocusRecords,
        replaceFocusRecords,
        syncNativeRecords,
        onHostResume: () => initializeNativeHistory(false),
        getCalendarFocusMinutes,
        beginHomeVisible,
        endHomeVisible,
        buildMetrics,
        evaluateFFTIDate,
        settleFFTIDate,
        setSelectedPersona,
        yesterdayKey,
        loadRules,
        getRulesSummary: async () => {
            const payload = await loadRules();
            return {
                ruleCount: payload.ruleCount,
                enabledCount: payload.enabledCount,
                disabledCount: payload.disabledCount,
                disabled: payload.rules.filter(rule => !rule.enabled).map(rule => ({ id: rule.id, name: rule.name, reason: rule.reason })),
                unmappedImages: payload.unmappedImages
            };
        }
    });
})();
