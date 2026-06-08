'use strict'

// Schema-validation fixtures. Each case builds a representative `.pptx`
// and asserts the OpenXmlValidator (via OOXMLValidatorCLI) reports no
// errors.
//
// Fixtures are intentionally small and orthogonal — they exercise one
// API surface each — so when an error appears we can localise it.
//
// Run with: npm run schema-test

const { build, assert, readEntry, listEntries } = require('./helpers')
const { validateBuf } = require('./validator')

async function expectNoSchemaErrors (buf, label) {
	const errors = await validateBuf(buf)
	if (errors.length === 0) return
	const summary = errors
		.slice(0, 5)
		.map(e => `  - [${e.ErrorType}] ${e.Description} (path: ${(e.Path && e.Path.PartUri) || '?'})`)
		.join('\n')
	const more = errors.length > 5 ? `\n  ...(${errors.length - 5} more)` : ''
	assert(
		false,
		`${label}: ${errors.length} schema error(s):\n${summary}${more}`
	)
}

module.exports = [
	{
		name: 'empty deck (one slide, no content)',
		fn: async () => {
			const { buf } = await build(p => { p.addSlide() })
			await expectNoSchemaErrors(buf, 'empty-deck')
		}
	},
	{
		name: 'single text box',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addText('hello', { x: 1, y: 1, w: 4, h: 0.5 })
			})
			await expectNoSchemaErrors(buf, 'single-text')
		}
	},
	{
		name: 'single rectangle shape',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' } })
			})
			await expectNoSchemaErrors(buf, 'single-shape')
		}
	},
	{
		name: 'shape with shadow',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 1,
					fill: { color: '00B0B9' },
					shadow: { type: 'outer', blur: 6, offset: 2, color: '000000', opacity: 0.15 }
				})
			})
			await expectNoSchemaErrors(buf, 'shape-with-shadow')
		}
	},
	{
		name: 'shape with reflection (a:reflection) — alone + combined canonical order + default-off',
		fn: async () => {
			const { buf, zip } = await build(p => {
				// slide1: reflection alone
				const s1 = p.addSlide()
				s1.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 2, fill: { color: '7C3AED' },
					reflection: { blur: 0.5, distance: 0, size: 50, opacity: 50, fadeDirection: 90 }
				})
				// slide2: shadow + reflection + glow together (canonical CT_EffectList order)
				const s2 = p.addSlide()
				s2.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 2, fill: { color: '00B0B9' },
					shadow: { type: 'outer', blur: 6, offset: 2, color: '000000', opacity: 0.15 },
					glow: { size: 5, color: 'FFFF00', opacity: 0.3 },
					reflection: { blur: 0.5, distance: 0, size: 40, opacity: 60, fadeDirection: 90 }
				})
				// slide3: no effects (default-off proof)
				p.addSlide().addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' } })
			})

			// slide1: exact reflection emission (regression-catch on the converted attrs + fixed constants)
			const s1xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			assert(
				/<a:reflection blurRad="6350" stA="50000" endA="300" endPos="50000" dist="0" dir="5400000" sy="-100000" rotWithShape="0"\/>/.test(s1xml),
				'reflection: expected <a:reflection blurRad="6350" stA="50000" endA="300" endPos="50000" dist="0" dir="5400000" sy="-100000" rotWithShape="0"/>'
			)

			// slide2: single effectLst with canonical child order glow < outerShdw < reflection (regression-catch for RI-15 reorder)
			const s2xml = await readEntry(zip, 'ppt/slides/slide2.xml')
			assert((s2xml.match(/<a:effectLst>/g) || []).length === 1, 'combined: expected exactly one <a:effectLst>')
			const idxGlow = s2xml.indexOf('<a:glow')
			const idxShdw = s2xml.indexOf('<a:outerShdw')
			const idxRefl = s2xml.indexOf('<a:reflection')
			assert(idxGlow >= 0 && idxShdw >= 0 && idxRefl >= 0, 'combined: expected glow + outerShdw + reflection all present')
			assert(idxGlow < idxShdw && idxShdw < idxRefl, 'combined: expected canonical CT_EffectList order glow < outerShdw < reflection')

			// slide3: no reflection / no effectLst when no effects set (default-off)
			const s3xml = await readEntry(zip, 'ppt/slides/slide3.xml')
			assert(!/<a:reflection\b/.test(s3xml), 'default-off: plain shape must NOT emit <a:reflection>')
			assert(!/<a:effectLst>/.test(s3xml), 'default-off: plain shape must NOT emit <a:effectLst>')

			await expectNoSchemaErrors(buf, 'shape-reflection')
		}
	},
	{
		name: 'shape with soft edge (a:softEdge) — alone + combined canonical order + default-off + radius<=0 omit',
		fn: async () => {
			const { buf, zip } = await build(p => {
				// slide1: softEdge alone
				const s1 = p.addSlide()
				s1.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 2, fill: { color: '7C3AED' },
					softEdge: { radius: 0.1 }
				})
				// slide2: shadow + glow + reflection + softEdge together (canonical CT_EffectList order)
				const s2 = p.addSlide()
				s2.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 2, fill: { color: '00B0B9' },
					shadow: { type: 'outer', blur: 6, offset: 2, color: '000000', opacity: 0.15 },
					glow: { size: 5, color: 'FFFF00', opacity: 0.3 },
					reflection: { blur: 0.5, distance: 0, size: 40, opacity: 60, fadeDirection: 90 },
					softEdge: { radius: 0.05 }
				})
				// slide3: no effects (default-off proof)
				p.addSlide().addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' } })
				// slide4: radius <= 0 (gate omit proof)
				p.addSlide().addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 2, h: 1, fill: { color: '00FF00' }, softEdge: { radius: 0 } })
			})

			// slide1: exact softEdge emission (regression-catch on the inches→EMU conversion: 0.1 × 914400 = 91440)
			const s1xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			assert(
				/<a:softEdge rad="91440"\/>/.test(s1xml),
				'softEdge: expected <a:softEdge rad="91440"/>'
			)

			// slide2: single effectLst, canonical child order glow < outerShdw < reflection < softEdge (softEdge-last regression-catch)
			const s2xml = await readEntry(zip, 'ppt/slides/slide2.xml')
			assert((s2xml.match(/<a:effectLst>/g) || []).length === 1, 'combined: expected exactly one <a:effectLst>')
			const idxGlow = s2xml.indexOf('<a:glow')
			const idxShdw = s2xml.indexOf('<a:outerShdw')
			const idxRefl = s2xml.indexOf('<a:reflection')
			const idxSoft = s2xml.indexOf('<a:softEdge')
			assert(idxGlow >= 0 && idxShdw >= 0 && idxRefl >= 0 && idxSoft >= 0, 'combined: expected glow + outerShdw + reflection + softEdge all present')
			assert(idxGlow < idxShdw && idxShdw < idxRefl && idxRefl < idxSoft, 'combined: expected canonical CT_EffectList order glow < outerShdw < reflection < softEdge')

			// slide3: no softEdge / no effectLst when no effects set (default-off)
			const s3xml = await readEntry(zip, 'ppt/slides/slide3.xml')
			assert(!/<a:softEdge\b/.test(s3xml), 'default-off: plain shape must NOT emit <a:softEdge>')
			assert(!/<a:effectLst>/.test(s3xml), 'default-off: plain shape must NOT emit <a:effectLst>')

			// slide4: radius <= 0 omits the effect (and, as sole effect, no effectLst)
			const s4xml = await readEntry(zip, 'ppt/slides/slide4.xml')
			assert(!/<a:softEdge\b/.test(s4xml), 'radius<=0: must NOT emit <a:softEdge>')
			assert(!/<a:effectLst>/.test(s4xml), 'radius<=0: sole effect omitted must NOT emit <a:effectLst>')

			await expectNoSchemaErrors(buf, 'shape-softedge')
		}
	},
	{
		name: 'solid-color slide background',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.background = { color: '0088CC' }
				s.addText('hi', { x: 1, y: 1 })
			})
			await expectNoSchemaErrors(buf, 'solid-bg')
		}
	},
	{
		name: 'bullet text',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addText('item', { x: 1, y: 1, w: 4, h: 0.5, bullet: true })
			})
			await expectNoSchemaErrors(buf, 'bullet-text')
		}
	},
	{
		name: 'simple table',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addTable(
					[
						[ { text: 'A1' }, { text: 'B1' } ],
						[ { text: 'A2' }, { text: 'B2' } ]
					],
					{ x: 1, y: 1, w: 4 }
				)
			})
			await expectNoSchemaErrors(buf, 'simple-table')
		}
	},
	{
		name: 'embedded PNG image',
		fn: async () => {
			const b64 =
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
			const { buf } = await build(p => {
				p.addSlide().addImage({ data: 'image/png;base64,' + b64, x: 1, y: 1, w: 1, h: 1 })
			})
			await expectNoSchemaErrors(buf, 'embedded-png')
		}
	},
	{
		name: 'gradient-fill shape (3-stop horizontal)',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 1,
					fill: {
						type: 'gradient', direction: 'horizontal',
						stops: [
							{ position: 0, color: '7C3AED' },
							{ position: 50, color: 'A78BFA' },
							{ position: 100, color: '38BDF8' }
						]
					}
				})
			})
			await expectNoSchemaErrors(buf, 'gradient-shape')
		}
	},
	{
		name: 'gradient-fill shape with per-stop transparency',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 1,
					fill: {
						type: 'gradient', direction: 45,
						stops: [
							{ position: 0, color: '7C3AED', transparency: 40 },
							{ position: 100, color: '38BDF8' }
						]
					}
				})
			})
			await expectNoSchemaErrors(buf, 'gradient-shape-alpha')
		}
	},
	{
		name: 'slide with fade transition',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.transition = { type: 'fade', duration: 500 }
				s.addText('hi', { x: 1, y: 1, w: 4, h: 1 })
			})
			await expectNoSchemaErrors(buf, 'transition-fade')
		}
	},
	{
		name: 'slide with directional push transition',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.transition = { type: 'push', direction: 'left', duration: 750 }
				s.addText('hi', { x: 1, y: 1, w: 4, h: 1 })
			})
			await expectNoSchemaErrors(buf, 'transition-push')
		}
	},
	{
		name: 'slide with appear + fadeIn animations',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addText('title', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn', duration: 420 } })
				s.addText('sub', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'appear', delay: 90 } })
			})
			await expectNoSchemaErrors(buf, 'animation-appear-fadein')
		}
	},
	{
		name: 'slide with staggered fadeIn animations',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addText('a', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn', delay: 0 } })
				s.addText('b', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'fadeIn', delay: 90 } })
				s.addText('c', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'fadeIn', delay: 180 } })
			})
			await expectNoSchemaErrors(buf, 'animation-staggered')
		}
	},
	{
		name: 'slide with flyIn animations (all four directions)',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'flyIn', direction: 'left' } })
				s.addShape('rect', { x: 4, y: 1, w: 2, h: 1, fill: { color: '00FF00' }, animation: { type: 'flyIn', direction: 'right' } })
				s.addShape('rect', { x: 1, y: 3, w: 2, h: 1, fill: { color: '0000FF' }, animation: { type: 'flyIn', direction: 'up', duration: 650 } })
				s.addShape('rect', { x: 4, y: 3, w: 2, h: 1, fill: { color: 'FFFF00' }, animation: { type: 'flyIn', direction: 'down' } })
			})
			await expectNoSchemaErrors(buf, 'animation-flyin')
		}
	},
	{
		name: 'slide with zoomIn animations',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'zoomIn' } })
				s.addText('zoom', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'zoomIn', duration: 720, delay: 90 } })
			})
			await expectNoSchemaErrors(buf, 'animation-zoomin')
		}
	},
	{
		name: 'slide with emphasis animations (spin/grow/colorPulse/pulse)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'spin', spinDegrees: 720 } })
				s.addShape('rect', { x: 4, y: 1, w: 2, h: 1, fill: { color: '00FF00' }, animation: { type: 'grow', growScale: 2 } })
				s.addText('flash', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'colorPulse', color: 'FF00FF', duration: 600 } })
				s.addText('pulse', { x: 1, y: 4, w: 4, h: 1, animation: { type: 'pulse' } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Regression-catch: emphasis members must carry presetClass="emph" (not the hardcoded "entr")
			assert(/presetClass="emph"/.test(xml), 'emphasis: expected presetClass="emph" in timing block')
			assert(!/presetClass="entr"/.test(xml), 'emphasis: must NOT emit presetClass="entr" for emphasis-only slide')
			// Each effect emits its distinguishing payload element
			assert(/<p:animRot by="43200000"/.test(xml), 'spin: expected <p:animRot by="43200000"> (720° × 60000)')
			assert(/<p:animScale><p:cBhvr>[\s\S]*?<p:by x="200000" y="200000"\/>/.test(xml), 'grow: expected <p:animScale> with <p:by x="200000" y="200000">')
			assert(/<p:animClr clrSpc="rgb">[\s\S]*?<p:to><a:srgbClr val="FF00FF"\/>/.test(xml), 'colorPulse: expected <p:animClr> with target srgbClr val="FF00FF"')
			assert(/<p:attrName>style.opacity<\/p:attrName>/.test(xml), 'pulse: expected <p:anim> on style.opacity')
			// Emphasis targets an already-visible object: no leading visibility <p:set>
			assert(!/<p:strVal val="visible"\/>/.test(xml), 'emphasis: must NOT emit the entrance visibility <p:set>')
			await expectNoSchemaErrors(buf, 'animation-emphasis')
		}
	},
	{
		name: 'slide with exit animations (disappear/fadeOut/flyOut/zoomOut)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'disappear' } })
				s.addText('fade', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'fadeOut', duration: 600 } })
				s.addShape('rect', { x: 4, y: 1, w: 2, h: 1, fill: { color: '00FF00' }, animation: { type: 'flyOut', direction: 'right' } })
				s.addShape('rect', { x: 4, y: 3, w: 2, h: 1, fill: { color: '0000FF' }, animation: { type: 'zoomOut', duration: 720 } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Regression-catch: exit members must carry presetClass="exit" (not "entr"/"emph")
			assert(/presetClass="exit"/.test(xml), 'exit: expected presetClass="exit" in timing block')
			assert(!/presetClass="entr"/.test(xml), 'exit: must NOT emit presetClass="entr" for exit-only slide')
			assert(!/presetClass="emph"/.test(xml), 'exit: must NOT emit presetClass="emph" for exit-only slide')
			// Each effect emits its distinguishing payload element
			assert(/<p:strVal val="hidden"\/>/.test(xml), 'disappear: expected <p:set> to visibility hidden')
			assert(/<p:animEffect transition="out" filter="fade">/.test(xml), 'fadeOut: expected <p:animEffect transition="out" filter="fade">')
			assert(/<p:strVal val="#ppt_x\+1slide"\/>/.test(xml), 'flyOut: expected end value #ppt_x+1slide (exit toward right)')
			assert(/<p:attrName>ppt_w<\/p:attrName>[\s\S]*?<p:tav tm="100000"><p:val><p:strVal val="0"\/>/.test(xml), 'zoomOut: expected ppt_w scaling to 0')
			// Exit targets an already-visible object: no leading visibility show <p:set>
			assert(!/<p:strVal val="visible"\/>/.test(xml), 'exit: must NOT emit the entrance visibility <p:set>')
			await expectNoSchemaErrors(buf, 'animation-exit')
		}
	},
	{
		name: 'slide master header/footer (p:hf + footer/date placeholders)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.defineSlideMaster({
					title: 'HF_MASTER',
					headerFooter: { slideNumber: true, dateTime: { format: 'datetime1' }, footer: 'Confidential' }
				})
				p.addSlide({ masterName: 'HF_MASTER' })
			})
			// The first user-defined master lands AFTER the default layout (index 0 → slideLayout1.xml),
			// so scan all slideLayout parts for the derived <p:hf> rather than hardcoding an index.
			const layoutPaths = listEntries(zip).filter(n => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n))
			let hfLayout = null
			for (const path of layoutPaths) {
				const x = await readEntry(zip, path)
				if (/<p:hf\b/.test(x)) { hfLayout = x; break }
			}
			assert(hfLayout !== null, 'header-footer: expected a slideLayout carrying a derived <p:hf>')
			// Regression-catch: derived <p:hf> must reflect the config (sldNum/ftr/dt = 1, hdr = 0)
			assert(/<p:hf sldNum="1" hdr="0" ftr="1" dt="1"\/>/.test(hfLayout), 'header-footer: expected <p:hf sldNum="1" hdr="0" ftr="1" dt="1"/>')
			// Footer placeholder + its literal text must be present
			assert(/<p:ph type="ftr" sz="quarter" idx="4"\/>/.test(hfLayout), 'header-footer: expected footer placeholder <p:ph type="ftr">')
			assert(/<a:t>Confidential<\/a:t>/.test(hfLayout), 'header-footer: expected footer literal text "Confidential"')
			// Date placeholder (auto field) must be present
			assert(/<p:ph type="dt" idx="1"\/>/.test(hfLayout), 'header-footer: expected date placeholder <p:ph type="dt">')
			assert(/type="datetime1"/.test(hfLayout), 'header-footer: expected date auto-field type="datetime1"')
			// Default-off invariant: the default (unconfigured) layout must carry NO <p:hf>
			const defaultLayout = await readEntry(zip, 'ppt/slideLayouts/slideLayout1.xml')
			assert(!/<p:hf\b/.test(defaultLayout), 'header-footer: default layout must NOT emit <p:hf>')
			await expectNoSchemaErrors(buf, 'header-footer')
		}
	},
	{
		name: 'per-slide header/footer (slide.headerFooter ftr/dt placeholders)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s1 = p.addSlide()
				s1.headerFooter = { footer: 'Confidential — Slide 1', dateTime: { value: 'Q1 2026' } }
				// A second slide with NO headerFooter set → proves the default-off invariant
				p.addSlide()
			})
			const slide1 = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Regression-catch: slide1 must carry its own footer placeholder + literal text
			assert(/<p:ph type="ftr" sz="quarter" idx="4"\/>/.test(slide1), 'per-slide hf: expected footer placeholder <p:ph type="ftr"> in slide1')
			assert(/<a:t>Confidential — Slide 1<\/a:t>/.test(slide1), 'per-slide hf: expected footer literal text "Confidential — Slide 1" in slide1')
			// Date placeholder with literal (static) value
			assert(/<p:ph type="dt" idx="1"\/>/.test(slide1), 'per-slide hf: expected date placeholder <p:ph type="dt"> in slide1')
			assert(/<a:t>Q1 2026<\/a:t>/.test(slide1), 'per-slide hf: expected date literal text "Q1 2026" in slide1')
			// Default-off invariant: the no-config slide2 must carry NO footer placeholder
			const slide2 = await readEntry(zip, 'ppt/slides/slide2.xml')
			assert(!/<p:ph type="ftr"/.test(slide2), 'per-slide hf: slide2 (no config) must NOT emit a footer placeholder')
			assert(!/<p:ph type="dt"/.test(slide2), 'per-slide hf: slide2 (no config) must NOT emit a date placeholder')
			await expectNoSchemaErrors(buf, 'header-footer-per-slide')
		}
	},
	{
		name: 'notes-master header/footer (pptx.notesMaster p:hf + hdr/ftr text)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.notesMaster = { header: 'Internal Draft', footer: 'Confidential — Notes', slideNumber: true, dateTime: true }
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const notesMaster = await readEntry(zip, 'ppt/notesMasters/notesMaster1.xml')
			// Regression-catch: injected <p:hf> reflects the config (all four flags = 1) in the correct CT_NotesMaster position
			assert(/<p:hf sldNum="1" hdr="1" ftr="1" dt="1"\/>/.test(notesMaster), 'notes-hf: expected <p:hf sldNum="1" hdr="1" ftr="1" dt="1"/>')
			// <p:hf> must sit after </p:clrMap> and before <p:notesStyle> (CT_NotesMaster child order)
			assert(/folHlink="folHlink"\/><p:hf [^>]*\/><p:notesStyle>/.test(notesMaster), 'notes-hf: <p:hf> must be between </p:clrMap> and <p:notesStyle>')
			// Header placeholder filled with literal text
			assert(/<a:t>Internal Draft<\/a:t>/.test(notesMaster), 'notes-hf: expected header literal text "Internal Draft"')
			// Footer placeholder filled with literal text
			assert(/<a:t>Confidential — Notes<\/a:t>/.test(notesMaster), 'notes-hf: expected footer literal text "Confidential — Notes"')
			// Default-off invariant: a deck with NO notesMaster config must emit NO <p:hf> in notesMaster1.xml
			const { zip: zip2 } = await build(p => {
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const notesMasterDefault = await readEntry(zip2, 'ppt/notesMasters/notesMaster1.xml')
			assert(!/<p:hf\b/.test(notesMasterDefault), 'notes-hf: default (no config) notesMaster1.xml must NOT emit <p:hf>')
			await expectNoSchemaErrors(buf, 'header-footer-notes-master')
		}
	},
	{
		name: 'slide with number-counter (stacked appear/disappear frames)',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addText('', { x: 1, y: 1, w: 4, h: 1, fontSize: 48, counter: { from: 1, to: 3, suffix: '%', stepMs: 180 } })
			})
			await expectNoSchemaErrors(buf, 'animation-counter')
		}
	},
	{
		name: 'multi-column text (numCol/spcCol on bodyPr)',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addText('lorem ipsum dolor sit amet, consectetur adipiscing elit', { x: 1, y: 1, w: 6, h: 3, columns: 2, columnSpacing: 0.4 })
			})
			await expectNoSchemaErrors(buf, 'multicol-text')
		}
	},
	{
		name: 'svgPath custom-geometry shape (triangle)',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 2, h: 2,
					fill: { color: '7C3AED' },
					svgPath: { d: 'M 0 0 L 12 0 L 6 12 Z', viewBox: { w: 12, h: 12 } }
				})
			})
			await expectNoSchemaErrors(buf, 'svgpath-triangle')
		}
	},
	{
		name: 'svgPath custom-geometry shape (cubic + quadratic + relative)',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 3, h: 3,
					fill: { color: '38BDF8' },
					svgPath: { d: 'M 0 0 C 0 12 12 12 12 0 Q 6 6 0 0 z m 2 2 l 4 0 l 0 4 z', viewBox: { w: 24, h: 24 } }
				})
			})
			await expectNoSchemaErrors(buf, 'svgpath-curves')
		}
	},
	{
		name: 'sections emit uppercase GUID ids (ST_Guid)',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSection({ title: 'Intro' })
				p.addSlide({ sectionTitle: 'Intro' }).addText('hi', { x: 1, y: 1, w: 4, h: 1 })
				p.addSection({ title: 'Body' })
				p.addSlide({ sectionTitle: 'Body' }).addText('there', { x: 1, y: 1, w: 4, h: 1 })
			})
			await expectNoSchemaErrors(buf, 'sections-guid')
		}
	},
	{
		name: 'shape group (addGroup) with nested shape + text',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				const g = s.addGroup({ x: 1, y: 2, w: 8, h: 4 })
				g.addShape('roundRect', { x: 0.5, y: 0.5, w: 2, h: 2, fill: { color: '1A1A24' } })
				g.addText('Grouped', { x: 0.6, y: 0.7, w: 1.8, h: 1, color: 'FFFFFF' })
			})
			await expectNoSchemaErrors(buf, 'shape-group')
		}
	},
	{
		name: 'line shape with negative width normalizes to positive cx + flipH',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.addSlide().addShape('line', { x: 5, y: 2, w: -2, h: 1, line: { color: '7C3AED', width: 1 } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// The first <a:xfrm> belongs to the spTree group (has chOff/chExt); select the shape's xfrm.
			const xfrm = (xml.match(/<a:xfrm[^>]*>(?:(?!<\/a:xfrm>).)*?<\/a:xfrm>/gs) || []).find(x => !x.includes('chOff')) || ''
			const cx = Number((xfrm.match(/<a:ext\s+cx="(-?\d+)"/) || [])[1])
			assert(cx > 0, `negative-width line: expected cx > 0, got ${cx} (xfrm: ${xfrm})`)
			assert(/<a:xfrm[^>]*\bflipH="1"/.test(xfrm), `negative-width line: expected flipH="1" on xfrm (xfrm: ${xfrm})`)
			await expectNoSchemaErrors(buf, 'line-negative-width')
		}
	},
	{
		name: 'line shape with negative height normalizes to positive cy + flipV',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.addSlide().addShape('line', { x: 5, y: 4, w: 2, h: -1.5, line: { color: '38BDF8', width: 1 } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			const xfrm = (xml.match(/<a:xfrm[^>]*>(?:(?!<\/a:xfrm>).)*?<\/a:xfrm>/gs) || []).find(x => !x.includes('chOff')) || ''
			const cy = Number((xfrm.match(/<a:ext\s+cx="-?\d+"\s+cy="(-?\d+)"/) || [])[1])
			assert(cy > 0, `negative-height line: expected cy > 0, got ${cy} (xfrm: ${xfrm})`)
			assert(/<a:xfrm[^>]*\bflipV="1"/.test(xfrm), `negative-height line: expected flipV="1" on xfrm (xfrm: ${xfrm})`)
			await expectNoSchemaErrors(buf, 'line-negative-height')
		}
	},
	{
		name: 'rect shape with negative width normalizes to positive cx + flipH',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.addSlide().addShape('rect', { x: 5, y: 2, w: -2, h: 1, fill: { color: '7C3AED' } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// The first <a:xfrm> belongs to the spTree group (has chOff/chExt); select the shape's xfrm.
			const xfrm = (xml.match(/<a:xfrm[^>]*>(?:(?!<\/a:xfrm>).)*?<\/a:xfrm>/gs) || []).find(x => !x.includes('chOff')) || ''
			const cx = Number((xfrm.match(/<a:ext\s+cx="(-?\d+)"/) || [])[1])
			assert(cx > 0, `negative-width rect: expected cx > 0, got ${cx} (xfrm: ${xfrm})`)
			assert(/<a:xfrm[^>]*\bflipH="1"/.test(xfrm), `negative-width rect: expected flipH="1" on xfrm (xfrm: ${xfrm})`)
			await expectNoSchemaErrors(buf, 'rect-negative-width')
		}
	},
	{
		name: 'image with negative height normalizes to positive cy + flipV',
		fn: async () => {
			const b64 =
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
			const { buf, zip } = await build(p => {
				p.addSlide().addImage({ data: 'image/png;base64,' + b64, x: 1, y: 4, w: 2, h: -1.5 })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			const xfrm = (xml.match(/<a:xfrm[^>]*>(?:(?!<\/a:xfrm>).)*?<\/a:xfrm>/gs) || []).find(x => !x.includes('chOff')) || ''
			const cy = Number((xfrm.match(/<a:ext\s+cx="-?\d+"\s+cy="(-?\d+)"/) || [])[1])
			assert(cy > 0, `negative-height image: expected cy > 0, got ${cy} (xfrm: ${xfrm})`)
			assert(/<a:xfrm[^>]*\bflipV="1"/.test(xfrm), `negative-height image: expected flipV="1" on xfrm (xfrm: ${xfrm})`)
			await expectNoSchemaErrors(buf, 'image-negative-height')
		}
	},
	{
		name: 'shape shadow with out-of-range angle/opacity clamps to valid ST_PositiveFixedAngle + alpha',
		fn: async () => {
			// angle=-45 (<0) and opacity=1.5 (>1) are both out of range; correctShadowOptions
			// (gen-utils) must reset them to the defaults 270° / 0.75 before emit. Without the
			// clamp the emit produces dir="-2700000" (negative ST_PositiveFixedAngle) and
			// alpha val="150000" (>100000 ST_PositiveFixedPercentage) — both schema-invalid.
			const { buf, zip } = await build(p => {
				p.addSlide().addShape('rect', {
					x: 1, y: 1, w: 4, h: 1,
					fill: { color: '00B0B9' },
					shadow: { type: 'outer', blur: 6, offset: 2, color: '000000', angle: -45, opacity: 1.5 }
				})
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			const shdw = (xml.match(/<a:outerShdw[^>]*>/) || [])[0] || ''
			const dir = Number((shdw.match(/\bdir="(-?\d+)"/) || [])[1])
			// ST_PositiveFixedAngle: 0 .. 21600000 (60000ths of a degree, 0-360°)
			assert(dir >= 0 && dir <= 21600000, `shadow angle: expected dir in 0..21600000, got ${dir} (shdw: ${shdw})`)
			assert(dir === 16200000, `shadow angle: expected out-of-range -45 to clamp to 270° (16200000), got ${dir}`)
			const alpha = Number((xml.match(/<a:outerShdw[\s\S]*?<a:alpha\s+val="(-?\d+)"/) || [])[1])
			// ST_PositiveFixedPercentage: 0 .. 100000
			assert(alpha >= 0 && alpha <= 100000, `shadow opacity: expected alpha in 0..100000, got ${alpha}`)
			assert(alpha === 75000, `shadow opacity: expected out-of-range 1.5 to clamp to 0.75 (75000), got ${alpha}`)
			await expectNoSchemaErrors(buf, 'shadow-out-of-range-clamp')
		}
	},
	{
		name: 'bar chart (single series, multi category)',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.BAR, [
					{ name: 'Sales', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [12, 26, 18, 31] }
				], { x: 1, y: 1, w: 6, h: 3 })
			})
			await expectNoSchemaErrors(buf, 'chart-bar')
		}
	},
	{
		name: 'line chart (multi series)',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.LINE, [
					{ name: 'North', labels: ['Jan', 'Feb', 'Mar'], values: [10, 20, 15] },
					{ name: 'South', labels: ['Jan', 'Feb', 'Mar'], values: [5, 12, 22] }
				], { x: 1, y: 1, w: 6, h: 3 })
			})
			await expectNoSchemaErrors(buf, 'chart-line')
		}
	},
	{
		name: 'pie chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.PIE, [
					{ name: 'Share', labels: ['A', 'B', 'C'], values: [40, 35, 25] }
				], { x: 1, y: 1, w: 5, h: 4 })
			})
			await expectNoSchemaErrors(buf, 'chart-pie')
		}
	},
	{
		name: 'doughnut chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.DOUGHNUT, [
					{ name: 'Share', labels: ['A', 'B', 'C', 'D'], values: [10, 20, 30, 40] }
				], { x: 1, y: 1, w: 5, h: 4, holeSize: 60 })
			})
			await expectNoSchemaErrors(buf, 'chart-doughnut')
		}
	},
	{
		name: 'area chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.AREA, [
					{ name: 'Traffic', labels: ['Mon', 'Tue', 'Wed', 'Thu'], values: [3, 7, 5, 9] }
				], { x: 1, y: 1, w: 6, h: 3 })
			})
			await expectNoSchemaErrors(buf, 'chart-area')
		}
	},
	{
		name: 'radar chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.RADAR, [
					{ name: 'Skill', labels: ['Speed', 'Power', 'Range', 'Agility', 'Stamina'], values: [4, 5, 3, 4, 2] }
				], { x: 1, y: 1, w: 5, h: 4 })
			})
			await expectNoSchemaErrors(buf, 'chart-radar')
		}
	},
	{
		name: 'bar3D chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.BAR3D, [
					{ name: 'Units', labels: ['X', 'Y', 'Z'], values: [8, 14, 6] }
				], { x: 1, y: 1, w: 6, h: 3 })
			})
			await expectNoSchemaErrors(buf, 'chart-bar3d')
		}
	},
	{
		name: 'scatter (XY) chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.SCATTER, [
					{ name: 'X-Axis', values: [0, 1, 2, 3, 4, 5] },
					{ name: 'Y-Value 1', values: [90, 80, 70, 85, 75, 92] },
					{ name: 'Y-Value 2', values: [21, 32, 40, 49, 31, 29] }
				], { x: 1, y: 1, w: 6, h: 3, showLabel: true })
			})
			await expectNoSchemaErrors(buf, 'chart-scatter')
		}
	},
	{
		name: 'bubble chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.BUBBLE, [
					{ name: 'X-Axis', values: [0.3, 0.6, 0.9, 1.2, 1.5, 1.7] },
					{ name: 'Y-Value 1', values: [1.3, 9, 7.5, 2.5, 7.5, 3], sizes: [1, 4, 2, 3, 7, 4] },
					{ name: 'Y-Value 2', values: [5.0, 3, 2.0, 7.0, 2.0, 9], sizes: [9, 7, 9, 2, 4, 8] }
				], { x: 1, y: 1, w: 6, h: 3 })
			})
			await expectNoSchemaErrors(buf, 'chart-bubble')
		}
	},
	{
		name: 'bar chart with explicit value-axis min/max',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.BAR, [
					{ name: 'Score', labels: ['A', 'B', 'C'], values: [20, 55, 80] }
				], { x: 1, y: 1, w: 6, h: 3, valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20 })
			})
			await expectNoSchemaErrors(buf, 'chart-bar-axis-minmax')
		}
	},
	{
		name: 'multi-type combo chart (bar + secondary line)',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart([
					{ type: p.charts.BAR, data: [{ name: 'Revenue', labels: ['Q1', 'Q2', 'Q3'], values: [10, 20, 30] }], options: {} },
					{ type: p.charts.LINE, data: [{ name: 'Growth', labels: ['Q1', 'Q2', 'Q3'], values: [1, 2, 3] }], options: { secondaryValAxis: true, secondaryCatAxis: true } }
				], { x: 1, y: 1, w: 6, h: 3, valAxes: [{ showValAxisTitle: false }, { showValAxisTitle: false }], catAxes: [{}, {}] })
			})
			await expectNoSchemaErrors(buf, 'chart-combo')
		}
	},
	{
		name: 'bar3D chart out-of-range v3DRotY/v3DPerspective clamp to valid ST_RotY/ST_Perspective',
		fn: async () => {
			// v3DRotY=400 (>360) and v3DPerspective=300 (>240) are out of range; the chart
			// option clamp (gen-objects.ts:296,298) must reset both to the default 30 before
			// the bar3d emit (gen-charts.ts:586). Without the clamp, <c:rotY val="400"/>
			// (>ST_RotY max 360) and <c:perspective val="300"/> (>ST_Perspective max 240)
			// are both schema-invalid. Clamp bounds == schema bounds exactly.
			const { buf, zip } = await build(p => {
				p.addSlide().addChart(p.charts.BAR3D, [
					{ name: 'Units', labels: ['X', 'Y', 'Z'], values: [8, 14, 6] }
				], { x: 1, y: 1, w: 6, h: 3, v3DRotY: 400, v3DPerspective: 300 })
			})
			// chartId is a module-global counter, so the entry is NOT necessarily chart1.xml;
			// locate the single chart entry generically.
			const chartPath = listEntries(zip).find(e => /^ppt\/charts\/chart\d+\.xml$/.test(e))
			assert(chartPath, `bar3D chart: expected a ppt/charts/chartN.xml entry (got: ${listEntries(zip).filter(e => e.includes('chart')).join(', ')})`)
			const xml = await readEntry(zip, chartPath)
			const view3D = (xml.match(/<c:view3D>[\s\S]*?<\/c:view3D>/) || [])[0] || ''
			const rotY = Number((view3D.match(/<c:rotY\s+val="(-?\d+)"/) || [])[1])
			// ST_RotY: 0 .. 360
			assert(rotY >= 0 && rotY <= 360, `v3DRotY: expected rotY in 0..360, got ${rotY} (view3D: ${view3D})`)
			assert(rotY === 30, `v3DRotY: expected out-of-range 400 to clamp to default 30, got ${rotY}`)
			const persp = Number((view3D.match(/<c:perspective\s+val="(-?\d+)"/) || [])[1])
			// ST_Perspective: 0 .. 240
			assert(persp >= 0 && persp <= 240, `v3DPerspective: expected perspective in 0..240, got ${persp} (view3D: ${view3D})`)
			assert(persp === 30, `v3DPerspective: expected out-of-range 300 to clamp to default 30, got ${persp}`)
			await expectNoSchemaErrors(buf, 'chart-bar3d-view3d-clamp')
		}
	},
	{
		name: 'chart layout out-of-range x/y/w/h are deleted so defaults are emitted',
		fn: async () => {
			// layout { x:2, y:-1, w:5, h:1.5 } is fully out of range (0..1). createChartObject
			// (gen-objects.ts:260-269) iterates ['x','y','w','h'] and DELETEs any value that is
			// NaN/<0/>1, so the emit (gen-charts.ts:596-599: <c:x val="${layout.x||0}"/> etc.)
			// falls back to the defaults x/y -> 0, w/h -> 1.
			// SCHEMA CAVEAT: c:x/c:y/c:w/c:h in CT_ManualLayout are CT_Double (val = unbounded
			// xsd:double), so an out-of-range value like x=2 is SCHEMA-VALID. Schema cannot
			// catch this regression (like GAP-3 rotation). The PRIMARY catch is the explicit
			// exact-value assert below; expectNoSchemaErrors is a secondary sanity check.
			const { buf, zip } = await build(p => {
				p.addSlide().addChart(p.charts.BAR, [
					{ name: 'Units', labels: ['X', 'Y', 'Z'], values: [8, 14, 6] }
				], { x: 1, y: 1, w: 6, h: 3, layout: { x: 2, y: -1, w: 5, h: 1.5 } })
			})
			// chartId is a module-global counter, so the entry is NOT necessarily chart1.xml;
			// locate the single chart entry generically.
			const chartPath = listEntries(zip).find(e => /^ppt\/charts\/chart\d+\.xml$/.test(e))
			assert(chartPath, `chart layout: expected a ppt/charts/chartN.xml entry (got: ${listEntries(zip).filter(e => e.includes('chart')).join(', ')})`)
			const xml = await readEntry(zip, chartPath)
			const manualLayout = (xml.match(/<c:manualLayout>[\s\S]*?<\/c:manualLayout>/) || [])[0] || ''
			assert(manualLayout, `chart layout: expected a <c:manualLayout> block (chart xml: ${xml.slice(0, 400)})`)
			const x = Number((manualLayout.match(/<c:x\s+val="(-?[\d.]+)"/) || [])[1])
			const y = Number((manualLayout.match(/<c:y\s+val="(-?[\d.]+)"/) || [])[1])
			const w = Number((manualLayout.match(/<c:w\s+val="(-?[\d.]+)"/) || [])[1])
			const h = Number((manualLayout.match(/<c:h\s+val="(-?[\d.]+)"/) || [])[1])
			// EXACT-VALUE regression-catch: out-of-range input was deleted -> defaults emitted.
			// If the delete safeguard regressed, the emit would be x=2, y=-1, w=5, h=1.5.
			assert(x === 0, `chart layout x: expected out-of-range 2 to be deleted -> default 0, got ${x} (manualLayout: ${manualLayout})`)
			assert(y === 0, `chart layout y: expected out-of-range -1 to be deleted -> default 0, got ${y} (manualLayout: ${manualLayout})`)
			assert(w === 1, `chart layout w: expected out-of-range 5 to be deleted -> default 1, got ${w} (manualLayout: ${manualLayout})`)
			assert(h === 1, `chart layout h: expected out-of-range 1.5 to be deleted -> default 1, got ${h} (manualLayout: ${manualLayout})`)
			await expectNoSchemaErrors(buf, 'chart-layout-default')
		}
	},
	{
		// GAP-7 (REGRESSION-GUARD): doughnut holeSize is now range-clamped in source.
		// gen-charts.ts emits a clamped value:
		//   const holeSizeVal = Math.max(10, Math.min(90, Math.round(rawHoleSize)))
		//   <c:holeSize val="${holeSizeVal}"/>
		// so holeSize:500 is clamped to <c:holeSize val="90"/>. The schema type
		// c:holeSize = ST_HoleSize is a restriction of xsd:unsignedByte (max 255; doughnut
		// restriction 10-90), so val="500" would be DEFINITIVELY schema-invalid -> the clamp
		// keeps the emission compliant. This fixture asserts BOTH the clamped raw emission
		// (val="90") and zero schema errors; it guards against re-regression of the clamp.
		name: 'doughnut chart out-of-range holeSize is clamped into ST_HoleSize range [10,90]',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.addSlide().addChart(p.charts.DOUGHNUT, [
					{ name: 'Share', labels: ['A', 'B', 'C', 'D'], values: [10, 20, 30, 40] }
				], { x: 1, y: 1, w: 5, h: 4, holeSize: 500 })
			})
			// Record the clamped emission the validator accepts. chartId is a
			// module-global counter, so locate the single chart entry generically (mem-7).
			const chartPath = listEntries(zip).find(e => /^ppt\/charts\/chart\d+\.xml$/.test(e))
			assert(chartPath, `holeSize: expected a ppt/charts/chartN.xml entry (got: ${listEntries(zip).filter(e => e.includes('chart')).join(', ')})`)
			const xml = await readEntry(zip, chartPath)
			const holeVal = (xml.match(/<c:holeSize\s+val="(-?[\d.]+)"/) || [])[1]
			// Proof the out-of-range value was clamped to the ST_HoleSize max (regression guard).
			assert(holeVal === '90', `holeSize: expected clamped emission <c:holeSize val="90"/>, got val="${holeVal}" (chart xml: ${xml.slice(0, 400)})`)
			// COMPLIANT-outcome assertion: passes now that holeSize is clamped into [10,90].
			await expectNoSchemaErrors(buf, 'chart-doughnut-holesize-oob')
		}
	},
	{
		// GAP-8 (REGRESSION GUARD): gradient stop position/transparency are clamped into
		// [0,100] before the ×1000 scale in genXmlGradientFill (gen-utils.ts):
		//   pos   = Math.round(Math.max(0, Math.min(100, stop.position || 0)) * 1000)
		//   alpha = Math.round(Math.max(0, Math.min(100, stop.transparency)) * 1000)
		// Both a:gs@pos and a:alpha@val are ST_PositiveFixedPercentage (0..100000), so an
		// out-of-range input like { position: 150, transparency: 150 } is clamped to
		// pos="100000" and <a:alpha val="100000"/> rather than the schema-invalid 150000.
		// This guards a NON-chart type (gradient fill), advancing the objective's "across
		// ALL types". The fixture asserts BOTH the clamped raw emission (re-regression
		// guard) AND schema validity — if the source clamp is removed, the raw 150000
		// re-appears and these asserts (and expectNoSchemaErrors) fail again.
		name: 'gradient stop out-of-range position/transparency clamped into ST_PositiveFixedPercentage [0,100]',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 1,
					fill: {
						type: 'gradient', direction: 'horizontal',
						stops: [
							{ position: 0, color: '7C3AED' },
							{ position: 150, color: '38BDF8', transparency: 150 }
						]
					}
				})
			})
			// Slides are deterministic ppt/slides/slide1.xml (NOT the module-global chart counter).
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Proof the out-of-range values were clamped to the ST_PositiveFixedPercentage max (regression guard).
			assert(/<a:gs\s+pos="100000"/.test(xml), `gradient pos: expected clamped raw emission <a:gs pos="100000">, slide xml: ${xml.slice(0, 600)}`)
			assert(/<a:alpha\s+val="100000"\/>/.test(xml), `gradient alpha: expected clamped raw emission <a:alpha val="100000"/>, slide xml: ${xml.slice(0, 600)}`)
			// COMPLIANT-outcome assertion: passes now that pos/transparency are clamped into [0,100].
			await expectNoSchemaErrors(buf, 'gradient-stop-oob')
		}
	},
	{
		// Phase 1.1 — pattern (preset hatch) fill on shapes: `<a:pattFill prst="...">` with
		// `<a:fgClr>` and optional `<a:bgClr>`. Exercises 3 presets: one with backColor
		// (ltUpDiag), one WITHOUT backColor (cross → <a:bgClr> omitted), and a third (pct50)
		// with backColor. The fixture asserts BOTH the raw emission (REGRESSION-CATCH per the
		// run's RUNNER/ASSESSOR memory: a clean schema pass alone does NOT close the gap) AND
		// schema validity — if genXmlPatternFill regresses (wrong prst, dropped fgClr, or a
		// bgClr emitted for the no-background case) these exact-string asserts fail.
		name: 'pattern-fill shapes (3 presets, fg + optional bg) — a:pattFill',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 4, h: 1, fill: { type: 'pattern', preset: 'ltUpDiag', foreColor: '7C3AED', backColor: '1A1A24' } })
				s.addShape(p.shapes.RECTANGLE, { x: 1, y: 2.5, w: 4, h: 1, fill: { type: 'pattern', preset: 'cross', foreColor: 'FF0000' } })
				s.addShape(p.shapes.RECTANGLE, { x: 1, y: 4, w: 4, h: 1, fill: { type: 'pattern', preset: 'pct50', foreColor: '00B0B9', backColor: 'FFFFFF' } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// REGRESSION-CATCH 1: the preset prst + foreground colour are emitted exactly as authored.
			assert(xml.includes('<a:pattFill prst="ltUpDiag">'), `pattern: expected <a:pattFill prst="ltUpDiag">, slide xml: ${xml.slice(0, 800)}`)
			assert(xml.includes('<a:fgClr><a:srgbClr val="7C3AED"/></a:fgClr>'), `pattern: expected <a:fgClr><a:srgbClr val="7C3AED"/>, slide xml: ${xml.slice(0, 800)}`)
			// REGRESSION-CATCH 2: all three presets are present.
			assert((xml.match(/<a:pattFill\s+prst="/g) || []).length === 3, `pattern: expected 3 <a:pattFill> elements, got ${(xml.match(/<a:pattFill\s+prst="/g) || []).length}`)
			assert(xml.includes('prst="cross"') && xml.includes('prst="pct50"'), `pattern: expected presets cross + pct50, slide xml: ${xml.slice(0, 800)}`)
			// REGRESSION-CATCH 3: backColor is opt-in — only the 2 shapes with backColor emit <a:bgClr> (cross omits it).
			assert((xml.match(/<a:bgClr>/g) || []).length === 2, `pattern: expected exactly 2 <a:bgClr> (cross omits bg), got ${(xml.match(/<a:bgClr>/g) || []).length}`)
			assert(xml.includes('<a:bgClr><a:srgbClr val="1A1A24"/></a:bgClr>'), `pattern: expected <a:bgClr><a:srgbClr val="1A1A24"/>, slide xml: ${xml.slice(0, 800)}`)
			// COMPLIANT-outcome assertion: a:pattFill with valid ST_PresetPatternVal prst is schema-clean.
			await expectNoSchemaErrors(buf, 'shape-patternfill')
		}
	},
	{
		// Phase 1.2 — picture/blip fill on shapes: `<a:blipFill>` with a registered `r:embed`
		// relationship (media part + slide `_rels` + `[Content_Types].xml` Default). Exercises
		// stretch (default) and tile sizing, plus optional transparency (`<a:alphaModFix>`). The
		// two shapes share ONE base64 PNG → dedupe to a single media part (two rels, one Target).
		// Per the run's RUNNER/ASSESSOR memory a clean schema pass alone does NOT close the gap:
		// the fixture asserts the raw emission (blipFill / blip r:embed / stretch vs tile / alphaModFix)
		// AND the media-rel + Content_Types Default presence, so a regression in the emitter or the
		// rel-registration (gen-objects/gen-xml) fails an exact assert.
		name: 'picture-fill shapes (stretch + tile + transparency) — a:blipFill',
		fn: async () => {
			const b64 =
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
			const dataUri = 'image/png;base64,' + b64
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
					// stretch (default sizing omitted) + transparency
				s.addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 4, h: 2, fill: { type: 'image', data: dataUri, transparency: 20 } })
				// tile sizing
				s.addShape(p.shapes.RECTANGLE, { x: 1, y: 3.5, w: 4, h: 2, fill: { type: 'image', data: dataUri, sizing: 'tile' } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// REGRESSION-CATCH 1: both shapes emit a <a:blipFill> with an embedded blip relationship.
			assert((xml.match(/<a:blipFill>/g) || []).length === 2, `picture: expected 2 <a:blipFill>, got ${(xml.match(/<a:blipFill>/g) || []).length} — xml: ${xml.slice(0, 900)}`)
			assert((xml.match(/<a:blip r:embed="rId\d+">/g) || []).length === 2, `picture: expected 2 <a:blip r:embed="rIdN">, xml: ${xml.slice(0, 900)}`)
			// REGRESSION-CATCH 2: stretch (default) emits <a:stretch><a:fillRect/>; tile emits <a:tile ...>.
			assert(xml.includes('<a:stretch><a:fillRect/></a:stretch>'), `picture: expected <a:stretch><a:fillRect/></a:stretch> for default sizing, xml: ${xml.slice(0, 900)}`)
			assert(xml.includes('<a:tile tx="0" ty="0" sx="100000" sy="100000" algn="tl"/>'), `picture: expected <a:tile ...> for sizing:'tile', xml: ${xml.slice(0, 900)}`)
			// REGRESSION-CATCH 3: transparency:20 → <a:alphaModFix amt="80000"/> inside the blip.
			assert(xml.includes('<a:alphaModFix amt="80000"/>'), `picture: expected <a:alphaModFix amt="80000"/> (transparency 20), xml: ${xml.slice(0, 900)}`)
			// MEDIA-PIPELINE PROOF 1: the slide _rels carries image relationship(s) for the shape fills.
			const rels = await readEntry(zip, 'ppt/slides/_rels/slide1.xml.rels')
			const imgRels = (rels.match(/Type="[^"]*\/relationships\/image"/g) || [])
			// data-only images are not deduped (consistent with addImage(), which dedupes by `path`):
			// two data-URI fills → two image rels + two media parts.
			assert(imgRels.length === 2, `picture: expected 2 image <Relationship> in slide1.xml.rels, got ${imgRels.length} — rels: ${rels}`)
			assert(listEntries(zip).filter(e => /^ppt\/media\/image-[^/]+\.png$/.test(e)).length === 2, `picture: expected 2 media parts written, got entries: ${listEntries(zip).filter(e => e.includes('media')).join(', ')}`)
			// MEDIA-PIPELINE PROOF 2: [Content_Types].xml has the png Default extension override.
			const ct = await readEntry(zip, '[Content_Types].xml')
			assert(/<Default Extension="png" ContentType="image\/png"\/>/.test(ct), `picture: expected png Default in [Content_Types].xml — ct: ${ct.slice(0, 600)}`)
			// COMPLIANT-outcome assertion: the picture fill is schema-clean.
			await expectNoSchemaErrors(buf, 'shape-picturefill')
		}
	}
]
