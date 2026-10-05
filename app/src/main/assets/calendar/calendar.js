"use strict";

(() => {
    const SPEC = Object.freeze({
        designWidth: 69.0,
        designHeight: 138.7,
        columns: Object.freeze([6.0, 15.5, 25.0, 34.5, 44.0, 53.5, 63.0]),
        rows: Object.freeze([28.7, 39.6, 50.5, 61.4, 72.3, 83.2]),
        month: { x: 34.5, y: 9.65 },
        previous: { x: 6.0, y: 9.65 },
        next: { x: 63.0, y: 9.65 },
        arrowHit: 7.0,
        weekdayY: 20.0,
        leaf: { width: 5.71824, height: 5.40056 },
        dateOffsetY: 5.3,
        todayDot: { diameter: 0.49, offsetY: -1.7 },
        dateHit: { width: 8.6, height: 11.2, offsetY: 2.8 },
        mark: { diameter: 8.0, todayDiameter: 8.0, todayOffsetY: 0.0 },
        focusSpider: { width: 4.793, height: 4.394 },
        decorSpider: { gap: 1.0 },
        pullSpider: { x: 53.5, y: 88.8, width: 7.1895, height: 6.591, hitSize: 11.0 },
        spiderMaxDrag: 8.0,
        ticketDragRange: 12.0,
        ticketOpenThreshold: 6.0,
        ticket: { left: 3.0, width: 63.0, height: 40.0, closedTop: 139.0, openTop: 96.0 },
        personaImage: { left: 2.0, top: 1.0, width: 28.8, height: 33.0 },
        personaName: { left: 33.0, top: 5.0, width: 26.0, height: 10.0 },
        personaComment: { left: 33.0, top: 16.0, width: 26.0, height: 16.0 },
        dots: { x: 34.5, y: 131.0, diameter: 1.1, centerGap: 3.0 },
        baseDate: Date.UTC(2026, 8, 1),
        templateCount: 45
    });

    const DEBUG_CALENDAR_MOCK = false;

    const home = document.querySelector("#home");
    const homeVisualLayer = document.querySelector("#homeVisualLayer");
    const layer = document.querySelector("#calendarLayer");
    const title = document.querySelector("#calendarMonthTitle");
    const previousButton = document.querySelector("#calendarPreviousMonth");
    const nextButton = document.querySelector("#calendarNextMonth");
    const weekdays = document.querySelector("#calendarWeekdays");
    const dates = document.querySelector("#calendarDates");
    const decorSpider = document.querySelector("#calendarDecorSpider");
    const pullSpider = document.querySelector("#calendarPullSpider");
    const pullSpiderHit = document.querySelector("#calendarPullSpiderHit");
    const ticket = document.querySelector("#calendarTicket");
    const ticketTrack = document.querySelector("#calendarTicketTrack");
    const ticketDots = document.querySelector("#calendarTicketDots");

    const now = new Date();
    let displayedYear = now.getFullYear();
    let displayedMonth = now.getMonth();
    let ticketProgress = 0;
    let ticketOpen = false;
    let activePersonaPage = 0;
    let personaDateKey = null;
    let personas = [];
    let selectedPersonaId = null;
    let spiderGesture = null;
    let spiderOffsetMm = 0;
    let spiderOffsetAnimation = 0;
    let ticketSwipe = null;
    let calendarPageSwipe = null;
    let calendarDateTap = null;
    let pageTransitionTimer = 0;
    let pageProgress = 0;
    let pageTransitionTarget = null;
    let suppressDateClickUntil = 0;
    let debugLeafAlignment = false;
    let calendarPrepared = false;
    const MARKED_DATES_KEY = "forcefocus_calendar_marked_dates";
    const markedDates = readMarkedDates();

    function xPercent(mm) { return `${(mm / SPEC.designWidth) * 100}%`; }
    function yPercent(mm) { return `${(mm / SPEC.designHeight) * 100}%`; }
    function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
    function pad2(value) { return value < 10 ? `0${value}` : String(value); }

    function dateKey(year, month, day) {
        return `${year}-${pad2(month + 1)}-${pad2(day)}`;
    }

    function readMarkedDates() {
        let parsed = null;
        try {
            const bridge = window.NativeBridge;
            if (bridge && typeof bridge.getCalendarMarkedDates === "function") {
                parsed = JSON.parse(bridge.getCalendarMarkedDates());
            }
        } catch (_error) { /* Fall through to the existing WebView storage. */ }
        if (!parsed) {
            try { parsed = JSON.parse(localStorage.getItem(MARKED_DATES_KEY)); }
            catch (_error) { /* Start with no manual date marks. */ }
        }
        if (Array.isArray(parsed)) return new Set(parsed.filter(value => typeof value === "string"));
        if (parsed && typeof parsed === "object") {
            return new Set(Object.keys(parsed).filter(key => Boolean(parsed[key])));
        }
        return new Set();
    }

    function saveMarkedDates() {
        const values = Array.from(markedDates).sort();
        localStorage.setItem(MARKED_DATES_KEY, JSON.stringify(values));
        try {
            const bridge = window.NativeBridge;
            if (bridge && typeof bridge.setCalendarMarkedDates === "function") {
                bridge.setCalendarMarkedDates(JSON.stringify(values));
            }
        } catch (_error) { /* Local storage remains the source of truth. */ }
    }

    function toggleMarkedDate(key) {
        if (markedDates.has(key)) markedDates.delete(key);
        else markedDates.add(key);
        saveMarkedDates();
        renderMonth();
    }

    function clearChildren(element) {
        while (element.firstChild) element.removeChild(element.firstChild);
    }

    function setBox(element, left, top, width, height) {
        element.style.left = xPercent(left);
        element.style.top = yPercent(top);
        element.style.width = xPercent(width);
        element.style.height = yPercent(height);
    }

    function setCenterBox(element, x, y, width, height) {
        setBox(element, x, y, width, height);
    }

    function setCenteredPosition(element, x, y) {
        element.style.left = xPercent(x);
        element.style.top = yPercent(y);
    }

    function setLocalBox(element, left, top, width, height) {
        element.style.left = `${(left / SPEC.ticket.width) * 100}%`;
        element.style.top = `${(top / SPEC.ticket.height) * 100}%`;
        element.style.width = `${(width / SPEC.ticket.width) * 100}%`;
        element.style.height = `${(height / SPEC.ticket.height) * 100}%`;
    }

    function setPageProgress(progress) {
        pageProgress = clamp(progress, 0, 1);
        const homeOffset = -pageProgress * 100;
        const calendarOffset = (1 - pageProgress) * 100;
        homeVisualLayer.style.transform = `translate3d(${homeOffset}%, 0, 0)`;
        layer.style.transform = `translate3d(${calendarOffset}%, 0, 0)`;
    }

    function beginPageSwipe(fromCalendar) {
        if (pageTransitionTimer) clearTimeout(pageTransitionTimer);
        pageTransitionTimer = 0;
        pageTransitionTarget = null;
        home.classList.remove("calendar-page-animating");
        home.classList.add("calendar-page-transitioning");
        layer.setAttribute("aria-hidden", "false");
        setPageProgress(fromCalendar ? 1 : 0);
    }

    function finishPageTransition(openCalendar) {
        pageProgress = openCalendar ? 1 : 0;
        pageTransitionTarget = null;
        if (openCalendar) home.classList.add("calendar-active");
        else home.classList.remove("calendar-active");
        home.classList.remove("calendar-page-transitioning", "calendar-page-animating");
        homeVisualLayer.style.transform = "";
        layer.style.transform = "";
        layer.setAttribute("aria-hidden", openCalendar ? "false" : "true");
        if (window.ForceFocusData) {
            if (openCalendar) window.ForceFocusData.endHomeVisible();
            else window.ForceFocusData.beginHomeVisible();
        }
        pageTransitionTimer = 0;
    }

    function settlePage(openCalendar) {
        const target = openCalendar ? 1 : 0;
        if (pageTransitionTimer) clearTimeout(pageTransitionTimer);
        pageTransitionTarget = openCalendar;
        home.classList.add("calendar-page-transitioning", "calendar-page-animating");
        if (openCalendar) home.classList.add("calendar-active");
        layer.setAttribute("aria-hidden", "false");
        requestAnimationFrame(() => setPageProgress(target));
        pageTransitionTimer = window.setTimeout(() => finishPageTransition(openCalendar), 310);
    }

    function modulo(value, divisor) {
        return ((value % divisor) + divisor) % divisor;
    }

    function epochDay(year, month, day) {
        return Math.floor(Date.UTC(year, month, day) / 86400000);
    }

    function leafNumberForDate(year, month, day) {
        const offset = epochDay(year, month, day) - Math.floor(SPEC.baseDate / 86400000);
        return modulo(offset, SPEC.templateCount) + 1;
    }

    function daysInMonth(year, month) {
        return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    }

    function readFocusMinutes(year, month) {
        const key = `${year}-${pad2(month + 1)}`;
        const throughDateKey = window.ForceFocusData && typeof window.ForceFocusData.yesterdayKey === "function"
            ? window.ForceFocusData.yesterdayKey()
            : (() => {
                const value = new Date();
                value.setDate(value.getDate() - 1);
                return dateKey(value.getFullYear(), value.getMonth(), value.getDate());
            })();
        let parsed = null;
        try {
            const bridge = window.NativeBridge;
            if (bridge && typeof bridge.getCalendarFocusMinutes === "function") {
                parsed = JSON.parse(bridge.getCalendarFocusMinutes(key));
                if (window.ForceFocusData && typeof window.ForceFocusData.syncNativeRecords === "function") {
                    window.ForceFocusData.syncNativeRecords();
                }
            }
        } catch (_error) { /* Fall back only when the native bridge is unavailable. */ }
        if (!parsed && window.ForceFocusData) {
            parsed = window.ForceFocusData.getCalendarFocusMinutes(key, throughDateKey);
        }
        if (!parsed) {
            try { parsed = JSON.parse(localStorage.getItem(`forcefocus_calendar_minutes_${key}`)); }
            catch (_error) { /* No legacy browser calendar data. */ }
        }
        if (parsed && typeof parsed === "object") {
            const pastOnly = {};
            Object.keys(parsed).forEach(dayValue => {
                const day = Number(dayValue);
                if (!Number.isInteger(day) || day < 1 || day > 31) return;
                if (dateKey(year, month, day) > throughDateKey) return;
                pastOnly[day] = Math.max(0, Number(parsed[dayValue]) || 0);
            });
            return pastOnly;
        }
        if (DEBUG_CALENDAR_MOCK && year === 2026 && month === 8) {
            return { 1: 0, 2: 60, 3: 120, 4: 240, 5: 480, 8: 360, 16: 180, 24: 420, 30: 90 };
        }
        return {};
    }

    function applyGreenProgressClip(clip, image, progress) {
        if (progress <= 0) {
            clip.style.height = "0%";
            image.style.height = "100%";
            return;
        }
        const apply = () => {
            const width = Number(image.naturalWidth) || 1;
            const height = Number(image.naturalHeight) || 1;
            const layerRect = layer.getBoundingClientRect();
            const frameWidth = (SPEC.leaf.width / SPEC.designWidth) * Math.max(1, layerRect.width);
            const frameHeight = (SPEC.leaf.height / SPEC.designHeight) * Math.max(1, layerRect.height);
            const frameAspect = frameWidth / Math.max(1, frameHeight);
            const imageAspect = width / height;
            const renderedHeightFraction = imageAspect > frameAspect ? frameAspect / imageAspect : 1;
            const transparentMargin = Math.min(16, Math.max(0, height / 3));
            const bottomPadding = renderedHeightFraction * transparentMargin / height;
            const topPadding = (1 - renderedHeightFraction)
                + renderedHeightFraction * transparentMargin / height;
            const visibleHeight = Math.max(0, 1 - topPadding - bottomPadding);
            const clipFraction = clamp(bottomPadding + progress * visibleHeight, 0, 1);
            clip.style.height = `${clipFraction * 100}%`;
            image.style.height = `${100 / Math.max(.0001, clipFraction)}%`;
        };
        if (image.complete && image.naturalHeight) apply();
        else image.addEventListener("load", apply, { once: true });
    }

    function isToday(year, month, day) {
        const today = new Date();
        return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    }

    function createWeekdays() {
        clearChildren(weekdays);
        ["日", "一", "二", "三", "四", "五", "六"].forEach((label, index) => {
            const element = document.createElement("span");
            element.className = "calendar-weekday";
            element.textContent = label;
            setCenteredPosition(element, SPEC.columns[index], SPEC.weekdayY);
            weekdays.appendChild(element);
        });
    }

    function renderMonth() {
        title.textContent = `${displayedYear}年${displayedMonth + 1}月`;
        requestAnimationFrame(positionDecorSpiderNearTitle);
        clearChildren(dates);
        const focusMinutes = readFocusMinutes(displayedYear, displayedMonth);
        const firstWeekday = new Date(Date.UTC(displayedYear, displayedMonth, 1)).getUTCDay();
        const count = daysInMonth(displayedYear, displayedMonth);

        for (let day = 1; day <= count; day += 1) {
            const cellIndex = firstWeekday + day - 1;
            const row = Math.floor(cellIndex / 7);
            const column = cellIndex % 7;
            if (row >= SPEC.rows.length) continue;
            const centerX = SPEC.columns[column];
            const centerY = SPEC.rows[row];
            const leafNumber = leafNumberForDate(displayedYear, displayedMonth, day);
            const key = dateKey(displayedYear, displayedMonth, day);
            const today = isToday(displayedYear, displayedMonth, day);
            const minutes = Math.max(0, Number(focusMinutes[day]) || 0);
            const progress = debugLeafAlignment && day <= 10
                ? [0, .1, .2, .3, .4, .5, .6, .7, .8, 1][day - 1]
                : clamp(minutes / 480, 0, 1);

            const cell = document.createElement("div");
            cell.className = "calendar-cell";
            cell.setAttribute("role", "gridcell");
            cell.dataset.dateKey = key;
            cell.classList.toggle("is-marked", markedDates.has(key));
            cell.setAttribute("aria-label", `${displayedMonth + 1}月${day}日，专注${minutes}分钟`);

            if (markedDates.has(key)) {
                const mark = document.createElement("span");
                mark.className = "calendar-date-mark";
                const markDiameter = SPEC.mark.diameter;
                setCenterBox(
                    mark,
                    centerX,
                    centerY,
                    markDiameter,
                    markDiameter
                );
                cell.appendChild(mark);
            }

            const leafFrame = document.createElement("div");
            leafFrame.className = "calendar-leaf-frame";
            leafFrame.classList.toggle("is-debug-leaf", day <= 10);
            setCenterBox(leafFrame, centerX, centerY, SPEC.leaf.width, SPEC.leaf.height);

            const brown = document.createElement("img");
            brown.className = "calendar-leaf-brown";
            brown.src = `calendar/leaves/leaf_${pad2(leafNumber)}_brown.png`;
            brown.alt = "";
            brown.draggable = false;

            const greenClip = document.createElement("span");
            greenClip.className = "calendar-leaf-green-clip";
            const green = document.createElement("img");
            green.className = "calendar-leaf-green";
            green.src = `calendar/leaves/leaf_${pad2(leafNumber)}_green.png`;
            green.alt = "";
            green.draggable = false;
            greenClip.appendChild(green);
            leafFrame.append(brown, greenClip);
            applyGreenProgressClip(greenClip, green, progress);

            const number = document.createElement("span");
            number.className = "calendar-date-number";
            number.textContent = String(day);
            setCenteredPosition(number, centerX, centerY + SPEC.dateOffsetY);

            cell.append(leafFrame, number);
            if (today) {
                const dot = document.createElement("span");
                dot.className = "calendar-today-dot";
                setCenterBox(
                    dot,
                    centerX,
                    centerY + SPEC.dateOffsetY + SPEC.todayDot.offsetY,
                    SPEC.todayDot.diameter,
                    SPEC.todayDot.diameter
                );
                cell.appendChild(dot);
            }

            const hit = document.createElement("button");
            hit.className = "calendar-date-hit";
            hit.type = "button";
            hit.dataset.dateKey = key;
            hit.setAttribute("aria-label", `${markedDates.has(key) ? "取消标注" : "标注"}${displayedMonth + 1}月${day}日`);
            hit.setAttribute("aria-pressed", markedDates.has(key) ? "true" : "false");
            setCenterBox(
                hit,
                centerX,
                centerY + SPEC.dateHit.offsetY,
                SPEC.dateHit.width,
                SPEC.dateHit.height
            );
            cell.appendChild(hit);
            dates.appendChild(cell);
        }
    }

    function positionDecorSpiderNearTitle() {
        const contentRect = layer.getBoundingClientRect();
        const titleRect = title.getBoundingClientRect();
        if (!contentRect.width || !contentRect.height || !titleRect.width || !titleRect.height) return;
        const titleLeftMm = ((titleRect.left - contentRect.left) / contentRect.width) * SPEC.designWidth;
        const titleTopMm = ((titleRect.top - contentRect.top) / contentRect.height) * SPEC.designHeight;
        const spiderCenterX = titleLeftMm - SPEC.decorSpider.gap - SPEC.focusSpider.width / 2;
        const spiderCenterY = titleTopMm - SPEC.decorSpider.gap - SPEC.focusSpider.height / 2;
        setCenterBox(
            decorSpider,
            spiderCenterX,
            spiderCenterY,
            SPEC.focusSpider.width,
            SPEC.focusSpider.height
        );
    }

    function updateTicketDotsLayout() {
        const count = Math.max(1, personas.length);
        const dotGroupWidth = SPEC.dots.diameter + Math.max(0, count - 1) * SPEC.dots.centerGap;
        setLocalBox(
            ticketDots,
            (SPEC.ticket.width - dotGroupWidth) / 2,
            SPEC.dots.y - SPEC.ticket.openTop - SPEC.dots.diameter / 2,
            dotGroupWidth,
            SPEC.dots.diameter
        );
    }

    function createTicketSlides(nextPersonas = personas, nextSelectedId = selectedPersonaId) {
        personas = Array.isArray(nextPersonas) ? nextPersonas : [];
        selectedPersonaId = nextSelectedId || null;
        clearChildren(ticketTrack);
        clearChildren(ticketDots);
        const slides = personas.length ? personas : [{ id: null, name: "昨日数据不足", comment: "", image: null }];
        const count = slides.length;
        ticketTrack.style.width = `${count * 100}%`;
        slides.forEach((persona, index) => {
            const slide = document.createElement("section");
            slide.className = "calendar-ticket-slide";
            slide.style.flexBasis = `${100 / count}%`;
            slide.style.width = `${100 / count}%`;
            if (persona.image) {
                const image = document.createElement("img");
                image.className = "calendar-persona-image";
                image.src = persona.image;
                image.alt = "";
                image.draggable = false;
                setLocalBox(image, SPEC.personaImage.left, SPEC.personaImage.top, SPEC.personaImage.width, SPEC.personaImage.height);
                slide.appendChild(image);
            }
            const name = document.createElement("h2");
            name.className = "calendar-persona-name";
            if (!persona.image) name.classList.add("is-empty");
            name.textContent = persona.name;
            setLocalBox(name, SPEC.personaName.left, SPEC.personaName.top, SPEC.personaName.width, SPEC.personaName.height);
            const comment = document.createElement("p");
            comment.className = "calendar-persona-comment";
            comment.textContent = persona.comment || "";
            setLocalBox(comment, SPEC.personaComment.left, SPEC.personaComment.top, SPEC.personaComment.width, SPEC.personaComment.height);
            slide.append(name, comment);
            ticketTrack.appendChild(slide);

            const dot = document.createElement("span");
            dot.className = "calendar-ticket-dot";
            const groupWidth = SPEC.dots.diameter + Math.max(0, count - 1) * SPEC.dots.centerGap;
            dot.style.width = `${(SPEC.dots.diameter / groupWidth) * 100}%`;
            dot.style.height = "100%";
            if (index > 0) {
                dot.style.marginLeft = `${((SPEC.dots.centerGap - SPEC.dots.diameter) / groupWidth) * 100}%`;
            }
            ticketDots.appendChild(dot);
        });
        const selectedIndex = personas.findIndex(persona => persona.id === selectedPersonaId);
        updateTicketDotsLayout();
        setActivePersonaPage(selectedIndex >= 0 ? selectedIndex : 0, false);
    }

    function setActivePersonaPage(index, animate = true) {
        const count = Math.max(1, personas.length);
        activePersonaPage = modulo(index, count);
        ticketTrack.style.transition = animate ? "" : "none";
        ticketTrack.style.transform = `translateX(-${activePersonaPage * (100 / count)}%)`;
        Array.prototype.forEach.call(ticketDots.children, (dot, dotIndex) => {
            dot.classList.toggle("is-active", dotIndex === activePersonaPage);
        });
        if (personas[activePersonaPage] && window.ForceFocusData && personaDateKey) {
            selectedPersonaId = personas[activePersonaPage].id;
            window.ForceFocusData.setSelectedPersona(personaDateKey, selectedPersonaId);
        }
        if (!animate) requestAnimationFrame(() => { ticketTrack.style.transition = ""; });
    }

    async function refreshYesterdayPersonas() {
        if (!window.ForceFocusData) {
            createTicketSlides([], null);
            return;
        }
        try {
            personaDateKey = window.ForceFocusData.yesterdayKey();
            const result = await window.ForceFocusData.settleFFTIDate(personaDateKey);
            createTicketSlides(result.personas, result.selectedId);
        } catch (_error) {
            createTicketSlides([], null);
        }
    }

    function setTicketVisualProgress(progress, dragging = false) {
        ticketProgress = clamp(progress, 0, 1);
        const top = SPEC.ticket.closedTop
            + (SPEC.ticket.openTop - SPEC.ticket.closedTop) * ticketProgress;
        ticket.style.top = yPercent(top);
        ticket.classList.toggle("is-dragging", dragging);
        ticket.classList.toggle("is-interactive", ticketProgress > .98);
        ticket.setAttribute("aria-hidden", ticketProgress <= .001 ? "true" : "false");
        pullSpider.classList.toggle("is-dragging", dragging);
    }

    function setSpiderOffset(offsetMm, dragging = false) {
        spiderOffsetMm = clamp(offsetMm, 0, SPEC.spiderMaxDrag);
        pullSpider.classList.toggle("is-dragging", dragging);
        const spiderOffsetPx = layer.getBoundingClientRect().height
            * spiderOffsetMm / SPEC.designHeight;
        pullSpider.style.transform = `translate(-50%, -50%) translateY(${spiderOffsetPx}px)`;
    }

    function setTicketProgress(progress, spiderOffset = 0, dragging = false) {
        setTicketVisualProgress(progress, dragging);
        setSpiderOffset(spiderOffset, dragging);
    }

    function cubicBezierValue(progress, x1, y1, x2, y2) {
        const sample = (t, p1, p2) => {
            const inverse = 1 - t;
            return 3 * inverse * inverse * t * p1
                + 3 * inverse * t * t * p2
                + t * t * t;
        };
        let low = 0;
        let high = 1;
        let t = progress;
        for (let index = 0; index < 12; index += 1) {
            t = (low + high) / 2;
            if (sample(t, x1, x2) < progress) low = t;
            else high = t;
        }
        return sample(t, y1, y2);
    }

    function stopSpiderOffsetAnimation() {
        if (spiderOffsetAnimation) cancelAnimationFrame(spiderOffsetAnimation);
        spiderOffsetAnimation = 0;
    }

    function animateSpiderOffset(targetOffsetMm) {
        stopSpiderOffsetAnimation();
        const from = spiderOffsetMm;
        const target = clamp(targetOffsetMm, 0, SPEC.spiderMaxDrag);
        if (Math.abs(target - from) < .001) {
            setSpiderOffset(target, false);
            return;
        }
        const startedAt = performance.now();
        const duration = 360;
        const animate = now => {
            const raw = clamp((now - startedAt) / duration, 0, 1);
            const eased = cubicBezierValue(raw, .22, .80, .22, 1);
            setSpiderOffset(from + (target - from) * eased, true);
            if (raw < 1) {
                spiderOffsetAnimation = requestAnimationFrame(animate);
            } else {
                spiderOffsetAnimation = 0;
                setSpiderOffset(target, false);
            }
        };
        spiderOffsetAnimation = requestAnimationFrame(animate);
    }

    function settleTicket(open) {
        ticketOpen = Boolean(open);
        setTicketVisualProgress(ticketOpen ? 1 : 0, false);
        animateSpiderOffset(0);
    }

    function clientYToMm(clientY) {
        const rect = layer.getBoundingClientRect();
        return ((clientY - rect.top) / Math.max(1, rect.height)) * SPEC.designHeight;
    }

    function installSpiderPull() {
        pullSpiderHit.addEventListener("pointerdown", event => {
            if (!home.classList.contains("calendar-active") || spiderGesture) return;
            event.preventDefault();
            event.stopPropagation();
            stopSpiderOffsetAnimation();
            spiderGesture = {
                pointerId: event.pointerId,
                startY: clientYToMm(event.clientY),
                dragY: 0
            };
            pullSpiderHit.setPointerCapture(event.pointerId);
            setTicketProgress(0, 0, true);
        });
        pullSpiderHit.addEventListener("pointermove", event => {
            if (!spiderGesture || event.pointerId !== spiderGesture.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            const dragY = Math.max(0, clientYToMm(event.clientY) - spiderGesture.startY);
            spiderGesture.dragY = dragY;
            setTicketProgress(dragY / SPEC.ticketDragRange, dragY, true);
        });
        const finish = event => {
            if (!spiderGesture || event.pointerId !== spiderGesture.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            try {
                if (pullSpiderHit.hasPointerCapture(event.pointerId)) {
                    pullSpiderHit.releasePointerCapture(event.pointerId);
                }
            } catch (_error) { /* Capture may already be released. */ }
            const shouldOpen = spiderGesture.dragY >= SPEC.ticketOpenThreshold;
            spiderGesture = null;
            settleTicket(shouldOpen);
        };
        pullSpiderHit.addEventListener("pointerup", finish);
        pullSpiderHit.addEventListener("pointercancel", finish);
    }

    function installCalendarPageSwipe() {
        const startsInsideHorizontalControl = target => Boolean(target.closest(
            "#calendarTicket, #calendarPullSpiderHit, .calendar-month-arrow, [data-horizontal-drag]"
        ));

        layer.addEventListener("pointerdown", event => {
            if (!home.classList.contains("calendar-active") || event.isPrimary === false
                    || event.button > 0 || startsInsideHorizontalControl(event.target)) {
                calendarPageSwipe = null;
                return;
            }
            calendarPageSwipe = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                currentX: event.clientX,
                currentY: event.clientY,
                startedAt: performance.now(),
                dragging: false
            };
        });

        window.addEventListener("pointermove", event => {
            if (!calendarPageSwipe || event.pointerId !== calendarPageSwipe.pointerId) return;
            calendarPageSwipe.currentX = event.clientX;
            calendarPageSwipe.currentY = event.clientY;
            const deltaX = event.clientX - calendarPageSwipe.startX;
            const deltaY = event.clientY - calendarPageSwipe.startY;
            if (!calendarPageSwipe.dragging && deltaX > 0 && Math.abs(deltaX) >= 6
                    && Math.abs(deltaX) > Math.abs(deltaY) * 1.05) {
                calendarPageSwipe.dragging = true;
                suppressDateClickUntil = performance.now() + 500;
                beginPageSwipe(true);
                try { layer.setPointerCapture(event.pointerId); }
                catch (_error) { /* Window listeners still preserve the gesture. */ }
            }
            if (!calendarPageSwipe.dragging) return;
            event.preventDefault();
            const width = Math.max(1, home.getBoundingClientRect().width);
            setPageProgress(1 - clamp(deltaX / width, 0, 1));
        }, { passive: false });

        window.addEventListener("pointerup", event => {
            if (!calendarPageSwipe || event.pointerId !== calendarPageSwipe.pointerId) return;
            const deltaX = event.clientX - calendarPageSwipe.startX;
            const deltaY = event.clientY - calendarPageSwipe.startY;
            const duration = performance.now() - calendarPageSwipe.startedAt;
            const wasDragging = calendarPageSwipe.dragging;
            calendarPageSwipe = null;
            const distanceX = Math.abs(deltaX);
            const distanceY = Math.abs(deltaY);
            const normalSwipe = distanceX >= 28 && distanceX > distanceY * 1.15;
            const quickSwipe = duration <= 250
                && distanceX >= 18
                && distanceX > distanceY * 1.2;
            const shouldClose = deltaX > 0 && (normalSwipe || quickSwipe);
            if (wasDragging) {
                suppressDateClickUntil = performance.now() + 350;
                try {
                    if (layer.hasPointerCapture(event.pointerId)) layer.releasePointerCapture(event.pointerId);
                } catch (_error) { /* Capture may already be released. */ }
                if (shouldClose) close();
                else settlePage(true);
            } else if (shouldClose) {
                suppressDateClickUntil = performance.now() + 350;
                close();
            }
        }, true);

        window.addEventListener("pointercancel", event => {
            if (calendarPageSwipe && event.pointerId === calendarPageSwipe.pointerId) {
                const wasDragging = calendarPageSwipe.dragging;
                calendarPageSwipe = null;
                if (wasDragging) settlePage(true);
            }
        }, true);
    }

    function installDateMarking() {
        dates.addEventListener("pointerdown", event => {
            const hit = event.target.closest(".calendar-date-hit");
            if (!hit || !home.classList.contains("calendar-active")) {
                calendarDateTap = null;
                return;
            }
            calendarDateTap = {
                pointerId: event.pointerId,
                key: hit.dataset.dateKey,
                startX: event.clientX,
                startY: event.clientY,
                moved: false
            };
        });
        dates.addEventListener("pointermove", event => {
            if (!calendarDateTap || calendarDateTap.pointerId !== event.pointerId) return;
            if (Math.abs(event.clientX - calendarDateTap.startX) >= 8
                    || Math.abs(event.clientY - calendarDateTap.startY) >= 8) {
                calendarDateTap.moved = true;
            }
        });
        dates.addEventListener("pointerup", event => {
            if (!calendarDateTap || calendarDateTap.pointerId !== event.pointerId) return;
            const tap = calendarDateTap;
            calendarDateTap = null;
            if (tap.moved || performance.now() < suppressDateClickUntil) return;
            event.preventDefault();
            event.stopPropagation();
            toggleMarkedDate(tap.key);
        });
        dates.addEventListener("pointercancel", event => {
            if (calendarDateTap && calendarDateTap.pointerId === event.pointerId) {
                calendarDateTap = null;
            }
        });
    }

    function installTicketSwipe() {
        ticket.addEventListener("pointerdown", event => {
            if (!ticketOpen) return;
            event.stopPropagation();
            ticketSwipe = { pointerId: event.pointerId, startX: event.clientX, currentX: event.clientX };
            ticket.setPointerCapture(event.pointerId);
        });
        ticket.addEventListener("pointermove", event => {
            if (!ticketSwipe || event.pointerId !== ticketSwipe.pointerId) return;
            ticketSwipe.currentX = event.clientX;
        });
        const finish = event => {
            if (!ticketSwipe || event.pointerId !== ticketSwipe.pointerId) return;
            event.stopPropagation();
            const delta = ticketSwipe.currentX - ticketSwipe.startX;
            try {
                if (ticket.hasPointerCapture(event.pointerId)) ticket.releasePointerCapture(event.pointerId);
            } catch (_error) { /* Capture may already be released. */ }
            ticketSwipe = null;
            if (Math.abs(delta) >= 28) setActivePersonaPage(activePersonaPage + (delta < 0 ? 1 : -1));
        };
        ticket.addEventListener("pointerup", finish);
        ticket.addEventListener("pointercancel", finish);
    }

    function layout() {
        setCenteredPosition(title, SPEC.month.x, SPEC.month.y);
        setCenterBox(previousButton, SPEC.previous.x, SPEC.previous.y, SPEC.arrowHit, SPEC.arrowHit);
        setCenterBox(nextButton, SPEC.next.x, SPEC.next.y, SPEC.arrowHit, SPEC.arrowHit);
        positionDecorSpiderNearTitle();
        setCenterBox(
            pullSpider,
            SPEC.pullSpider.x,
            SPEC.pullSpider.y,
            SPEC.pullSpider.width,
            SPEC.pullSpider.height
        );
        setCenterBox(
            pullSpiderHit,
            SPEC.pullSpider.x,
            SPEC.pullSpider.y,
            SPEC.pullSpider.hitSize,
            SPEC.pullSpider.hitSize
        );
        setBox(ticket, SPEC.ticket.left, SPEC.ticket.closedTop, SPEC.ticket.width, SPEC.ticket.height);
        ticket.style.top = yPercent(SPEC.ticket.closedTop);
        const contentWidth = Math.max(1, home.getBoundingClientRect().width);
        const unit = contentWidth / SPEC.designWidth;
        ticket.style.setProperty("--ticket-border", `${unit * .25}px`);
        ticket.style.setProperty("--ticket-cut", `${unit * 2}px`);
        ticket.style.setProperty("--ticket-inner-cut", `${unit * 1.9}px`);
        updateTicketDotsLayout();
    }

    function shiftMonth(delta) {
        displayedMonth += delta;
        if (displayedMonth < 0) {
            displayedMonth = 11;
            displayedYear -= 1;
        } else if (displayedMonth > 11) {
            displayedMonth = 0;
            displayedYear += 1;
        }
        renderMonth();
    }

    function open() {
        if (!home || !layer) return;
        if (window.ForceFocusFocus && window.ForceFocusFocus.isActive()) return;
        if (pageTransitionTarget === true) return;
        const wasPrepared = calendarPrepared;
        prepareCalendar();
        settleTicket(false);
        if (window.ForceFocusData) window.ForceFocusData.endHomeVisible();
        if (wasPrepared) {
            refreshYesterdayPersonas();
            renderMonth();
        }
        settlePage(true);
    }

    function prepareCalendar() {
        if (calendarPrepared) return;
        calendarPrepared = true;
        createTicketSlides([], null);
        renderMonth();
        refreshYesterdayPersonas();
    }

    function close() {
        if (pageTransitionTarget === false) return;
        settleTicket(false);
        settlePage(false);
    }

    function initialize() {
        if (!home || !homeVisualLayer || !layer || !title || !previousButton || !nextButton || !dates
                || !pullSpider || !pullSpiderHit || !ticket || !ticketTrack || !ticketDots) return;
        createWeekdays();
        layout();
        installSpiderPull();
        installTicketSwipe();
        installCalendarPageSwipe();
        installDateMarking();
        previousButton.addEventListener("click", event => {
            event.stopPropagation();
            shiftMonth(-1);
        });
        nextButton.addEventListener("click", event => {
            event.stopPropagation();
            shiftMonth(1);
        });
        layer.addEventListener("pointerdown", event => {
            if (!ticketOpen || event.target.closest("#calendarTicket, #calendarPullSpiderHit")) return;
            const ticketRect = ticket.getBoundingClientRect();
            if (event.clientY < ticketRect.top) settleTicket(false);
        });
        window.addEventListener("forcefocus:onSwipeRightToCalendar", open);
        window.addEventListener("forcefocus:records-changed", () => {
            if (home.classList.contains("calendar-active")) {
                refreshYesterdayPersonas();
                renderMonth();
            }
        });
        window.addEventListener("focus", () => {
            if (home.classList.contains("calendar-active")) renderMonth();
        });
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden && home.classList.contains("calendar-active")) renderMonth();
        });
        // Month leaves/personas are not home-screen dependencies. Warm them after
        // the first paint, while open() still prepares synchronously if requested
        // unusually early.
        requestAnimationFrame(() => window.setTimeout(prepareCalendar, 900));
    }

    window.ForceFocusCalendar = Object.freeze({
        open,
        close,
        beginPageSwipe,
        setPageProgress,
        settlePage,
        isOpen: () => home.classList.contains("calendar-active"),
        setDisplayedMonth: (year, monthIndex) => {
            displayedYear = Number(year);
            displayedMonth = Number(monthIndex);
            renderMonth();
        },
        setValidationState: state => {
            if (state === "open") {
                ticketOpen = true;
                setTicketProgress(1, 0, false);
            } else if (state === "half") {
                ticketOpen = false;
                setTicketProgress(.5, 6, true);
            } else {
                ticketOpen = false;
                setTicketProgress(0, 0, false);
            }
        },
        setLeafAlignmentDebug: enabled => {
            debugLeafAlignment = Boolean(enabled);
            home.classList.toggle("calendar-leaf-alignment-debug", debugLeafAlignment);
            renderMonth();
        },
        getState: () => ({
            year: displayedYear,
            month: displayedMonth + 1,
            ticketProgress,
            ticketOpen,
            activePersonaPage,
            markedDates: Array.from(markedDates).sort(),
            debugLeafAlignment
        })
    });

    document.addEventListener("DOMContentLoaded", initialize, { once: true });
})();
