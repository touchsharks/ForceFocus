"use strict";

(() => {
    const DESIGN = Object.freeze({
        screenWidth: 691,
        screenHeight: 1536,
        clock: { x: 346, y: 725, radius: 186.5 },
        title: { x: 346, visibleBottomY: 374, fontSize: 35, maxWidth: 320 },
        seed: { x: 346, y: 543, size: 9 },
        branch: { length: 157, hitWidth: 250.4, longPressMs: 350, moveThreshold: 4, snapDegrees: 12, snapDuration: 160, returnDuration: 220 },
        spider: {
            x: 346,
            y: 1190,
            width: 48,
            height: 44,
            hitSize: 200,
            longPressMs: 350,
            moveThreshold: 8,
            minX: 24,
            maxX: 667,
            minY: 900,
            maxY: 1360,
            candidateRadius: 85,
            nearRadius: 110,
            nearExitRadius: 115,
            returnDuration: 240
        },
        leftCandidate: { x: 43, y: 987 },
        rightCandidate: { x: 606, y: 1188 },
        leftLabel: { x: 96, y: 987 },
        rightLabel: { x: 516, y: 1188 },
        labelFontSize: 13.5,
        tickAsset: "focus_clock/focus_clock_tick_leaf.png"
    });

    const WHITELIST_BY_TASK = Object.freeze({
        "简历": Object.freeze(["wps"]),
        "岗位调研": Object.freeze(["wps", "xiaohongshu"]),
        "考公": Object.freeze(["fenbi"]),
        "磨耳朵": Object.freeze(["recorder", "wps"])
    });

    const SLOTS_BY_TASK = Object.freeze({
        "简历": Object.freeze({ left: null, right: "wps" }),
        "岗位调研": Object.freeze({ left: "wps", right: "xiaohongshu" }),
        "考公": Object.freeze({ left: null, right: "fenbi" }),
        "磨耳朵": Object.freeze({ left: "wps", right: "recorder" })
    });

    const APP_NAMES = Object.freeze({
        wps: "WPS",
        xiaohongshu: "小红书",
        fenbi: "粉笔",
        recorder: "录音机"
    });
    function configuredAppName(appId){if(APP_NAMES[appId])return APP_NAMES[appId];try{const v=JSON.parse(localStorage.getItem("forcefocus_whitelist_apps_v1")||"{}");if(v[appId]&&v[appId].name)return v[appId].name}catch(e){}return appId}

    function configuredWhitelist(task) {
        if (window.ForceFocusSidebar && typeof window.ForceFocusSidebar.getWorkItemByName === "function") {
            const item = window.ForceFocusSidebar.getWorkItemByName(task);
            if (item) return Array.isArray(item.whitelist) ? item.whitelist.slice(0, 2).filter(Boolean) : [];
        }
        return WHITELIST_BY_TASK[task] ? [...WHITELIST_BY_TASK[task]] : null;
    }

    function slotsForTask(task, sessionWhitelist) {
        const values = Array.isArray(sessionWhitelist) ? sessionWhitelist.slice(0, 2) : (configuredWhitelist(task) || []);
        if (values.length === 1) return { left: null, right: values[0] };
        return { left: values[0] || null, right: values[1] || null };
    }

    const LOCAL_SESSION_KEY = "forcefocus_active_session";
    const PENDING_COMPLETION_KEY = "forcefocus_pending_completed_record_v1";
    const EARLY_EXIT_WEEK_KEY = "forcefocus_early_exit_week_v1";
    const FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

    const home = document.querySelector("#home");
    const layer = document.querySelector("#focusClockLayer");
    const titleCanvas = document.querySelector("#focusTaskTitle");
    const silkLine = document.querySelector("#focusSilkLine");
    const tickRing = document.querySelector("#focusTickRing");
    const zeroSeed = document.querySelector("#focusZeroSeed");
    const branchGeometry = document.querySelector("#focusBranchGeometry");
    const branchHit = document.querySelector("#focusBranchHitArea");
    const spider = document.querySelector("#focusSpider");
    const spiderHit = document.querySelector("#focusSpiderHitArea");
    const whitelistLeft = document.querySelector("#focusWhitelistLeft");
    const whitelistRight = document.querySelector("#focusWhitelistRight");
    const labelLeft = document.querySelector("#focusLabelLeft");
    const labelRight = document.querySelector("#focusLabelRight");

    let metrics = null;
    let session = null;
    let slots = { left: null, right: null };
    let finishLocked = false;
    let earlyExitLocked = false;
    let countdownTimer = 0;
    let branchAnimation = 0;
    let branchPressTimer = 0;
    let branchGesture = null;
    let branchAngle = 0;
    let branchDragArmed = false;
    let isBranchDragging = false;
    let spiderTimer = 0;
    let spiderGesture = null;
    let spiderPosition = { x: DESIGN.spider.x, y: DESIGN.spider.y };
    let candidateSide = null;
    const leafResponse = {
        left: { active: false, pulseArmed: true },
        right: { active: false, pulseArmed: true }
    };
    let tickElements = [];

    function bridgeCall(name, ...args) {
        try {
            const bridge = window.NativeBridge;
            if (bridge && typeof bridge[name] === "function") return bridge[name](...args);
        } catch (_error) { /* Browser preview has no Android bridge. */ }
        return null;
    }

    function localDateKey(timestamp) {
        const date = new Date(timestamp == null ? Date.now() : timestamp);
        const pad = value => String(value).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function currentWeekKey(timestamp = Date.now()) {
        const date = new Date(timestamp);
        date.setHours(0, 0, 0, 0);
        const daysAfterMonday = (date.getDay() + 6) % 7;
        date.setDate(date.getDate() - daysAfterMonday);
        return localDateKey(date.getTime());
    }

    function readEarlyExitState() {
        const weekKey = currentWeekKey();
        let parsed = null;
        try {
            const nativeValue = bridgeCall("getEarlyExitState");
            if (typeof nativeValue === "string" && nativeValue) parsed = JSON.parse(nativeValue);
        } catch (_error) { /* Fall back to the WebView mirror. */ }
        if (!parsed) {
            try { parsed = JSON.parse(localStorage.getItem(EARLY_EXIT_WEEK_KEY) || "null"); }
            catch (_error) { parsed = null; }
        }
        if (!parsed || parsed.weekKey !== weekKey) return { weekKey, earlyExitCount: 0 };
        return { weekKey, earlyExitCount: Math.max(0, Math.floor(Number(parsed.earlyExitCount) || 0)) };
    }

    function writeEarlyExitState(state) {
        const normalized = { weekKey: currentWeekKey(), earlyExitCount: Math.max(0, Math.floor(Number(state.earlyExitCount) || 0)) };
        try { localStorage.setItem(EARLY_EXIT_WEEK_KEY, JSON.stringify(normalized)); } catch (_error) { /* Native mirror may remain. */ }
        window.setTimeout(() => bridgeCall("saveEarlyExitState", JSON.stringify(normalized)), 0);
        return normalized;
    }

    function refreshEarlyExitLock() {
        earlyExitLocked = readEarlyExitState().earlyExitCount >= 2;
        home.classList.toggle("focus-early-exit-locked", earlyExitLocked);
        branchHit.setAttribute("aria-disabled", earlyExitLocked ? "true" : "false");
    }

    function recordEarlyExit() {
        const state = readEarlyExitState();
        state.earlyExitCount += 1;
        writeEarlyExitState(state);
        refreshEarlyExitLock();
    }

    function taskIdForSession(task) {
        if (window.ForceFocusSidebar && typeof window.ForceFocusSidebar.getWorkItemByName === "function") {
            const item = window.ForceFocusSidebar.getWorkItemByName(task);
            if (item && item.id) return item.id;
        }
        return window.ForceFocusData && window.ForceFocusData.TASK_IDS
            ? (window.ForceFocusData.TASK_IDS[task] || "")
            : "";
    }

    function fallbackMetrics() {
        const density = window.devicePixelRatio || 1;
        return {
            fullWidthPx: window.innerWidth * density,
            fullHeightPx: window.innerHeight * density,
            density,
            statusInsetPx: 0,
            navigationInsetPx: 0
        };
    }

    function normalizeMetrics(value) {
        const fallback = fallbackMetrics();
        const density = Math.max(0.1, Number(value && value.density) || fallback.density);
        return {
            fullWidthPx: Math.max(1, Number(value && value.fullWidthPx) || fallback.fullWidthPx),
            fullHeightPx: Math.max(1, Number(value && value.fullHeightPx) || fallback.fullHeightPx),
            density,
            statusInsetPx: Math.max(0, Number(value && value.statusInsetPx) || 0),
            navigationInsetPx: Math.max(0, Number(value && value.navigationInsetPx) || 0)
        };
    }

    function fullCssWidth() { return metrics.fullWidthPx / metrics.density; }
    function fullCssHeight() { return metrics.fullHeightPx / metrics.density; }
    function scaleX() { return fullCssWidth() / DESIGN.screenWidth; }
    function scaleY() { return fullCssHeight() / DESIGN.screenHeight; }
    function pxX(value) { return value * scaleX(); }
    function pxY(value) { return value * scaleY(); }
    function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
    function mix(from, to, progress) { return from + (to - from) * progress; }

    function clientToDesign(clientX, clientY) {
        const layerTop = -(metrics.statusInsetPx / metrics.density);
        return {
            x: clientX / scaleX(),
            y: (clientY - layerTop) / scaleY()
        };
    }

    function designAngle(point) {
        const degrees = Math.atan2(point.x - DESIGN.clock.x, DESIGN.clock.y - point.y) * 180 / Math.PI;
        return (degrees + 360) % 360;
    }

    function signedAngleDelta(from, to) {
        return ((to - from + 540) % 360) - 180;
    }

    function currentRemainingSeconds() {
        if (!session) return 0;
        return Math.max(0, (session.endTimestamp - Date.now()) / 1000);
    }

    function currentCountdownAngle() {
        const angle = currentRemainingSeconds() * 0.024;
        return ((angle % 360) + 360) % 360;
    }

    function createTicks() {
        tickElements.forEach(element => element.remove());
        tickElements = [];
        for (let index = 1; index <= 24; index += 1) {
            const image = document.createElement("img");
            image.className = "focus-clock-tick";
            image.src = DESIGN.tickAsset;
            image.alt = "";
            image.draggable = false;
            image.dataset.tickIndex = String(index);
            tickRing.appendChild(image);
            tickElements.push(image);
        }
    }

    function layoutTicks() {
        zeroSeed.style.left = `${pxX(DESIGN.seed.x)}px`;
        zeroSeed.style.top = `${pxY(DESIGN.seed.y)}px`;
        zeroSeed.style.width = `${pxX(DESIGN.seed.size)}px`;
        zeroSeed.style.height = `${pxX(DESIGN.seed.size)}px`;

        tickElements.forEach((element, offset) => {
            const index = offset + 1;
            const angle = index * 14.4;
            const radians = angle * Math.PI / 180;
            const width = index % 2 === 0 ? 8.5 : 4.5;
            const height = index % 2 === 0 ? 25 : 13;
            const centerRadius = DESIGN.clock.radius - height / 2;
            const centerX = DESIGN.clock.x + Math.sin(radians) * centerRadius;
            const centerY = DESIGN.clock.y - Math.cos(radians) * centerRadius;
            element.style.left = `${pxX(centerX)}px`;
            element.style.top = `${pxY(centerY)}px`;
            element.style.width = `${pxX(width)}px`;
            element.style.height = `${pxX(height)}px`;
            element.style.transform = `translate(-50%, -50%) rotate(${angle + 180}deg)`;
        });
    }

    function updateTickOpacity(remainingSeconds) {
        const activeCount = clamp(Math.ceil(remainingSeconds / 600), 0, 24);
        tickElements.forEach((element, index) => {
            element.style.opacity = index < activeCount ? "1" : "0.18";
        });
    }

    function drawTaskTitle() {
        if (!session) return;
        const cssWidth = pxX(DESIGN.title.maxWidth);
        const cssHeight = pxX(60);
        const dpr = metrics.density;
        titleCanvas.style.left = `${pxX(DESIGN.title.x) - cssWidth / 2}px`;
        titleCanvas.style.top = `${pxY(DESIGN.title.visibleBottomY) - cssHeight}px`;
        titleCanvas.style.width = `${cssWidth}px`;
        titleCanvas.style.height = `${cssHeight}px`;
        titleCanvas.width = Math.max(1, Math.round(cssWidth * dpr));
        titleCanvas.height = Math.max(1, Math.round(cssHeight * dpr));
        titleCanvas.setAttribute("aria-label", session.task);

        const context = titleCanvas.getContext("2d");
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, cssWidth, cssHeight);
        let fontSize = pxX(DESIGN.title.fontSize);
        context.font = `700 ${fontSize}px ${FONT_FAMILY}`;
        let textMetrics = context.measureText(session.task);
        if (textMetrics.width > cssWidth) {
            fontSize *= cssWidth / textMetrics.width;
            context.font = `700 ${fontSize}px ${FONT_FAMILY}`;
            textMetrics = context.measureText(session.task);
        }
        const descent = textMetrics.actualBoundingBoxDescent || fontSize * 0.18;
        context.fillStyle = "#46513A";
        context.textAlign = "center";
        context.textBaseline = "alphabetic";
        context.fillText(session.task, cssWidth / 2, cssHeight - descent);
    }

    function layoutClockLayer() {
        if (!metrics) return;
        layer.style.left = "0px";
        layer.style.top = `${-(metrics.statusInsetPx / metrics.density)}px`;
        layer.style.width = `${fullCssWidth()}px`;
        layer.style.height = `${fullCssHeight()}px`;

        layoutTicks();
        drawTaskTitle();

        spider.style.width = `${pxX(DESIGN.spider.width)}px`;
        spider.style.height = `${pxX(DESIGN.spider.height)}px`;
        spiderHit.style.width = `${pxX(DESIGN.spider.hitSize)}px`;
        spiderHit.style.height = `${pxX(DESIGN.spider.hitSize)}px`;

        labelLeft.style.left = `${pxX(DESIGN.leftLabel.x)}px`;
        labelLeft.style.top = `${pxY(DESIGN.leftLabel.y)}px`;
        labelRight.style.left = `${pxX(DESIGN.rightLabel.x)}px`;
        labelRight.style.top = `${pxY(DESIGN.rightLabel.y)}px`;
        labelLeft.style.fontSize = `${pxX(DESIGN.labelFontSize)}px`;
        labelRight.style.fontSize = `${pxX(DESIGN.labelFontSize)}px`;

        renderBranch(branchAngle);
        renderSpider();
    }

    function renderBranch(angle) {
        branchAngle = Math.max(0, Number(angle) || 0);
        const visualAngle = ((branchAngle % 360) + 360) % 360;
        branchGeometry.setAttribute("transform", `rotate(${visualAngle.toFixed(4)} ${DESIGN.clock.x} ${DESIGN.clock.y})`);
    }

    function renderSpider() {
        spider.style.left = `${pxX(spiderPosition.x)}px`;
        spider.style.top = `${pxY(spiderPosition.y)}px`;
        spiderHit.style.left = `${pxX(spiderPosition.x)}px`;
        spiderHit.style.top = `${pxY(spiderPosition.y)}px`;
        silkLine.setAttribute("x2", spiderPosition.x.toFixed(2));
        silkLine.setAttribute("y2", spiderPosition.y.toFixed(2));
    }

    function clearCandidate() {
        candidateSide = null;
        spider.classList.remove("is-candidate");
        labelLeft.classList.remove("is-visible");
        labelRight.classList.remove("is-visible");
        labelLeft.setAttribute("aria-hidden", "true");
        labelRight.setAttribute("aria-hidden", "true");
    }

    function setCandidate(side) {
        if (candidateSide === side) return;
        clearCandidate();
        if (!side || !slots[side]) return;
        candidateSide = side;
        const label = side === "left" ? labelLeft : labelRight;
        spider.classList.add("is-candidate");
        label.textContent = configuredAppName(slots[side]);
        label.classList.add("is-visible");
        label.setAttribute("aria-hidden", "false");
    }

    function resetLeafResponses() {
        for (const side of ["left", "right"]) {
            const leaf = side === "left" ? whitelistLeft : whitelistRight;
            leafResponse[side].active = false;
            leafResponse[side].pulseArmed = true;
            leaf.classList.remove("is-near", "is-target", "play-target-pulse");
        }
    }

    function playLeafTargetPulse(leaf) {
        leaf.classList.remove("play-target-pulse");
        void leaf.offsetWidth;
        leaf.classList.add("play-target-pulse");
    }

    function updateLeafResponses(x, y) {
        for (const side of ["left", "right"]) {
            const leaf = side === "left" ? whitelistLeft : whitelistRight;
            const response = leafResponse[side];
            if (!slots[side]) {
                response.active = false;
                response.pulseArmed = true;
                leaf.classList.remove("is-near", "is-target", "play-target-pulse");
                continue;
            }

            const target = side === "left" ? DESIGN.leftCandidate : DESIGN.rightCandidate;
            const distance = Math.hypot(x - target.x, y - target.y);
            const isTarget = distance <= DESIGN.spider.candidateRadius;
            const isNear = isTarget
                || distance <= DESIGN.spider.nearRadius
                || (response.active && distance <= DESIGN.spider.nearExitRadius);

            if (distance > DESIGN.spider.nearExitRadius) {
                response.active = false;
                response.pulseArmed = true;
            } else if (isNear) {
                response.active = true;
            }

            if (isTarget && response.pulseArmed) {
                response.pulseArmed = false;
                playLeafTargetPulse(leaf);
            }

            leaf.classList.toggle("is-near", isNear && !isTarget);
            leaf.classList.toggle("is-target", isTarget);
        }
    }

    function nearestCandidate(x, y) {
        let best = null;
        let bestDistance = Infinity;
        for (const side of ["left", "right"]) {
            if (!slots[side]) continue;
            const target = side === "left" ? DESIGN.leftCandidate : DESIGN.rightCandidate;
            const distance = Math.hypot(x - target.x, y - target.y);
            if (distance <= DESIGN.spider.candidateRadius && distance < bestDistance) {
                best = side;
                bestDistance = distance;
            }
        }
        return best;
    }

    function isWhitelistInstalled(appId) {
        if(String(appId).includes("."))return true;
        const raw = bridgeCall("getWhitelistAppInfo", appId);
        if (raw == null) return null;
        try { return Boolean(JSON.parse(raw).installed); }
        catch (_error) { return null; }
    }

    function renderWhitelistSlots() {
        slots = session ? slotsForTask(session.task, session.whitelist) : { left: null, right: null };
        whitelistLeft.classList.toggle("is-visible", Boolean(slots.left));
        whitelistRight.classList.toggle("is-visible", Boolean(slots.right));
        resetLeafResponses();
        clearCandidate();
    }

    function updateCountdown() {
        if (!session || finishLocked) return;
        const remainingSeconds = currentRemainingSeconds();
        updateTickOpacity(remainingSeconds);
        if (!branchGesture && !branchAnimation) renderBranch(currentCountdownAngle());
        if (remainingSeconds <= 0) finishFocus("timer");
    }

    function startCountdown() {
        window.clearInterval(countdownTimer);
        updateCountdown();
        countdownTimer = window.setInterval(updateCountdown, 250);
    }

    function parseStoredSession(raw) {
        try {
            const value = JSON.parse(raw);
            const task = String(value.task || "");
            const totalMinutes = Number(value.totalMinutes);
            const startTimestamp = Number(value.startTimestamp);
            const endTimestamp = Number(value.endTimestamp);
            const currentWhitelist = configuredWhitelist(task);
            if (!currentWhitelist || !Number.isFinite(totalMinutes) || totalMinutes <= 0
                    || !Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || endTimestamp <= startTimestamp) return null;
            return {
                task,
                totalMinutes,
                startTimestamp,
                endTimestamp,
                whitelist: Array.isArray(value.whitelist) ? value.whitelist.slice(0, 2) : currentWhitelist,
                whitelistClickCount: Math.max(0, Math.round(Number(value.whitelistClickCount) || 0))
            };
        } catch (_error) {
            return null;
        }
    }

    function persistSession() {
        try { localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session)); } catch (_error) { /* Native storage remains authoritative. */ }
        const snapshot = session ? { ...session, whitelist: [...session.whitelist] } : null;
        if (!snapshot) return;
        window.setTimeout(() => bridgeCall(
            "saveFocusSession",
            snapshot.task,
            snapshot.totalMinutes,
            String(snapshot.startTimestamp),
            String(snapshot.endTimestamp),
            JSON.stringify(snapshot.whitelist)
        ), 0);
    }

    function restoreSession() {
        let restored = null;
        try { restored = parseStoredSession(bridgeCall("restoreFocusSession")); } catch (_error) { /* Try local copy. */ }
        if (!restored) {
            try { restored = parseStoredSession(localStorage.getItem(LOCAL_SESSION_KEY)); } catch (_error) { /* No local session. */ }
        }
        if (restored) showFocus(restored, true);
    }

    function startFocus(task, minutes) {
        const normalizedTask = String(task || "");
        const normalizedMinutes = Number(minutes);
        const whitelist = configuredWhitelist(normalizedTask);
        if (!whitelist || !Number.isFinite(normalizedMinutes) || normalizedMinutes <= 0) return;
        const now = Date.now();
        showFocus({
            task: normalizedTask,
            totalMinutes: normalizedMinutes,
            startTimestamp: now,
            endTimestamp: now + Math.round(normalizedMinutes * 60000),
            whitelist,
            whitelistClickCount: 0
        }, false);
    }

    function showFocus(nextSession, restored) {
        cancelGestures();
        session = nextSession;
        finishLocked = false;
        branchAngle = currentCountdownAngle();
        spiderPosition = { x: DESIGN.spider.x, y: DESIGN.spider.y };
        home.classList.add("focus-clock-active");
        layer.setAttribute("aria-hidden", "false");
        renderWhitelistSlots();
        refreshEarlyExitLock();
        layoutClockLayer();
        const policy = JSON.stringify({
            taskId: taskIdForSession(session.task),
            taskName: session.task,
            whitelist: session.whitelist.slice(0, 2)
        });
        requestAnimationFrame(() => window.setTimeout(() => {
            bridgeCall("setFocusSessionPolicy", policy);
            bridgeCall("setFocusModeActive", true);
        }, 0));
        if (window.ForceFocusData) window.ForceFocusData.endHomeVisible();
        if (!restored) persistSession();
        startCountdown();
    }

    function releasePointer(element, pointerId) {
        if (pointerId == null) return;
        try {
            if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
        } catch (_error) { /* Capture may already have ended. */ }
    }

    function cancelBranchGesture(animateBack) {
        if (!branchGesture) return;
        window.clearTimeout(branchPressTimer);
        branchPressTimer = 0;
        releasePointer(branchHit, branchGesture.pointerId);
        branchGesture = null;
        branchDragArmed = false;
        isBranchDragging = false;
        home.classList.remove("focus-branch-gesture-active");
        if (animateBack && session && !finishLocked) animateBranchToRealtime(DESIGN.branch.returnDuration);
    }

    function cancelSpiderGesture(returnHome) {
        window.clearTimeout(spiderTimer);
        window.clearTimeout(branchPressTimer);
        branchPressTimer = 0;
        spiderTimer = 0;
        if (spiderGesture) releasePointer(spiderHit, spiderGesture.pointerId);
        spiderGesture = null;
        spider.classList.remove("is-dragging");
        clearCandidate();
        if (returnHome) returnSpiderToDefault();
    }

    function cancelGestures() {
        cancelAnimationFrame(branchAnimation);
        branchAnimation = 0;
        cancelBranchGesture(false);
        cancelSpiderGesture(false);
        window.clearTimeout(spiderTimer);
    }

    function easeOut(value) {
        return 1 - Math.pow(1 - value, 3);
    }

    function animateBranch(from, to, duration, onFinish) {
        cancelAnimationFrame(branchAnimation);
        const started = performance.now();
        const frame = now => {
            const raw = clamp((now - started) / duration, 0, 1);
            renderBranch(mix(from, to, easeOut(raw)));
            if (raw < 1) branchAnimation = requestAnimationFrame(frame);
            else {
                branchAnimation = 0;
                if (onFinish) onFinish();
            }
        };
        branchAnimation = requestAnimationFrame(frame);
    }

    function animateBranchToRealtime(duration) {
        const from = branchAngle;
        const target = currentCountdownAngle();
        animateBranch(from, target, duration, updateCountdown);
    }

    function beginBranchSnap() {
        if (!branchGesture || branchGesture.snapping || branchGesture.snapped) return;
        branchGesture.snapping = true;
        branchGesture.state = "SNAPPING";
        bridgeCall("performFocusHaptic", "armed");
        animateBranch(branchAngle, 0, DESIGN.branch.snapDuration, () => {
            if (!branchGesture) return;
            branchGesture.snapping = false;
            branchGesture.snapped = true;
            renderBranch(0);
            if (branchGesture.released) finishFocus("branch");
        });
    }

    function installBranchGesture() {
        branchHit.addEventListener("pointerdown", event => {
            if (!session || finishLocked || branchGesture) return;
            if (earlyExitLocked) {
                event.preventDefault();
                event.stopPropagation();
                bridgeCall("performFocusHaptic", "locked");
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            cancelAnimationFrame(branchAnimation);
            branchAnimation = 0;
            const point = clientToDesign(event.clientX, event.clientY);
            const pointerAngle = designAngle(point);
            branchGesture = {
                pointerId: event.pointerId,
                state: "PRESSING",
                downX: point.x,
                downY: point.y,
                latestX: point.x,
                latestY: point.y,
                armX: point.x,
                armY: point.y,
                startBranchAngle: branchAngle,
                realCountdownAngle: currentCountdownAngle(),
                startPointerAngle: pointerAngle,
                grabOffset: signedAngleDelta(pointerAngle, branchAngle),
                latestPointerAngle: pointerAngle,
                lastPointerAngle: pointerAngle,
                manualAngle: branchAngle,
                unwrappedDragAngle: 0,
                snapping: false,
                snapped: false,
                released: false
            };
            branchDragArmed = false;
            isBranchDragging = false;
            home.classList.add("focus-branch-gesture-active");
            try { branchHit.setPointerCapture(event.pointerId); }
            catch (_error) { cancelBranchGesture(false); return; }
            window.clearTimeout(branchPressTimer);
            branchPressTimer = window.setTimeout(() => {
                if (!branchGesture || branchGesture.state !== "PRESSING" || finishLocked) return;
                branchGesture.state = "ARMED";
                branchGesture.armX = branchGesture.latestX;
                branchGesture.armY = branchGesture.latestY;
                branchGesture.lastPointerAngle = branchGesture.latestPointerAngle;
                branchDragArmed = true;
                bridgeCall("performFocusHaptic", "armed");
            }, DESIGN.branch.longPressMs);
        });

        const handleBranchMove = event => {
            if (!branchGesture || event.pointerId !== branchGesture.pointerId || finishLocked) return;
            event.preventDefault();
            event.stopPropagation();
            const point = clientToDesign(event.clientX, event.clientY);
            const pointerAngle = designAngle(point);
            branchGesture.latestX = point.x;
            branchGesture.latestY = point.y;
            branchGesture.latestPointerAngle = pointerAngle;
            if (branchGesture.snapping || branchGesture.snapped) return;
            if (branchGesture.state === "PRESSING") {
                return;
            }
            if (!isBranchDragging) {
                const movement = Math.hypot(point.x - branchGesture.armX, point.y - branchGesture.armY);
                if (!branchDragArmed || movement < DESIGN.branch.moveThreshold) return;
                isBranchDragging = true;
                branchGesture.state = "DRAGGING";
            }
            const delta = signedAngleDelta(branchGesture.lastPointerAngle, pointerAngle);
            branchGesture.lastPointerAngle = pointerAngle;
            if (delta < 0) {
                branchGesture.unwrappedDragAngle += delta;
                branchGesture.manualAngle = Math.max(0, branchGesture.startBranchAngle + branchGesture.unwrappedDragAngle);
                renderBranch(branchGesture.manualAngle);
            }
        };

        const release = event => {
            if (!branchGesture || event.pointerId !== branchGesture.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            window.clearTimeout(branchPressTimer);
            branchPressTimer = 0;
            const shouldSnap = branchGesture.state === "DRAGGING"
                && branchGesture.manualAngle <= DESIGN.branch.snapDegrees;
            releasePointer(branchHit, event.pointerId);
            branchDragArmed = false;
            isBranchDragging = false;
            home.classList.remove("focus-branch-gesture-active");
            if (shouldSnap) {
                branchGesture.pointerId = null;
                branchGesture.released = true;
                beginBranchSnap();
                return;
            }
            branchGesture = null;
            animateBranchToRealtime(DESIGN.branch.returnDuration);
        };
        const cancel = event => {
            if (!branchGesture || event.pointerId !== branchGesture.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            cancelBranchGesture(true);
        };
        window.addEventListener("pointermove", handleBranchMove, { capture: true, passive: false });
        window.addEventListener("pointerup", release, { capture: true, passive: false });
        window.addEventListener("pointercancel", cancel, { capture: true, passive: false });
    }

    function returnSpiderToDefault() {
        spider.classList.remove("is-dragging");
        spiderPosition = { x: DESIGN.spider.x, y: DESIGN.spider.y };
        renderSpider();
        resetLeafResponses();
    }

    function installSpiderGesture() {
        spiderHit.addEventListener("pointerdown", event => {
            if (!session || finishLocked || spiderGesture) return;
            event.preventDefault();
            event.stopPropagation();
            const point = clientToDesign(event.clientX, event.clientY);
            spiderGesture = {
                pointerId: event.pointerId,
                state: "pressing",
                downX: point.x,
                downY: point.y
            };
            spiderHit.setPointerCapture(event.pointerId);
            spiderTimer = window.setTimeout(() => {
                if (spiderGesture && spiderGesture.state === "pressing") {
                    spiderGesture.state = "armed";
                    spider.classList.add("is-dragging");
                }
            }, DESIGN.spider.longPressMs);
        });

        spiderHit.addEventListener("pointermove", event => {
            if (!spiderGesture || event.pointerId !== spiderGesture.pointerId || finishLocked) return;
            const point = clientToDesign(event.clientX, event.clientY);
            const movement = Math.hypot(point.x - spiderGesture.downX, point.y - spiderGesture.downY);
            if (spiderGesture.state === "pressing") {
                if (movement > DESIGN.spider.moveThreshold) cancelSpiderGesture(true);
                return;
            }
            if (spiderGesture.state === "armed" && movement <= DESIGN.spider.moveThreshold) return;
            event.preventDefault();
            spiderGesture.state = "dragging";
            spiderPosition = {
                x: clamp(point.x, DESIGN.spider.minX, DESIGN.spider.maxX),
                y: clamp(point.y, DESIGN.spider.minY, DESIGN.spider.maxY)
            };
            renderSpider();
            updateLeafResponses(spiderPosition.x, spiderPosition.y);
            setCandidate(nearestCandidate(spiderPosition.x, spiderPosition.y));
        });

        const release = event => {
            if (!spiderGesture || event.pointerId !== spiderGesture.pointerId) return;
            event.preventDefault();
            releasePointer(spiderHit, event.pointerId);
            window.clearTimeout(spiderTimer);
            spiderTimer = 0;
            const releasePoint = clientToDesign(event.clientX, event.clientY);
            const releaseSide = nearestCandidate(releasePoint.x, releasePoint.y);
            const appId = releaseSide && slots[releaseSide];
            spiderGesture = null;
            clearCandidate();
            returnSpiderToDefault();
            if (appId) {
                const installed = isWhitelistInstalled(appId);
                if (installed !== false) {
                    session.whitelistClickCount = Math.max(0, Number(session.whitelistClickCount) || 0) + 1;
                    persistSession();
                }
                if(String(appId).includes("."))bridgeCall("launchPackage",appId);else bridgeCall("launchWhitelistApp", appId);
            }
        };
        spiderHit.addEventListener("pointerup", release);
        spiderHit.addEventListener("pointercancel", event => {
            if (!spiderGesture || event.pointerId !== spiderGesture.pointerId) return;
            cancelSpiderGesture(true);
        });
    }

    function finishFocus(reason) {
        if (finishLocked || !session) return;
        finishLocked = true;
        window.clearInterval(countdownTimer);
        countdownTimer = 0;
        cancelGestures();
        const endedAt = Date.now();
        const plannedSeconds = Math.max(0, Math.round(session.totalMinutes * 60));
        const actualSeconds = Math.max(0, Math.min(plannedSeconds, Math.round((endedAt - session.startTimestamp) / 1000)));
        const taskId = taskIdForSession(session.task);
        const sessionId = `${Math.round(session.startTimestamp)}-${taskId || session.task}`;
        const completedRecord = {
            id: sessionId,
            sessionId,
            taskId,
            task: session.task,
            taskName: session.task,
            plannedMinutes: session.totalMinutes,
            startedAt: session.startTimestamp,
            startTime: session.startTimestamp,
            endedAt,
            endTime: endedAt,
            actualSeconds,
            actualFocusedSeconds: actualSeconds,
            actualFocusedMinutes: actualSeconds / 60,
            localDate: window.ForceFocusData ? window.ForceFocusData.localDateKey(endedAt) : "",
            endReason: reason,
            whitelistClickCount: Math.max(0, Number(session.whitelistClickCount) || 0)
        };
        if (reason === "branch") recordEarlyExit();
        try { localStorage.setItem(PENDING_COMPLETION_KEY, JSON.stringify(completedRecord)); } catch (_error) { /* Best-effort crash journal. */ }
        try { localStorage.removeItem(LOCAL_SESSION_KEY); } catch (_error) { /* Native session has already been cleared. */ }
        returnHome();
        window.setTimeout(() => {
            if (reason !== "branch") bridgeCall("performFocusHaptic", "complete");
            persistCompletedRecord(completedRecord);
        }, 0);
    }

    function persistCompletedRecord(completedRecord) {
        const hasNativeHistory = window.NativeBridge
            && typeof window.NativeBridge.completeFocusSessionV2 === "function";
        if (hasNativeHistory) {
            bridgeCall("completeFocusSessionV2", JSON.stringify(completedRecord));
            if (window.ForceFocusData && typeof window.ForceFocusData.syncNativeRecords === "function") {
                window.ForceFocusData.syncNativeRecords();
            }
        } else {
            if (window.ForceFocusData) window.ForceFocusData.completeFocusSession(completedRecord);
            bridgeCall(
                "completeFocusSession",
                completedRecord.taskName,
                completedRecord.plannedMinutes,
                String(completedRecord.startTime),
                String(completedRecord.endTime),
                completedRecord.actualFocusedSeconds,
                completedRecord.endReason
            );
        }
        window.dispatchEvent(new CustomEvent("forcefocus:records-changed", { detail: completedRecord }));
        try { localStorage.removeItem(PENDING_COMPLETION_KEY); } catch (_error) { /* Record is already durable elsewhere. */ }
    }

    function flushPendingCompletion() {
        let pending = null;
        try { pending = JSON.parse(localStorage.getItem(PENDING_COMPLETION_KEY) || "null"); }
        catch (_error) { pending = null; }
        if (pending && pending.sessionId) window.setTimeout(() => persistCompletedRecord(pending), 0);
    }

    function returnHome() {
        window.clearInterval(countdownTimer);
        countdownTimer = 0;
        cancelGestures();
        clearCandidate();
        home.classList.remove("focus-clock-active");
        layer.setAttribute("aria-hidden", "true");
        session = null;
        slots = { left: null, right: null };
        spiderPosition = { x: DESIGN.spider.x, y: DESIGN.spider.y };
        finishLocked = false;
        earlyExitLocked = false;
        home.classList.remove("focus-early-exit-locked");
        renderSpider();
        if (window.ForceFocusData) window.ForceFocusData.beginHomeVisible();
        requestAnimationFrame(() => window.setTimeout(() => {
            bridgeCall("setFocusModeActive", false);
            if (typeof window.restoreRememberedMinutes === "function"
                    && typeof window.setSelectedMinutes === "function") {
                window.setSelectedMinutes(window.restoreRememberedMinutes());
            }
        }, 0));
    }

    function handleInterruption() {
        if (!session || finishLocked) return;
        cancelBranchGesture(true);
        cancelSpiderGesture(true);
        updateCountdown();
    }

    function initialize() {
        if (!home || !layer || !titleCanvas || !silkLine || !tickRing || !zeroSeed || !branchGeometry
                || !branchHit || !spider || !spiderHit || !whitelistLeft || !whitelistRight || !labelLeft || !labelRight) return;
        metrics = normalizeMetrics(typeof window.getForceFocusMetrics === "function" ? window.getForceFocusMetrics() : null);
        createTicks();
        layoutClockLayer();
        installBranchGesture();
        installSpiderGesture();
        for (const leaf of [whitelistLeft, whitelistRight]) {
            leaf.addEventListener("animationend", event => {
                if (event.animationName === "focusLeafTargetPulse") leaf.classList.remove("play-target-pulse");
            });
        }
        window.addEventListener("forcefocus:enterFocus", event => startFocus(event.detail[0], event.detail[1]));
        window.addEventListener("forcefocus:metrics", event => {
            metrics = normalizeMetrics(event.detail || {});
            layoutClockLayer();
        });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) handleInterruption();
            else updateCountdown();
        });
        window.addEventListener("blur", handleInterruption);
        restoreSession();
        flushPendingCompletion();
    }

    window.ForceFocusFocus = Object.freeze({
        start: startFocus,
        isActive: () => Boolean(session && home.classList.contains("focus-clock-active")),
        onHostResume: updateCountdown,
        getClockState: () => ({
            task: session ? session.task : null,
            remainingSeconds: currentRemainingSeconds(),
            branchAngle,
            branchGestureState: branchGesture ? branchGesture.state : "IDLE",
            isBranchDragging,
            finishLocked,
            earlyExitLocked,
            activeCount: clamp(Math.ceil(currentRemainingSeconds() / 600), 0, 24),
            spider: { x: spiderPosition.x, y: spiderPosition.y },
            slots: { left: slots.left, right: slots.right }
        })
    });

    document.addEventListener("DOMContentLoaded", initialize, { once: true });
})();
