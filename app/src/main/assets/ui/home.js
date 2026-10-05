"use strict";

const HOME_SPEC = Object.freeze({
    screenWidthMm: 69.0,
    screenHeightMm: 155.0,
    contentHeightMm: 138.7,
    pageCenterX: 34.5,
    background: "#FFFDE4",
    circle: {
        x: 34.5,
        y: 65.0,
        diameter: 37.5,
        assetBounds: { canvasWidth: 1254, canvasHeight: 1254, x: 32, y: 33, width: 1187, height: 1182 }
    },
    taskFontPx: 26.25,
    taskFontWeight: 700,
    timeFontPx: 25.5,
    timeFontWeight: 700,
    unitFontPx: 13.5,
    unitFontWeight: 500,
    circleTextColor: "#F7F3E8",
    circleTextGapMm: 3.0,
    numberUnitGapMm: 0.8,
    divider: { x: 34.5, y: 65.0, width: 4.0, height: 0.2, color: "rgba(247,243,232,0.50)" },
    sidebar: {
        x: 9.5,
        y: 8.0,
        width: 5.0,
        height: 4.0,
        assetBounds: { canvasWidth: 1254, canvasHeight: 1254, x: 232, y: 411, width: 795, height: 472 }
    },
    modeIcon: { x: 60.8, y: 6.8, width: 9.8, height: 9.3 },
    timeBox: { x: 34.5, y: 117.8, width: 64.0, height: 14.5, left: 2.5, right: 66.5, top: 110.55, bottom: 125.05, cut: 2.0 },
    bookmark: {
        x: 5.75,
        y: 117.1,
        width: 2.6,
        height: 5.0,
        assetBounds: { canvasWidth: 1254, canvasHeight: 1254, x: 304, y: 218, width: 646, height: 841 }
    },
    lock: {
        x: 63.15,
        y: 117.1,
        width: 2.6,
        height: 5.0,
        assetBounds: { canvasWidth: 1254, canvasHeight: 1254, x: 223, y: 115, width: 807, height: 1044 }
    },
    track: { centerY: 117.1, centerX: 34.5, visibleLeft: 9.0, visibleRight: 59.8, leftFadeEnd: 12.0, rightFadeStart: 56.8 },
    mainLeaf: { length: 2.5, width: 1.05 },
    minorLeaf: { length: 1.3, width: 0.55 },
    selectedLeaf: { length: 5.5, width: 2.31 },
    leafGap: 1.0,
    minMinutes: 5,
    maxMinutes: 240,
    minuteStep: 5,
    cycleNodeCount: 48,
    selectedTickFontPx: 17.33,
    normalTickFontPx: 13.23,
    labelVisibleTopY: 120.85,
    normalTickWeight: 500,
    selectedTickWeight: 700,
    normalTickColor: "#6C7757",
    selectedTickColor: "#66764E",
    pageSwipe: {
        normalDistanceCssPx: 28,
        normalHorizontalRatio: 1.15,
        quickDistanceCssPx: 18,
        quickHorizontalRatio: 1.2,
        quickDurationMs: 250
    },
    snapDurationMs: 180
});

const TASK_LEAVES = Object.freeze([
    { x: 12.10, y: 57.20, length: 6.67, width: 3.59, angle: 40 },
    { x: 50.03, y: 46.50, length: 8.00, width: 4.31, angle: 325 },
    { x: 55.77, y: 54.70, length: 4.41, width: 2.36, angle: 45 },
    { x: 16.91, y: 80.63, length: 4.00, width: 2.15, angle: 305 },
    { x: 52.96, y: 84.65, length: 6.40, width: 3.45, angle: 121 }
]);

const FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const CYCLE_NODE_COUNT = HOME_SPEC.cycleNodeCount;
const TIMELINE_RENDER_RADIUS = 80;
const SAVED_MINUTES_KEY = "forcefocus_saved_minutes";
const RECENT_MINUTES_KEY = "forcefocus_recent_minutes_v1";
const MAX_RECENT_MINUTES = 3;
const DURATION_LOCKED_KEY = "forcefocus_duration_locked_v1";
const $ = selector => document.querySelector(selector);

let selectedTask = "岗位调研";
let selectedMinutes = 120;
let selectedLogicalIndex = 23;
let activeCandidateIndex = TIMELINE_RENDER_RADIUS;
let metrics = null;
let nodes = [];
let nodeElements = [];
let restPositions = [];
let currentPositions = [];
let snapAnimation = 0;
let renderedTaskLeaves = [];
let durationLocked = false;

const drag = {
    active: false,
    pointerId: null,
    startX: 0,
    lastX: 0,
    moved: false,
    positions: []
};

function fallbackMetrics() {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = window.innerWidth;
    const mmX = cssWidth / HOME_SPEC.screenWidthMm;
    return {
        fullWidthPx: Math.round(cssWidth * dpr),
        fullHeightPx: Math.round(window.innerHeight * dpr),
        density: dpr,
        dpr,
        mmX,
        mmY: mmX,
        mmU: mmX,
        statusInsetPx: 0,
        navigationInsetPx: 0
    };
}

function normalizedMetrics(value) {
    const dpr = Math.max(0.1, Number(value.density) || window.devicePixelRatio || 1);
    const fullWidthPx = Math.max(1, Number(value.fullWidthPx) || window.innerWidth * dpr);
    const fullHeightPx = Math.max(1, Number(value.fullHeightPx) || window.innerHeight * dpr);
    const mmX = (fullWidthPx / dpr) / HOME_SPEC.screenWidthMm;
    const mmY = (fullHeightPx / dpr) / HOME_SPEC.screenHeightMm;
    return {
        fullWidthPx,
        fullHeightPx,
        density: dpr,
        dpr,
        mmX,
        mmY,
        // Shape-preserving dimensions use the width-derived physical scale.
        mmU: mmX,
        statusInsetPx: Math.max(0, Number(value.statusInsetPx) || 0),
        navigationInsetPx: Math.max(0, Number(value.navigationInsetPx) || 0)
    };
}

function xPx(mm) { return mm * metrics.mmX; }
function yPx(mm) { return mm * metrics.mmY; }
function uPx(mm) { return mm * metrics.mmU; }

function setRect(element, x, y, width, height, preserveShape = true) {
    const sizeX = preserveShape ? uPx(width) : xPx(width);
    const sizeY = preserveShape ? uPx(height) : yPx(height);
    element.style.left = `${xPx(x)}px`;
    element.style.top = `${yPx(y)}px`;
    element.style.width = `${sizeX}px`;
    element.style.height = `${sizeY}px`;
}

function fitAssetToVisibleBounds(element, widthMm, heightMm, bounds) {
    const image = element.querySelector("img");
    const targetWidth = uPx(widthMm);
    const targetHeight = uPx(heightMm);
    const scale = Math.min(targetWidth / bounds.width, targetHeight / bounds.height);
    const visibleWidth = bounds.width * scale;
    const visibleHeight = bounds.height * scale;
    image.style.position = "absolute";
    image.style.left = `${(targetWidth - visibleWidth) / 2 - bounds.x * scale}px`;
    image.style.top = `${(targetHeight - visibleHeight) / 2 - bounds.y * scale}px`;
    image.style.right = "auto";
    image.style.bottom = "auto";
    image.style.width = `${bounds.canvasWidth * scale}px`;
    image.style.height = `${bounds.canvasHeight * scale}px`;
    image.style.objectFit = "contain";
}

function configuredWorkItems() {
    if (window.ForceFocusSidebar && typeof window.ForceFocusSidebar.getWorkItems === "function") {
        const values = window.ForceFocusSidebar.getWorkItems();
        if (Array.isArray(values) && values.length) return values.slice(0, 4);
    }
    return [
        { id: "resume", slot: 0, name: "简历", whitelist: ["wps"] },
        { id: "job_research", slot: 1, name: "岗位调研", whitelist: ["wps", "xiaohongshu"] },
        { id: "civil_service", slot: 2, name: "考公", whitelist: ["fenbi"] },
        { id: "listening", slot: 3, name: "磨耳朵", whitelist: ["recorder", "wps"] }
    ];
}

function taskLeafBindings() {
    const slotSpecs = [[0], [1, 2], [3], [4]];
    return configuredWorkItems().slice().sort((a,b)=>Number(a.slot)-Number(b.slot)).flatMap((item,index)=>{
        const slot=Number.isInteger(Number(item.slot))?Number(item.slot):index;
        return (slotSpecs[slot]||[]).map(specIndex=>({specIndex,item}));
    });
}

function createTaskLeaves() {
    const holder = $("#taskLeaves");
    holder.replaceChildren();
    renderedTaskLeaves = taskLeafBindings();
    nodeElements.task = [];
    renderedTaskLeaves.forEach((binding, index) => {
        const spec = TASK_LEAVES[binding.specIndex];
        const button = document.createElement("button");
        button.type = "button";
        button.className = "task-leaf";
        button.dataset.taskId = binding.item.id;
        button.dataset.task = binding.item.name;
        button.setAttribute("aria-label", `选择${binding.item.name}`);
        button.innerHTML = '<img src="ui/timeline_leaf.png" alt="" draggable="false">';
        button.addEventListener("click", event => {
            event.stopPropagation();
            setSelectedTask(binding.item.name);
        });
        holder.appendChild(button);
        nodeElements.task[index] = button;
    });
}

function minutesFromIndex(index) {
    const normalized = ((index % CYCLE_NODE_COUNT) + CYCLE_NODE_COUNT) % CYCLE_NODE_COUNT;
    return (normalized + 1) * HOME_SPEC.minuteStep;
}

function logicalIndexFromMinutes(minutes) {
    return Math.round(normalizeMinutes(minutes) / HOME_SPEC.minuteStep) - 1;
}

function normalizeMinutes(minutes) {
    const value = Number(minutes);
    if (!Number.isFinite(value)) return 120;
    const stepIndex = Math.round(value / HOME_SPEC.minuteStep) - 1;
    return minutesFromIndex(stepIndex);
}

function nodeFromLogicalIndex(logicalIndex) {
    const minutes = minutesFromIndex(logicalIndex);
    const main = minutes % 30 === 0;
    return {
        logicalIndex,
        minutes,
        main,
        normalWidth: main ? HOME_SPEC.mainLeaf.width : HOME_SPEC.minorLeaf.width,
        normalLength: main ? HOME_SPEC.mainLeaf.length : HOME_SPEC.minorLeaf.length
    };
}

function createTimeline(anchorLogicalIndex = selectedLogicalIndex) {
    nodes = [];
    for (let offset = -TIMELINE_RENDER_RADIUS; offset <= TIMELINE_RENDER_RADIUS; offset += 1) {
        nodes.push(nodeFromLogicalIndex(anchorLogicalIndex + offset));
    }
    const holder = $("#timelineNodes");
    holder.replaceChildren();
    nodeElements = nodeElements.task ? { task: nodeElements.task } : {};
    nodeElements.timeline = nodes.map(node => {
        const image = document.createElement("img");
        image.className = "timeline-leaf";
        image.src = "ui/timeline_leaf.png";
        image.alt = "";
        image.draggable = false;
        image.dataset.minutes = String(node.minutes);
        holder.appendChild(image);
        return image;
    });
}

function buildBasePositions(anchorIndex) {
    const positions = new Array(nodes.length);
    positions[anchorIndex] = HOME_SPEC.track.centerX;
    for (let index = anchorIndex + 1; index < nodes.length; index += 1) {
        positions[index] = positions[index - 1]
            + nodes[index - 1].normalWidth / 2
            + HOME_SPEC.leafGap
            + nodes[index].normalWidth / 2;
    }
    for (let index = anchorIndex - 1; index >= 0; index -= 1) {
        positions[index] = positions[index + 1]
            - nodes[index + 1].normalWidth / 2
            - HOME_SPEC.leafGap
            - nodes[index].normalWidth / 2;
    }
    return positions;
}

function drawTimelineLabels(positions, visualSelectedIndex) {
    const canvas = $("#timelineLabels");
    const viewportWidth = xPx(HOME_SPEC.track.visibleRight - HOME_SPEC.track.visibleLeft);
    const viewportHeight = yPx(18.5);
    const dpr = metrics.dpr;
    canvas.width = Math.max(1, Math.round(viewportWidth * dpr));
    canvas.height = Math.max(1, Math.round(viewportHeight * dpr));
    canvas.style.width = `${viewportWidth}px`;
    canvas.style.height = `${viewportHeight}px`;
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.textAlign = "center";
    context.textBaseline = "alphabetic";

    const glyphTop = yPx(HOME_SPEC.labelVisibleTopY - HOME_SPEC.timeBox.top);
    nodes.forEach((node, index) => {
        if (!node.main) return;
        const selected = index === visualSelectedIndex;
        const fontSize = selected ? HOME_SPEC.selectedTickFontPx : HOME_SPEC.normalTickFontPx;
        const fontWeight = selected ? HOME_SPEC.selectedTickWeight : HOME_SPEC.normalTickWeight;
        context.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
        context.fillStyle = selected ? HOME_SPEC.selectedTickColor : HOME_SPEC.normalTickColor;
        const measured = context.measureText(String(node.minutes));
        const ascent = measured.actualBoundingBoxAscent || fontSize * 0.78;
        const localX = xPx(positions[index] - HOME_SPEC.track.visibleLeft);
        context.fillText(String(node.minutes), localX, glyphTop + ascent);
    });
}

function candidateProgress(positions, candidateIndex) {
    const centerX = HOME_SPEC.track.centerX;
    const candidateX = positions[candidateIndex];
    const distance = Math.abs(candidateX - centerX);
    let neighborIndex;
    if (candidateX < centerX) {
        neighborIndex = candidateIndex + 1;
    } else if (candidateX > centerX) {
        neighborIndex = candidateIndex - 1;
    } else {
        const leftDistance = candidateIndex > 0
            ? Math.abs(candidateX - positions[candidateIndex - 1])
            : Infinity;
        const rightDistance = candidateIndex < positions.length - 1
            ? Math.abs(positions[candidateIndex + 1] - candidateX)
            : Infinity;
        const nearestGap = Math.min(leftDistance, rightDistance);
        return Number.isFinite(nearestGap) ? 1 : 0;
    }
    if (neighborIndex < 0 || neighborIndex >= positions.length) return 0;
    const boundaryDistance = Math.abs(positions[neighborIndex] - candidateX) / 2;
    if (boundaryDistance <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - distance / boundaryDistance));
}

function renderTimeline(positions, candidateIndex = nearestNodeIndex(positions)) {
    currentPositions = positions.slice();
    activeCandidateIndex = candidateIndex;
    const progress = candidateProgress(positions, candidateIndex);
    const centerY = yPx(HOME_SPEC.track.centerY - HOME_SPEC.timeBox.top);
    nodeElements.timeline.forEach((image, index) => {
        const active = index === candidateIndex;
        const width = active
            ? nodes[index].normalWidth + progress * (HOME_SPEC.selectedLeaf.width - nodes[index].normalWidth)
            : nodes[index].normalWidth;
        const length = active
            ? nodes[index].normalLength + progress * (HOME_SPEC.selectedLeaf.length - nodes[index].normalLength)
            : nodes[index].normalLength;
        image.style.left = `${xPx(positions[index] - HOME_SPEC.track.visibleLeft)}px`;
        image.style.top = `${centerY}px`;
        image.style.width = `${uPx(width)}px`;
        image.style.height = `${uPx(length)}px`;
    });
    drawTimelineLabels(positions, candidateIndex);
}

function canvasMetrics(context, text) {
    const value = context.measureText(text);
    const fontMatch = context.font.match(/([0-9]+(?:\.[0-9]+)?)px/);
    const fontSize = fontMatch ? Number(fontMatch[1]) : 16;
    return {
        width: value.width,
        ascent: value.actualBoundingBoxAscent || fontSize * 0.78,
        descent: value.actualBoundingBoxDescent || fontSize * 0.18
    };
}

function drawCircleText() {
    const canvas = $("#circleText");
    const size = uPx(HOME_SPEC.circle.diameter);
    const dpr = metrics.dpr;
    canvas.width = Math.max(1, Math.round(size * dpr));
    canvas.height = Math.max(1, Math.round(size * dpr));
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = HOME_SPEC.circleTextColor;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";

    const dividerCenterY = size / 2;
    const dividerWidth = uPx(HOME_SPEC.divider.width);
    const dividerHeight = Math.max(1 / dpr, uPx(HOME_SPEC.divider.height));
    context.fillStyle = HOME_SPEC.divider.color;
    context.fillRect((size - dividerWidth) / 2, dividerCenterY - dividerHeight / 2, dividerWidth, dividerHeight);

    context.fillStyle = HOME_SPEC.circleTextColor;
    context.font = `${HOME_SPEC.taskFontWeight} ${HOME_SPEC.taskFontPx}px ${FONT_FAMILY}`;
    const taskMetrics = canvasMetrics(context, selectedTask);
    const taskVisibleBottom = dividerCenterY - dividerHeight / 2 - uPx(HOME_SPEC.circleTextGapMm);
    context.fillText(selectedTask, size / 2, taskVisibleBottom - taskMetrics.descent);

    const minutesText = String(selectedMinutes);
    const unitText = "分钟";
    context.font = `${HOME_SPEC.timeFontWeight} ${HOME_SPEC.timeFontPx}px ${FONT_FAMILY}`;
    const numberMetrics = canvasMetrics(context, minutesText);
    context.font = `${HOME_SPEC.unitFontWeight} ${HOME_SPEC.unitFontPx}px ${FONT_FAMILY}`;
    const unitMetrics = canvasMetrics(context, unitText);
    const groupGap = uPx(HOME_SPEC.numberUnitGapMm);
    const groupWidth = numberMetrics.width + groupGap + unitMetrics.width;
    const groupLeft = (size - groupWidth) / 2;
    const numberVisibleTop = dividerCenterY + dividerHeight / 2 + uPx(HOME_SPEC.circleTextGapMm);
    const numberBaseline = numberVisibleTop + numberMetrics.ascent;
    const commonVisibleBottom = numberBaseline + numberMetrics.descent;

    context.textAlign = "left";
    context.font = `${HOME_SPEC.timeFontWeight} ${HOME_SPEC.timeFontPx}px ${FONT_FAMILY}`;
    context.fillText(minutesText, groupLeft, numberBaseline);
    context.font = `${HOME_SPEC.unitFontWeight} ${HOME_SPEC.unitFontPx}px ${FONT_FAMILY}`;
    context.fillText(unitText, groupLeft + numberMetrics.width + groupGap, commonVisibleBottom - unitMetrics.descent);
}

function setSelectedTask(task) {
    if (!configuredWorkItems().some(item => item.name === task)) return;
    selectedTask = task;
    drawCircleText();
    $("#focusCircle").setAttribute("aria-label", `进入${task}专注，${selectedMinutes}分钟`);
}

function updateSelectedMinutesPreview(minutes) {
    const normalized = normalizeMinutes(minutes);
    selectedMinutes = normalized;
    $("#timelineViewport").setAttribute("aria-valuenow", String(normalized));
    $("#timelineViewport").setAttribute("aria-valuetext", `${normalized} 分钟`);
    $("#focusCircle").setAttribute("aria-label", `进入${selectedTask}专注，${normalized}分钟`);
    drawCircleText();
}

function setSelectedMinutes(minutes, options = {}) {
    const normalized = normalizeMinutes(minutes);
    selectedLogicalIndex = logicalIndexFromMinutes(normalized);
    updateSelectedMinutesPreview(normalized);
    if (options.render !== false) {
        createTimeline(selectedLogicalIndex);
        activeCandidateIndex = TIMELINE_RENDER_RADIUS;
        restPositions = buildBasePositions(activeCandidateIndex);
        renderTimeline(restPositions, activeCandidateIndex);
    }
}

function setSelectedLogicalIndex(logicalIndex) {
    selectedLogicalIndex = logicalIndex;
    updateSelectedMinutesPreview(minutesFromIndex(selectedLogicalIndex));
    createTimeline(selectedLogicalIndex);
    activeCandidateIndex = TIMELINE_RENDER_RADIUS;
    restPositions = buildBasePositions(activeCandidateIndex);
    renderTimeline(restPositions, activeCandidateIndex);
}

function normalizeRecentMinutes(values) {
    const distinct = [];
    (Array.isArray(values) ? values : []).forEach(value => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < HOME_SPEC.minMinutes || numeric > HOME_SPEC.maxMinutes) return;
        const safe = normalizeMinutes(numeric);
        if (!distinct.includes(safe)) distinct.push(safe);
    });
    return distinct.slice(0, MAX_RECENT_MINUTES);
}

function readRememberedMinutes() {
    try {
        return normalizeRecentMinutes(JSON.parse(localStorage.getItem(RECENT_MINUTES_KEY) || "[]"));
    } catch (_error) {
        return [];
    }
}

function renderMemoryDropdown(values = readRememberedMinutes()) {
    const dropdown = $("#memoryDropdown");
    const list = $("#memoryDropdownList");
    if (!dropdown || !list) return;
    list.replaceChildren();
    normalizeRecentMinutes(values).forEach(minutes => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "memory-option";
        option.setAttribute("role", "menuitem");
        option.dataset.minutes = String(minutes);
        option.textContent = `${minutes} 分钟`;
        list.appendChild(option);
    });
}

function writeRememberedMinutes(values) {
    const recent = normalizeRecentMinutes(values);
    try {
        localStorage.setItem(RECENT_MINUTES_KEY, JSON.stringify(recent));
        if (recent.length) localStorage.setItem(SAVED_MINUTES_KEY, String(recent[0]));
    } catch (_error) { /* local fallback unavailable */ }
    try {
        if (recent.length && window.NativeBridge && typeof window.NativeBridge.saveRememberedMinutes === "function") {
            window.NativeBridge.saveRememberedMinutes(recent[0]);
        }
    } catch (_error) { /* native bridge unavailable in browser preview */ }
    renderMemoryDropdown(recent);
    return recent;
}

function rememberRecentMinutes(minutes) {
    const safe = normalizeMinutes(minutes);
    return writeRememberedMinutes([safe, ...readRememberedMinutes().filter(value => value !== safe)]);
}

function saveRememberedMinutes(minutes) {
    return rememberRecentMinutes(minutes);
}

function restoreRememberedMinutes() {
    const recent = readRememberedMinutes();
    if (recent.length) return recent[0];
    let restored = -1;
    try {
        if (window.NativeBridge && typeof window.NativeBridge.restoreRememberedMinutes === "function") {
            restored = Number(window.NativeBridge.restoreRememberedMinutes());
        }
    } catch (_error) { /* use local fallback */ }
    if (!Number.isFinite(restored) || restored < HOME_SPEC.minMinutes || restored > HOME_SPEC.maxMinutes) {
        try { restored = Number(localStorage.getItem(SAVED_MINUTES_KEY)); } catch (_error) { restored = -1; }
    }
    if (!Number.isFinite(restored) || restored < HOME_SPEC.minMinutes || restored > HOME_SPEC.maxMinutes) {
        return 120;
    }
    const safe = normalizeMinutes(restored);
    writeRememberedMinutes([safe]);
    return safe;
}

function setMemoryDropdownOpen(open) {
    const dropdown = $("#memoryDropdown");
    const button = $("#memoryButton");
    if (!dropdown || !button) return;
    dropdown.classList.toggle("is-open", Boolean(open));
    dropdown.setAttribute("aria-hidden", open ? "false" : "true");
    button.setAttribute("aria-expanded", open ? "true" : "false");
}

function toggleMemoryDropdown() {
    renderMemoryDropdown();
    setMemoryDropdownOpen(!$("#memoryDropdown").classList.contains("is-open"));
}

function callNative(name, ...args) {
    try {
        const bridge = window.NativeBridge;
        if (bridge && typeof bridge[name] === "function") bridge[name](...args);
    } catch (_error) { /* TODO callbacks intentionally have no prototype UI */ }
    window.dispatchEvent(new CustomEvent(`forcefocus:${name}`, { detail: args }));
}

function enterFocus(task, minutes) {
    rememberRecentMinutes(minutes);
    setMemoryDropdownOpen(false);
    if (window.ForceFocusData) window.ForceFocusData.endHomeVisible();
    callNative("enterFocus", task, minutes);
}
function onModeIconClick() { callNative("onModeIconClick"); }
function onSidebarClick() {
    const button = $("#sidebarButton");
    if (button) {
        button.classList.remove("play-sidebar-feedback");
        void button.offsetWidth;
        button.classList.add("play-sidebar-feedback");
        window.setTimeout(() => button.classList.remove("play-sidebar-feedback"), 160);
    }
    if (window.ForceFocusSidebar && typeof window.ForceFocusSidebar.open === "function") {
        window.ForceFocusSidebar.open();
        return;
    }
    callNative("onSidebarClick");
}
function applyDurationLockState(animate=false){const h=$("#home"),b=$("#lockButton");h.classList.toggle("duration-locked",durationLocked);b.setAttribute("aria-pressed",durationLocked?"true":"false");b.setAttribute("aria-label",durationLocked?"解除时长锁定":"锁定当前时长");if(animate){b.classList.remove("play-lock-feedback");void b.offsetWidth;b.classList.add("play-lock-feedback");setTimeout(()=>b.classList.remove("play-lock-feedback"),320)}}
function onDurationLockClick(){durationLocked=!durationLocked;try{localStorage.setItem(DURATION_LOCKED_KEY,durationLocked?"1":"0")}catch(e){}applyDurationLockState(true);callNative("onDurationLockClick")}
function onSwipeRightToCalendar() {
    window.dispatchEvent(new CustomEvent("forcefocus:onSwipeRightToCalendar", { detail: [] }));
}

function nearestNodeIndex(positions) {
    let best = 0;
    let bestDistance = Infinity;
    positions.forEach((position, index) => {
        const distance = Math.abs(position - HOME_SPEC.track.centerX);
        if (distance < bestDistance) {
            best = index;
            bestDistance = distance;
        }
    });
    return best;
}

function animateSnap(from, targetIndex) {
    cancelAnimationFrame(snapAnimation);
    const targetLogicalIndex = nodes[targetIndex].logicalIndex;
    const targetMinutes = nodes[targetIndex].minutes;
    const remainingOffset = HOME_SPEC.track.centerX - from[targetIndex];
    const started = performance.now();
    const animate = now => {
        const raw = Math.min(1, (now - started) / HOME_SPEC.snapDurationMs);
        const eased = 1 - Math.pow(1 - raw, 3);
        const frame = from.map(value => value + remainingOffset * eased);
        renderTimeline(frame, targetIndex);
        if (raw < 1) {
            snapAnimation = requestAnimationFrame(animate);
        } else {
            selectedLogicalIndex = targetLogicalIndex;
            updateSelectedMinutesPreview(targetMinutes);
            createTimeline(selectedLogicalIndex);
            activeCandidateIndex = TIMELINE_RENDER_RADIUS;
            restPositions = buildBasePositions(activeCandidateIndex);
            renderTimeline(restPositions, activeCandidateIndex);
        }
    };
    snapAnimation = requestAnimationFrame(animate);
}

function installTimelineGestures() {
    const viewport = $("#timelineViewport");
    viewport.addEventListener("pointerdown", event => {
        if(durationLocked){event.preventDefault();return;}
        event.preventDefault();
        cancelAnimationFrame(snapAnimation);
        drag.active = true;
        drag.pointerId = event.pointerId;
        drag.startX = event.clientX;
        drag.lastX = event.clientX;
        drag.moved = false;
        drag.positions = (currentPositions.length ? currentPositions : restPositions).slice();
        activeCandidateIndex = nearestNodeIndex(drag.positions);
        updateSelectedMinutesPreview(nodes[activeCandidateIndex].minutes);
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add("dragging");
        renderTimeline(drag.positions, activeCandidateIndex);
    });

    viewport.addEventListener("pointermove", event => {
        if (!drag.active || event.pointerId !== drag.pointerId) return;
        event.preventDefault();
        const deltaPx = event.clientX - drag.lastX;
        drag.lastX = event.clientX;
        if (Math.abs(event.clientX - drag.startX) > 1) drag.moved = true;
        const deltaMm = deltaPx / metrics.mmX;
        drag.positions = drag.positions.map(position => position + deltaMm);
        activeCandidateIndex = nearestNodeIndex(drag.positions);
        updateSelectedMinutesPreview(nodes[activeCandidateIndex].minutes);
        renderTimeline(drag.positions, activeCandidateIndex);
    });

    const finish = event => {
        if (!drag.active || event.pointerId !== drag.pointerId) return;
        event.preventDefault();
        drag.active = false;
        viewport.classList.remove("dragging");
        if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
        const targetIndex = nearestNodeIndex(drag.positions);
        activeCandidateIndex = targetIndex;
        updateSelectedMinutesPreview(nodes[targetIndex].minutes);
        animateSnap(drag.positions.slice(), targetIndex);
    };
    viewport.addEventListener("pointerup", finish);
    viewport.addEventListener("pointercancel", finish);

    viewport.addEventListener("keydown", event => {
        if(durationLocked){event.preventDefault();return;}
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        setSelectedLogicalIndex(selectedLogicalIndex + direction);
    });
}

function installSwipeRightGesture() {
    const home = $("#home");
    let swipe = null;
    let suppressClickUntil = 0;

    const pageSwipeIsUnavailable = () => home.classList.contains("focus-active")
        || home.classList.contains("calendar-active")
        || home.classList.contains("focus-branch-gesture-active")
        || Boolean(window.ForceFocusFocus && window.ForceFocusFocus.isActive());

    const startsInsideHorizontalControl = target => Boolean(target.closest(
        "#timelineViewport, #timeBox, .timeline-viewport, [data-horizontal-drag]"
    ));

    home.addEventListener("pointerdown", event => {
        if (event.isPrimary === false || event.button > 0 || pageSwipeIsUnavailable()
                || startsInsideHorizontalControl(event.target)) {
            swipe = null;
            return;
        }
        swipe = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            currentX: event.clientX,
            currentY: event.clientY,
            startedAt: performance.now(),
            dragging: false
        };
    });

    window.addEventListener("pointermove", event => {
        if (!swipe || swipe.id !== event.pointerId) return;
        swipe.currentX = event.clientX;
        swipe.currentY = event.clientY;
        const deltaX = event.clientX - swipe.x;
        const deltaY = event.clientY - swipe.y;
        if (!swipe.dragging && deltaX < 0 && Math.abs(deltaX) >= 6
                && Math.abs(deltaX) > Math.abs(deltaY) * 1.05) {
            swipe.dragging = true;
            if (window.ForceFocusCalendar) window.ForceFocusCalendar.beginPageSwipe(false);
            try { home.setPointerCapture(event.pointerId); }
            catch (_error) { /* Window listeners still preserve the gesture. */ }
        }
        if (!swipe.dragging) return;
        event.preventDefault();
        if (window.ForceFocusCalendar) {
            const width = Math.max(1, home.getBoundingClientRect().width);
            window.ForceFocusCalendar.setPageProgress(Math.max(0, Math.min(1, -deltaX / width)));
        }
    }, { passive: false });

    const finish = event => {
        if (pageSwipeIsUnavailable()) {
            swipe = null;
            return;
        }
        if (!swipe || swipe.id !== event.pointerId) return;
        const deltaX = event.clientX - swipe.x;
        const deltaY = event.clientY - swipe.y;
        const duration = performance.now() - swipe.startedAt;
        const wasDragging = swipe.dragging;
        swipe = null;
        const distanceX = Math.abs(deltaX);
        const distanceY = Math.abs(deltaY);
        const normalSwipe = distanceX >= HOME_SPEC.pageSwipe.normalDistanceCssPx
            && distanceX > distanceY * HOME_SPEC.pageSwipe.normalHorizontalRatio;
        const quickSwipe = duration <= HOME_SPEC.pageSwipe.quickDurationMs
            && distanceX >= HOME_SPEC.pageSwipe.quickDistanceCssPx
            && distanceX > distanceY * HOME_SPEC.pageSwipe.quickHorizontalRatio;
        const shouldOpen = deltaX < 0 && (normalSwipe || quickSwipe);
        if (wasDragging) {
            suppressClickUntil = performance.now() + 350;
            try {
                if (home.hasPointerCapture(event.pointerId)) home.releasePointerCapture(event.pointerId);
            } catch (_error) { /* Capture may already be released. */ }
            if (shouldOpen) onSwipeRightToCalendar();
            else if (window.ForceFocusCalendar) window.ForceFocusCalendar.settlePage(false);
        } else if (shouldOpen) {
            suppressClickUntil = performance.now() + 350;
            onSwipeRightToCalendar();
        }
    };
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", event => {
        if (swipe && swipe.id === event.pointerId) {
            const wasDragging = swipe.dragging;
            swipe = null;
            if (wasDragging && window.ForceFocusCalendar) window.ForceFocusCalendar.settlePage(false);
        }
    }, true);
    home.addEventListener("click", event => {
        if (performance.now() >= suppressClickUntil) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
}

function applyLayout() {
    const home = $("#home");
    home.style.width = `${xPx(HOME_SPEC.screenWidthMm)}px`;
    home.style.height = `${yPx(HOME_SPEC.contentHeightMm)}px`;

    setRect($("#sidebarButton"), HOME_SPEC.sidebar.x, HOME_SPEC.sidebar.y, HOME_SPEC.sidebar.width, HOME_SPEC.sidebar.height);
    setRect($("#modeButton"), HOME_SPEC.modeIcon.x, HOME_SPEC.modeIcon.y, HOME_SPEC.modeIcon.width, HOME_SPEC.modeIcon.height);
    setRect($("#focusCircle"), HOME_SPEC.circle.x, HOME_SPEC.circle.y, HOME_SPEC.circle.diameter, HOME_SPEC.circle.diameter);
    fitAssetToVisibleBounds($("#sidebarButton"), HOME_SPEC.sidebar.width, HOME_SPEC.sidebar.height, HOME_SPEC.sidebar.assetBounds);
    fitAssetToVisibleBounds($("#focusCircle"), HOME_SPEC.circle.diameter, HOME_SPEC.circle.diameter, HOME_SPEC.circle.assetBounds);

    renderedTaskLeaves.forEach((binding, index) => {
        const spec = TASK_LEAVES[binding.specIndex];
        const element = nodeElements.task[index];
        setRect(element, spec.x, spec.y, spec.width, spec.length);
        element.style.transform = "translate(-50%, -50%)";
        element.querySelector("img").style.transform = `rotate(${spec.angle}deg)`;
    });

    const timeBox = $("#timeBox");
    timeBox.style.left = `${xPx(HOME_SPEC.timeBox.left)}px`;
    timeBox.style.top = `${yPx(HOME_SPEC.timeBox.top)}px`;
    timeBox.style.width = `${xPx(HOME_SPEC.timeBox.width)}px`;
    timeBox.style.height = `${yPx(18.5)}px`;
    timeBox.style.setProperty("--cut", `${uPx(HOME_SPEC.timeBox.cut)}px`);
    $(".time-box-shadow").style.height = `${yPx(HOME_SPEC.timeBox.height)}px`;

    const viewport = $("#timelineViewport");
    viewport.style.left = `${xPx(HOME_SPEC.track.visibleLeft - HOME_SPEC.timeBox.left)}px`;
    viewport.style.top = "0px";
    viewport.style.width = `${xPx(HOME_SPEC.track.visibleRight - HOME_SPEC.track.visibleLeft)}px`;
    viewport.style.height = `${yPx(18.5)}px`;
    const leftFade = xPx(HOME_SPEC.track.leftFadeEnd - HOME_SPEC.track.visibleLeft);
    const rightFade = xPx(HOME_SPEC.track.visibleRight - HOME_SPEC.track.rightFadeStart);
    const fade = `linear-gradient(to right, rgba(0,0,0,.15) 0, #000 ${leftFade}px, #000 calc(100% - ${rightFade}px), rgba(0,0,0,.15) 100%)`;
    viewport.style.webkitMaskImage = fade;
    viewport.style.maskImage = fade;

    setRect(
        $("#memoryButton"),
        HOME_SPEC.bookmark.x - HOME_SPEC.timeBox.left,
        HOME_SPEC.bookmark.y - HOME_SPEC.timeBox.top,
        HOME_SPEC.bookmark.width,
        HOME_SPEC.bookmark.height
    );
    setRect(
        $("#lockButton"),
        HOME_SPEC.lock.x - HOME_SPEC.timeBox.left,
        HOME_SPEC.lock.y - HOME_SPEC.timeBox.top,
        HOME_SPEC.lock.width,
        HOME_SPEC.lock.height
    );
    fitAssetToVisibleBounds($("#memoryButton"), HOME_SPEC.bookmark.width, HOME_SPEC.bookmark.height, HOME_SPEC.bookmark.assetBounds);
    fitAssetToVisibleBounds($("#lockButton"), HOME_SPEC.lock.width, HOME_SPEC.lock.height, HOME_SPEC.lock.assetBounds);
    const memoryDropdown = $("#memoryDropdown");
    memoryDropdown.style.left = `${xPx(0.2)}px`;
    memoryDropdown.style.bottom = `${yPx(15.5)}px`;
    memoryDropdown.style.width = `${xPx(16.5)}px`;
    memoryDropdown.style.setProperty("--memory-option-height", `${yPx(5.2)}px`);
    memoryDropdown.querySelectorAll(".memory-option").forEach(option => {
        option.style.height = `${yPx(5.2)}px`;
    });

    drawCircleText();
    activeCandidateIndex = TIMELINE_RENDER_RADIUS;
    restPositions = buildBasePositions(activeCandidateIndex);
    renderTimeline(restPositions, activeCandidateIndex);
}

window.setForceFocusMetrics = value => {
    metrics = normalizedMetrics(value || {});
    applyLayout();
    window.dispatchEvent(new CustomEvent("forcefocus:metrics", { detail: metrics }));
};

window.getForceFocusMetrics = () => metrics;

function initialize() {
    metrics = fallbackMetrics();
    createTaskLeaves();
    selectedMinutes = restoreRememberedMinutes();
    try{durationLocked=localStorage.getItem(DURATION_LOCKED_KEY)==="1"}catch(e){durationLocked=false}
    selectedLogicalIndex = logicalIndexFromMinutes(selectedMinutes);
    createTimeline(selectedLogicalIndex);
    applyLayout();
    installTimelineGestures();
    installSwipeRightGesture();
    renderMemoryDropdown();
    applyDurationLockState(false);
    if (window.ForceFocusData) window.ForceFocusData.beginHomeVisible();

    $("#sidebarButton").addEventListener("click", event => { event.stopPropagation(); onSidebarClick(); });
    $("#modeButton").addEventListener("click", event => { event.stopPropagation(); onModeIconClick(); });
    $("#memoryButton").addEventListener("click", event => { event.stopPropagation(); toggleMemoryDropdown(); });
    $("#memoryDropdown").addEventListener("click", event => {
        const option = event.target.closest(".memory-option");
        if (!option) return;
        event.stopPropagation();
        const minutes = Number(option.dataset.minutes);
        setSelectedMinutes(minutes);
        setMemoryDropdownOpen(false);
    });
    document.addEventListener("pointerdown", event => {
        if (event.target.closest("#memoryButton, #memoryDropdown")) return;
        setMemoryDropdownOpen(false);
    });
    $("#lockButton").addEventListener("click", event => { event.stopPropagation(); onDurationLockClick(); });
    $("#focusCircle").addEventListener("click", event => { event.stopPropagation(); enterFocus(selectedTask, selectedMinutes); });
    window.addEventListener("forcefocus:workitemschange", () => {
        const items = configuredWorkItems();
        if (!items.some(item => item.name === selectedTask)) selectedTask = items[0].name;
        createTaskLeaves();
        applyLayout();
    });

    window.setSelectedTask = setSelectedTask;
    window.setSelectedMinutes = setSelectedMinutes;
    window.saveRememberedMinutes = saveRememberedMinutes;
    window.restoreRememberedMinutes = restoreRememberedMinutes;
    window.getRememberedMinutes = readRememberedMinutes;
    window.enterFocus = enterFocus;
    window.onModeIconClick = onModeIconClick;
    window.onSidebarClick = onSidebarClick;
    window.onDurationLockClick = onDurationLockClick;
    window.onSwipeRightToCalendar = onSwipeRightToCalendar;
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            drawCircleText();
            drawTimelineLabels(currentPositions.length ? currentPositions : restPositions, activeCandidateIndex);
        });
    }
    document.addEventListener("visibilitychange", () => {
        if (!window.ForceFocusData) return;
        if (document.hidden) {
            window.ForceFocusData.endHomeVisible();
            return;
        }
        const home = $("#home");
        const focusActive = Boolean(window.ForceFocusFocus && window.ForceFocusFocus.isActive());
        if (!focusActive && !home.classList.contains("calendar-active")) {
            window.ForceFocusData.beginHomeVisible();
        }
    });
}

document.addEventListener("DOMContentLoaded", initialize, { once: true });
