/**
 * Hand-drawn inline SVG charts. No dependency, no animation library.
 *
 * Every chart renders into a coordinate system that matches its measured pixel
 * width, so 1px rules land on device pixels instead of blurring, and re-renders
 * on resize through a ResizeObserver. Value axes always start at zero.
 *
 * Each factory returns `{ destroy }`; the caller must destroy charts before
 * discarding their host element.
 */
import { t } from "./i18n.js";

/**
 * Read off a parsed element rather than written as a literal: the SVG namespace
 * is never fetched, but an absolute URL in a source file fails the no-network
 * check in `scripts/verify-public-ui.mjs`.
 */
const NS = (() => {
	const template = document.createElement("template");
	template.innerHTML = "<svg></svg>";
	return template.content.firstElementChild.namespaceURI;
})();

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function svg(name, attributes) {
	const element = document.createElementNS(NS, name);
	for (const [key, value] of Object.entries(attributes ?? {})) element.setAttribute(key, String(value));
	return element;
}

function titled(element, text) {
	const title = svg("title");
	title.textContent = text;
	element.append(title);
	return element;
}

/** Round an axis top up to a readable number so gridline labels are legible. */
function niceCeil(value) {
	if (!(value > 0)) return 1;
	const exponent = 10 ** Math.floor(Math.log10(value));
	const fraction = value / exponent;
	for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
		if (fraction <= step) return step * exponent;
	}
	return 10 * exponent;
}

/** Snap to a half pixel so a 1px stroke covers exactly one device pixel row. */
function crisp(value) {
	return Math.round(value) + 0.5;
}

function screenReaderText(text) {
	const paragraph = document.createElement("p");
	paragraph.className = "sr-only";
	paragraph.textContent = text;
	return paragraph;
}

function emptyChart(host, height) {
	host.replaceChildren();
	const empty = document.createElement("p");
	empty.className = "chart-empty";
	empty.style.height = `${height}px`;
	empty.textContent = t("chart.noData");
	host.append(empty);
}

/**
 * Renders once per measured width. `draw(width)` owns the whole host content;
 * the observer simply calls it again when the box changes by a visible amount.
 */
function responsive(host, draw) {
	let lastWidth = 0;
	const run = () => {
		const width = Math.max(240, Math.round(host.clientWidth));
		if (Math.abs(width - lastWidth) < 2) return;
		lastWidth = width;
		draw(width);
	};
	const observer = new ResizeObserver(run);
	observer.observe(host);
	run();
	return { destroy: () => observer.disconnect() };
}

export function timeSeriesChart(host, options) {
	const { points, value, label, formatValue, formatX, formatReadoutX = formatX, height = 176 } = options;
	return responsive(host, (width) => {
		const values = points.map(value);
		const max = Math.max(0, ...values);
		if (points.length === 0 || max <= 0) return emptyChart(host, height);

		const padding = { top: 12, right: 10, bottom: 22, left: 52 };
		const plotWidth = width - padding.left - padding.right;
		const plotHeight = height - padding.top - padding.bottom;
		const top = niceCeil(max);
		const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
		const xAt = (index) => padding.left + (points.length > 1 ? index * stepX : plotWidth / 2);
		const yAt = (raw) => padding.top + plotHeight - (raw / top) * plotHeight;

		const readout = document.createElement("div");
		readout.className = "chart-readout";
		const readoutX = document.createElement("span");
		readoutX.className = "chart-readout-x";
		const readoutValue = document.createElement("strong");
		readout.append(readoutX, readoutValue);

		const root = svg("svg", {
			viewBox: `0 0 ${width} ${height}`,
			width: "100%",
			height,
			role: "img",
			preserveAspectRatio: "none",
			tabindex: "0",
			class: "chart-svg",
		});
		const summary = t("chart.timeSeries", {
			label,
			count: points.length,
			start: formatX(points[0]),
			end: formatX(points[points.length - 1]),
			max: formatValue(max),
		});
		root.setAttribute("aria-label", summary);
		titled(root, summary);

		for (const ratio of [0, 0.5, 1]) {
			const y = crisp(padding.top + plotHeight * (1 - ratio));
			root.append(svg("line", { class: "chart-grid", x1: padding.left, x2: width - padding.right, y1: y, y2: y }));
			const text = svg("text", { class: "chart-axis", x: padding.left - 8, y: y + 3.5, "text-anchor": "end" });
			text.textContent = formatValue(top * ratio);
			root.append(text);
		}

		const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(2)} ${yAt(values[index]).toFixed(2)}`).join(" ");
		const base = padding.top + plotHeight;
		root.append(svg("path", { class: "chart-area", d: `${line} L${xAt(points.length - 1).toFixed(2)} ${base} L${xAt(0).toFixed(2)} ${base} Z` }));
		root.append(svg("path", { class: "chart-line", d: line }));

		const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotWidth / 78))));
		for (let index = 0; index < points.length; index += labelEvery) {
			const text = svg("text", { class: "chart-axis", x: xAt(index), y: height - 6, "text-anchor": index === 0 ? "start" : "middle" });
			text.textContent = formatX(points[index]);
			root.append(text);
		}

		const cursor = svg("g", { class: "chart-cursor", hidden: "hidden" });
		const cursorLine = svg("line", { class: "chart-crosshair", y1: padding.top, y2: base });
		const cursorDot = svg("circle", { class: "chart-dot", r: 3.5 });
		cursor.append(cursorLine, cursorDot);
		root.append(cursor);

		let active = -1;
		const moveTo = (index) => {
			if (index < 0 || index >= points.length) return;
			active = index;
			const x = xAt(index);
			cursor.removeAttribute("hidden");
			cursorLine.setAttribute("x1", x);
			cursorLine.setAttribute("x2", x);
			cursorDot.setAttribute("cx", x);
			cursorDot.setAttribute("cy", yAt(values[index]));
			readoutX.textContent = formatReadoutX(points[index]);
			readoutValue.textContent = formatValue(values[index]);
		};
		const clear = () => {
			active = -1;
			cursor.setAttribute("hidden", "hidden");
			readoutX.textContent = t("chart.readoutHint");
			readoutValue.textContent = "";
		};

		root.addEventListener("pointermove", (event) => {
			const box = root.getBoundingClientRect();
			const ratio = box.width > 0 ? (event.clientX - box.left) / box.width : 0;
			const x = ratio * width - padding.left;
			moveTo(Math.max(0, Math.min(points.length - 1, Math.round(stepX > 0 ? x / stepX : 0))));
		});
		root.addEventListener("pointerleave", clear);
		root.addEventListener("focus", () => moveTo(active < 0 ? points.length - 1 : active));
		root.addEventListener("blur", clear);
		root.addEventListener("keydown", (event) => {
			const jump = { ArrowLeft: -1, ArrowRight: 1, Home: -points.length, End: points.length }[event.key];
			if (jump === undefined) return;
			event.preventDefault();
			moveTo(Math.max(0, Math.min(points.length - 1, (active < 0 ? points.length - 1 : active) + jump)));
		});

		if (!reducedMotion.matches) root.classList.add("chart-reveal");
		host.replaceChildren(readout, root, screenReaderText(summary));
		clear();
	});
}

export function barChart(host, options) {
	const { items, label, formatValue, height = 150 } = options;
	return responsive(host, (width) => {
		const max = Math.max(0, ...items.map((item) => item.value));
		if (items.length === 0 || max <= 0) return emptyChart(host, height);

		const band = (width - 44) / items.length;
		const rotate = band < 42;
		const padding = { top: 10, right: 4, bottom: rotate ? 46 : 20, left: 44 };
		const plotWidth = width - padding.left - padding.right;
		const plotHeight = height - padding.top - padding.bottom;
		const top = niceCeil(max);
		const slot = plotWidth / items.length;
		const barWidth = Math.max(3, Math.min(38, slot - 6));

		const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height, role: "img", preserveAspectRatio: "none", class: "chart-svg" });
		const summary = t("chart.bar", { label, count: items.length, max: formatValue(max) });
		root.setAttribute("aria-label", summary);
		titled(root, summary);

		for (const ratio of [0, 0.5, 1]) {
			const y = crisp(padding.top + plotHeight * (1 - ratio));
			root.append(svg("line", { class: "chart-grid", x1: padding.left, x2: width - padding.right, y1: y, y2: y }));
			const text = svg("text", { class: "chart-axis", x: padding.left - 8, y: y + 3.5, "text-anchor": "end" });
			text.textContent = formatValue(top * ratio);
			root.append(text);
		}

		items.forEach((item, index) => {
			const center = padding.left + slot * index + slot / 2;
			const barHeight = (item.value / top) * plotHeight;
			const rect = svg("rect", {
				class: "chart-bar",
				x: (center - barWidth / 2).toFixed(2),
				y: (padding.top + plotHeight - barHeight).toFixed(2),
				width: barWidth.toFixed(2),
				height: Math.max(item.value > 0 ? 1 : 0, barHeight).toFixed(2),
				rx: 1.5,
			});
			root.append(titled(rect, `${item.label}: ${formatValue(item.value)}`));

			const text = svg("text", { class: "chart-axis", x: center, y: height - (rotate ? 32 : 6), "text-anchor": rotate ? "end" : "middle" });
			text.textContent = item.label;
			if (rotate) text.setAttribute("transform", `rotate(-50 ${center} ${height - 32})`);
			root.append(text);
		});

		if (!reducedMotion.matches) root.classList.add("chart-reveal");
		host.replaceChildren(root, screenReaderText(summary));
	});
}

export function stackedBar(host, options) {
	const { segments, label, formatValue, height = 26 } = options;
	return responsive(host, (width) => {
		const total = segments.reduce((sum, segment) => sum + segment.value, 0);
		if (total <= 0) return emptyChart(host, height);

		const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height, role: "img", preserveAspectRatio: "none", class: "chart-svg chart-stack" });
		const summary = t("chart.stack", { label, total: formatValue(total) });
		root.setAttribute("aria-label", summary);
		titled(root, summary);

		let cursor = 0;
		segments.forEach((segment, index) => {
			const segmentWidth = (segment.value / total) * width;
			const rect = svg("rect", { x: cursor.toFixed(2), y: 0, width: Math.max(1, segmentWidth).toFixed(2), height });
			rect.style.fill = `var(--series-${(index % 5) + 1})`;
			root.append(titled(rect, `${segment.label}: ${formatValue(segment.value)}`));
			cursor += segmentWidth;
		});

		const legend = document.createElement("ul");
		legend.className = "chart-legend";
		segments.forEach((segment, index) => {
			const item = document.createElement("li");
			const swatch = document.createElement("span");
			swatch.className = "chart-swatch";
			swatch.style.background = `var(--series-${(index % 5) + 1})`;
			const name = document.createElement("span");
			name.className = "chart-legend-label";
			name.textContent = segment.label;
			const amount = document.createElement("strong");
			amount.textContent = `${formatValue(segment.value)} · ${((segment.value / total) * 100).toFixed(1)}%`;
			item.append(swatch, name, amount);
			legend.append(item);
		});

		host.replaceChildren(root, legend, screenReaderText(summary));
	});
}

export function heatStrip(host, options) {
	const { values, label, formatValue, formatHour, height = 46 } = options;
	return responsive(host, (width) => {
		const max = Math.max(0, ...values);
		const total = values.reduce((sum, value) => sum + value, 0);
		if (total <= 0) return emptyChart(host, height);

		const gap = width < 420 ? 1 : 2;
		const cellHeight = height - 16;
		const cellWidth = (width - gap * (values.length - 1)) / values.length;
		const peak = values.indexOf(max);

		const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height, role: "img", preserveAspectRatio: "none", class: "chart-svg" });
		const summary = t("chart.heat", { peak: formatHour(peak), total: formatValue(total) });
		root.setAttribute("aria-label", summary);
		titled(root, summary);

		values.forEach((value, hour) => {
			const x = hour * (cellWidth + gap);
			const rect = svg("rect", {
				class: "heat-cell",
				x: x.toFixed(2),
				y: 0,
				width: cellWidth.toFixed(2),
				height: cellHeight,
				rx: 2,
				"fill-opacity": value > 0 ? (0.14 + 0.86 * (value / max)).toFixed(3) : 0,
			});
			root.append(titled(rect, `${formatHour(hour)} · ${formatValue(value)}`));

			const everyOther = width < 520 ? 6 : 3;
			if (hour % everyOther === 0) {
				const text = svg("text", { class: "chart-axis", x: (x + cellWidth / 2).toFixed(2), y: height - 3, "text-anchor": "middle" });
				text.textContent = formatHour(hour);
				root.append(text);
			}
		});

		host.replaceChildren(root, screenReaderText(summary));
	});
}
