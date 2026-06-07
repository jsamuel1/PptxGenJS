/**
 * NAME: demo_animation.mjs
 * AUTH: jsamuel1 fork (https://github.com/jsamuel1/PptxGenJS)
 * DESC: Demo slides for fork-added features: slide transitions, shape entrance
 *       animations (appear/fadeIn/flyIn/zoomIn), animation triggers/stagger,
 *       gradient fills, and the number-counter sugar.
 * DEPS: Used by various demos (./demos/browser, ./demos/node, etc.)
 * NOTE: Transitions and entrance animations only *play* in desktop Microsoft
 *       PowerPoint. LibreOffice Impress and Apple Keynote render the final
 *       static state and will not animate playback.
 */

import { BASE_TABLE_OPTS, BASE_TEXT_OPTS_L, BASE_TEXT_OPTS_R } from "./enums.mjs";

const DOCS = "https://jsamuel1.github.io/PptxGenJS/";

export function genSlides_Animation(pptx) {
	pptx.addSection({ title: "Animation" });

	genSlide_Transitions(pptx);
	genSlide_AnimationTypes(pptx);
	genSlide_AnimationTriggers(pptx);
	genSlide_Gradients(pptx);
	genSlide_Counter(pptx);
}

/**
 * SLIDE 1: Slide Transitions
 * Each transition only plays on slide-advance, so we create one slide per
 * transition type. View as a slideshow (F5) in PowerPoint to see them.
 * @param {PptxGenJS} pptx
 */
function genSlide_Transitions(pptx) {
	const transitions = [
		{ type: "fade", color: pptx.colors.ACCENT1 },
		{ type: "push", direction: "left", color: pptx.colors.ACCENT2 },
		{ type: "wipe", direction: "up", color: pptx.colors.ACCENT3 },
		{ type: "cover", direction: "right", color: pptx.colors.ACCENT4 },
		{ type: "split", color: pptx.colors.ACCENT5 },
		{ type: "cut", color: pptx.colors.ACCENT6 },
	];

	transitions.forEach((trn, idx) => {
		const slide = pptx.addSlide({ sectionTitle: "Animation" });

		slide.addTable([[{ text: `Transition ${idx + 1}: '${trn.type}'`, options: BASE_TEXT_OPTS_L }, BASE_TEXT_OPTS_R]], BASE_TABLE_OPTS);
		slide.addNotes(`API Docs: ${DOCS}`);

		// Set the slide entrance transition (the fork feature being demoed)
		slide.transition = { type: trn.type, duration: 700, direction: trn.direction };

		const label = trn.direction ? `${trn.type} (${trn.direction})` : trn.type;
		slide.addText(`slide.transition =\n{ type: '${trn.type}'${trn.direction ? `, direction: '${trn.direction}'` : ""}, duration: 700 }`, {
			x: 1.0,
			y: 1.5,
			w: 11.33,
			h: 4.0,
			align: "center",
			valign: "middle",
			fontSize: 28,
			fontFace: "Courier New",
			color: "FFFFFF",
			fill: { color: trn.color },
		});
		slide.addText(label.toUpperCase(), { x: 1.0, y: 5.7, w: 11.33, h: 0.8, align: "center", fontSize: 18, color: trn.color, bold: true });
	});
}

/**
 * SLIDE 2: Entrance Animation Types
 * Demonstrates all four animation types; trigger 'afterPrevious' chains them so
 * they play in sequence when the slide is shown.
 * @param {PptxGenJS} pptx
 */
function genSlide_AnimationTypes(pptx) {
	const slide = pptx.addSlide({ sectionTitle: "Animation" });

	slide.addTable([[{ text: "Animation Types: appear / fadeIn / flyIn / zoomIn", options: BASE_TEXT_OPTS_L }, BASE_TEXT_OPTS_R]], BASE_TABLE_OPTS);
	slide.addNotes(`Run as a slideshow in PowerPoint to see each entrance. API Docs: ${DOCS}`);

	const boxOpts = { w: 5.5, h: 1.2, align: "center", valign: "middle", fontSize: 20, color: "FFFFFF" };

	slide.addText("appear", {
		...boxOpts,
		x: 0.7,
		y: 1.3,
		fill: { color: pptx.colors.ACCENT1 },
		animation: { type: "appear", trigger: "afterPrevious" },
	});
	slide.addText("fadeIn (duration: 800)", {
		...boxOpts,
		x: 7.0,
		y: 1.3,
		fill: { color: pptx.colors.ACCENT2 },
		animation: { type: "fadeIn", duration: 800, trigger: "afterPrevious" },
	});
	slide.addText("flyIn from left", {
		...boxOpts,
		x: 0.7,
		y: 3.1,
		fill: { color: pptx.colors.ACCENT3 },
		animation: { type: "flyIn", direction: "left", trigger: "afterPrevious" },
	});
	slide.addText("zoomIn", {
		...boxOpts,
		x: 7.0,
		y: 3.1,
		fill: { color: pptx.colors.ACCENT4 },
		animation: { type: "zoomIn", duration: 600, trigger: "afterPrevious" },
	});

	// flyIn from all four directions (shapes)
	const dirs = [
		{ direction: "left", x: 0.7 },
		{ direction: "up", x: 3.7 },
		{ direction: "down", x: 6.7 },
		{ direction: "right", x: 9.7 },
	];
	dirs.forEach((d) => {
		slide.addText(`flyIn\n${d.direction}`, {
			shape: pptx.shapes.ROUNDED_RECTANGLE,
			rectRadius: 0.1,
			x: d.x,
			y: 5.0,
			w: 2.8,
			h: 1.2,
			align: "center",
			valign: "middle",
			fontSize: 16,
			color: "FFFFFF",
			fill: { color: pptx.colors.ACCENT6 },
			animation: { type: "flyIn", direction: d.direction, duration: 600, trigger: "afterPrevious" },
		});
	});
}

/**
 * SLIDE 3: Animation Triggers & Stagger
 * Shows onClick / withPrevious / afterPrevious and delay-based stagger.
 * @param {PptxGenJS} pptx
 */
function genSlide_AnimationTriggers(pptx) {
	const slide = pptx.addSlide({ sectionTitle: "Animation" });

	slide.addTable([[{ text: "Animation Triggers & Stagger", options: BASE_TEXT_OPTS_L }, BASE_TEXT_OPTS_R]], BASE_TABLE_OPTS);
	slide.addNotes(`API Docs: ${DOCS}`);

	const rowOpts = { x: 1.0, w: 11.33, h: 0.9, align: "center", valign: "middle", fontSize: 18, color: "FFFFFF" };

	slide.addText("trigger: 'onClick' — waits for a click", {
		...rowOpts,
		y: 1.4,
		fill: { color: pptx.colors.ACCENT1 },
		animation: { type: "fadeIn", trigger: "onClick" },
	});
	slide.addText("trigger: 'withPrevious' — plays together with the previous", {
		...rowOpts,
		y: 2.5,
		fill: { color: pptx.colors.ACCENT2 },
		animation: { type: "fadeIn", trigger: "withPrevious" },
	});
	slide.addText("trigger: 'afterPrevious' — plays after the previous finishes", {
		...rowOpts,
		y: 3.6,
		fill: { color: pptx.colors.ACCENT3 },
		animation: { type: "fadeIn", trigger: "afterPrevious" },
	});

	// Staggered fly-in via increasing delay
	[0, 150, 300, 450].forEach((delay, idx) => {
		slide.addText(`stagger\n+${delay}ms`, {
			shape: pptx.shapes.ROUNDED_RECTANGLE,
			rectRadius: 0.1,
			x: 1.0 + idx * 3.0,
			y: 5.0,
			w: 2.6,
			h: 1.2,
			align: "center",
			valign: "middle",
			fontSize: 16,
			color: "FFFFFF",
			fill: { color: pptx.colors.ACCENT4 },
			animation: { type: "flyIn", direction: "up", delay, trigger: "afterPrevious" },
		});
	});
}

/**
 * SLIDE 4: Gradient Fills
 * @param {PptxGenJS} pptx
 */
function genSlide_Gradients(pptx) {
	const slide = pptx.addSlide({ sectionTitle: "Animation" });

	slide.addTable([[{ text: "Gradient Fills", options: BASE_TEXT_OPTS_L }, BASE_TEXT_OPTS_R]], BASE_TABLE_OPTS);
	slide.addNotes(`API Docs: ${DOCS}`);

	// Horizontal (0deg)
	slide.addText("horizontal", {
		x: 0.5,
		y: 1.3,
		w: 5.8,
		h: 1.6,
		align: "center",
		valign: "middle",
		fontSize: 22,
		color: "FFFFFF",
		fill: {
			type: "gradient",
			direction: "horizontal",
			stops: [
				{ position: 0, color: "0088CC" },
				{ position: 100, color: "00CC88" },
			],
		},
	});

	// Vertical (90deg)
	slide.addText("vertical", {
		x: 6.7,
		y: 1.3,
		w: 5.8,
		h: 1.6,
		align: "center",
		valign: "middle",
		fontSize: 22,
		color: "FFFFFF",
		fill: {
			type: "gradient",
			direction: "vertical",
			stops: [
				{ position: 0, color: "FF6600" },
				{ position: 100, color: "CC0066" },
			],
		},
	});

	// Diagonal (45deg) on a shape
	slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
		x: 0.5,
		y: 3.2,
		w: 5.8,
		h: 1.6,
		rectRadius: 0.15,
		fill: {
			type: "gradient",
			direction: "diagonal",
			stops: [
				{ position: 0, color: "8E2DE2" },
				{ position: 100, color: "4A00E0" },
			],
		},
	});
	slide.addText("diagonal (shape)", { x: 0.5, y: 3.2, w: 5.8, h: 1.6, align: "center", valign: "middle", fontSize: 22, color: "FFFFFF" });

	// 3-stop with per-stop transparency + custom angle
	slide.addText("3-stop + transparency (135deg)", {
		x: 6.7,
		y: 3.2,
		w: 5.8,
		h: 1.6,
		align: "center",
		valign: "middle",
		fontSize: 18,
		color: "FFFFFF",
		fill: {
			type: "gradient",
			direction: 135,
			stops: [
				{ position: 0, color: "121218" },
				{ position: 50, color: "1a1a24", transparency: 20 },
				{ position: 100, color: "0088CC" },
			],
		},
	});

	// Full-bleed dark gradient bar
	slide.addShape(pptx.shapes.RECTANGLE, {
		x: 0.5,
		y: 5.2,
		w: 12.0,
		h: 1.2,
		fill: {
			type: "gradient",
			direction: "horizontal",
			stops: [
				{ position: 0, color: "121218" },
				{ position: 100, color: "2a2a3a" },
			],
		},
	});
	slide.addText("full-width gradient bar", { x: 0.5, y: 5.2, w: 12.0, h: 1.2, align: "center", valign: "middle", fontSize: 18, color: "FFFFFF" });
}

/**
 * SLIDE 5: Number Counter (odometer sugar)
 * @param {PptxGenJS} pptx
 */
function genSlide_Counter(pptx) {
	const slide = pptx.addSlide({ sectionTitle: "Animation" });

	slide.addTable([[{ text: "Number Counter (count-up sugar)", options: BASE_TEXT_OPTS_L }, BASE_TEXT_OPTS_R]], BASE_TABLE_OPTS);
	slide.addNotes(`Counts up frame-by-frame in a PowerPoint slideshow. API Docs: ${DOCS}`);

	slide.addText("", {
		x: 1.0,
		y: 1.6,
		w: 5.0,
		h: 2.5,
		align: "center",
		valign: "middle",
		fontSize: 72,
		bold: true,
		color: pptx.colors.ACCENT1,
		counter: { from: 0, to: 100, suffix: "%", stepMs: 40 },
	});

	slide.addText("", {
		x: 7.3,
		y: 1.6,
		w: 5.0,
		h: 2.5,
		align: "center",
		valign: "middle",
		fontSize: 72,
		bold: true,
		color: pptx.colors.ACCENT4,
		counter: { from: 1, to: 7, suffix: "x", stepMs: 250 },
	});

	slide.addText(
		"counter: { from: 0, to: 100, suffix: '%', stepMs: 40 }\ncounter: { from: 1, to: 7, suffix: 'x', stepMs: 250 }",
		{ x: 1.0, y: 4.6, w: 11.33, h: 1.6, align: "center", valign: "middle", fontSize: 18, fontFace: "Courier New", color: "696969" }
	);
}
