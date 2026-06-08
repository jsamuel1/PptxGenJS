'use strict'

// SLICE-8 — parseSvg() SVG-normalisation utility (docs/feature-svg-normalisation.md, RI-11).
// Tests run against the BUILT bundle (src/bld/utils.cjs.js) so they exercise shipped output.

const JSZip = require('jszip')
const { parseSvg } = require('../src/bld/utils.cjs.js')
const PptxGenJS = require('../src/bld/pptxgen.cjs.js')
const { assert } = require('./helpers')
const { isInstalled, validateBuf } = require('./validator')

module.exports = [
	{
		name: 'parseSvg arc expansion: <circle> → single 4-cubic path, no A/a remaining',
		fn: async () => {
			const parts = parseSvg('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>')
			assert(parts.length === 1, 'expected 1 part; got ' + parts.length)
			assert(/^M/.test(parts[0].d), 'd must start with M; got ' + parts[0].d)
			assert(!/[Aa]/.test(parts[0].d), 'd must contain no arc command; got ' + parts[0].d)
			// 4 cubic segments + close
			assert((parts[0].d.match(/C/g) || []).length === 4, 'expected 4 cubics; got ' + parts[0].d)
			assert(/Z$/.test(parts[0].d), 'circle path must close; got ' + parts[0].d)
			assert(parts[0].viewBox.w === 24 && parts[0].viewBox.h === 24, 'viewBox 24x24; got ' + JSON.stringify(parts[0].viewBox))
		},
	},
	{
		name: 'parseSvg multi-colour preservation: two fills → two parts, colours intact',
		fn: async () => {
			const parts = parseSvg('<svg viewBox="0 0 24 24"><path d="M0 0L8 0" fill="#FF0000"/><path d="M0 8L8 8" fill="#00FF00"/></svg>')
			assert(parts.length === 2, 'expected 2 parts; got ' + parts.length)
			assert(parts[0].fill === 'FF0000', 'part0 fill FF0000; got ' + parts[0].fill)
			assert(parts[1].fill === '00FF00', 'part1 fill 00FF00; got ' + parts[1].fill)
			// consecutive same-fill paths group into one part
			const grouped = parseSvg('<svg viewBox="0 0 24 24"><path d="M0 0L8 0" fill="#FF0000"/><path d="M0 4L8 4" fill="#FF0000"/></svg>')
			assert(grouped.length === 1, 'same-fill consecutive paths should group; got ' + grouped.length)
			assert((grouped[0].d.match(/M/g) || []).length === 2, 'grouped d should hold both subpaths; got ' + grouped[0].d)
		},
	},
	{
		name: 'parseSvg gradient resolution: fill=url(#g) → GradientFillProps w/ stops + direction',
		fn: async () => {
			const parts = parseSvg('<svg viewBox="0 0 24 24"><path d="M0 0L24 24" fill="url(#g)"/><defs><linearGradient id="g" x1="0" y1="0" x2="24" y2="24"><stop stop-color="#FF4B14"/><stop offset="1" stop-color="#6842FF"/></linearGradient></defs></svg>')
			assert(parts.length === 1, 'expected 1 part; got ' + parts.length)
			const f = parts[0].fill
			assert(typeof f === 'object' && f.type === 'gradient', 'expected gradient fill; got ' + JSON.stringify(f))
			assert(f.stops.length === 2, 'expected 2 stops; got ' + f.stops.length)
			assert(f.stops[0].color === 'FF4B14' && f.stops[0].position === 0, 'stop0 wrong; got ' + JSON.stringify(f.stops[0]))
			assert(f.stops[1].color === '6842FF' && f.stops[1].position === 100, 'stop1 wrong; got ' + JSON.stringify(f.stops[1]))
			// x1y1=0,0 → x2y2=24,24 ⇒ 45°
			assert(f.direction === 45, 'expected 45° direction; got ' + f.direction)
		},
	},
	{
		name: 'parseSvg gradient match by id even when an HTML reader lowercases the tag',
		fn: async () => {
			// camelCase tag preserved here, but resolution is by id attr — assert it resolves
			const parts = parseSvg('<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="url(#grad1)"/><linearGradient id="grad1" x1="0" y1="0" x2="0" y2="10"><stop offset="0" stop-color="#111"/><stop offset="1" stop-color="#222"/></linearGradient></svg>')
			assert(parts.length === 1, 'expected 1 part; got ' + parts.length)
			assert(typeof parts[0].fill === 'object' && parts[0].fill.type === 'gradient', 'gradient must resolve by id; got ' + JSON.stringify(parts[0].fill))
			// vertical vector 0,0→0,10 ⇒ 90°
			assert(parts[0].fill.direction === 90, 'expected 90° vertical; got ' + parts[0].fill.direction)
			// 3-digit hex expanded
			assert(parts[0].fill.stops[0].color === '111111', 'expected expanded 3-digit hex; got ' + parts[0].fill.stops[0].color)
		},
	},
	{
		name: 'parseSvg stroke icon: fill=none stroke + width inherited from root → mode stroke',
		fn: async () => {
			const parts = parseSvg('<svg viewBox="0 0 24 24" fill="none" stroke="#A78BFA" stroke-width="1.5"><path d="M3 12h18"/></svg>')
			assert(parts.length === 1, 'expected 1 part; got ' + parts.length)
			assert(parts[0].mode === 'stroke', 'expected stroke mode; got ' + parts[0].mode)
			assert(parts[0].stroke === 'A78BFA', 'expected stroke A78BFA; got ' + parts[0].stroke)
			assert(parts[0].strokeWidth === 1.5, 'expected strokeWidth 1.5; got ' + parts[0].strokeWidth)
			// H folded to L (absolute): 3,12 h18 → L21 12
			assert(!/[HhVv]/.test(parts[0].d), 'H/V must be folded; got ' + parts[0].d)
			assert(/L21 12/.test(parts[0].d), 'expected absolute L21 12 from relative h18; got ' + parts[0].d)
		},
	},
	{
		name: 'parseSvg command normalisation: H/V/S/T/A all folded to M/L/C/Q/Z',
		fn: async () => {
			// H, V, smooth-cubic S, smooth-quad T, arc A
			const d = 'M0 0 H10 V10 C10 10 15 5 20 10 S30 15 40 10 Q45 0 50 10 T70 10 A5 5 0 0 1 80 10 Z'
			const parts = parseSvg('<svg viewBox="0 0 100 100"><path d="' + d + '" fill="#000"/></svg>')
			assert(parts.length === 1, 'expected 1 part; got ' + parts.length)
			const out = parts[0].d
			assert(!/[HhVvSsTtAa]/.test(out), 'only M/L/C/Q/Z allowed; got ' + out)
			assert(/^[MLCQZ0-9.\s-]+$/.test(out), 'unexpected chars in normalised d; got ' + out)
			// S after C reflects → produces a cubic; T after Q reflects → quad
			assert((out.match(/C/g) || []).length >= 3, 'expected ≥3 cubics (C,S,A); got ' + out)
			assert((out.match(/Q/g) || []).length >= 2, 'expected ≥2 quads (Q,T); got ' + out)
		},
	},
	{
		name: 'parseSvg relative→absolute + rect/polygon primitives',
		fn: async () => {
			// relative moveto/lineto
			const rel = parseSvg('<svg viewBox="0 0 50 50"><path d="m5 5 l10 0 l0 10" fill="#abc"/></svg>')
			assert(/^M5 5L15 5L15 15/.test(rel[0].d), 'relative must become absolute; got ' + rel[0].d)
			// rect with corner radius → line+cubic corners, closed
			const rect = parseSvg('<svg viewBox="0 0 20 20"><rect x="0" y="0" width="20" height="10" rx="3" fill="#f00"/></svg>')
			assert(/^M/.test(rect[0].d) && /Z$/.test(rect[0].d), 'rounded rect must be a closed path; got ' + rect[0].d)
			assert((rect[0].d.match(/C/g) || []).length === 4, 'rounded rect → 4 corner cubics; got ' + rect[0].d)
			// polygon → M L… Z
			const poly = parseSvg('<svg viewBox="0 0 10 10"><polygon points="0,0 10,0 5,10" fill="#0f0"/></svg>')
			assert(/^M0 0L10 0L5 10Z$/.test(poly[0].d), 'polygon path; got ' + poly[0].d)
		},
	},
	{
		name: 'parseSvg defaultFill + empty/invalid input',
		fn: async () => {
			assert(parseSvg('').length === 0, 'empty string → no parts')
			assert(parseSvg(null).length === 0, 'null → no parts')
			assert(parseSvg('<svg></svg>').length === 0, 'no drawables → no parts')
			// unpainted element falls back to defaultFill
			const p = parseSvg('<svg viewBox="0 0 8 8"><path d="M0 0L8 8"/></svg>', { defaultFill: '7C3AED' })
			assert(p[0].fill === '7C3AED', 'expected defaultFill 7C3AED; got ' + p[0].fill)
			// viewBox override
			const o = parseSvg('<svg viewBox="0 0 24 24"><path d="M0 0L1 1" fill="#000"/></svg>', { viewBox: { w: 100, h: 50 } })
			assert(o[0].viewBox.w === 100 && o[0].viewBox.h === 50, 'viewBox override; got ' + JSON.stringify(o[0].viewBox))
		},
	},
	{
		name: 'parseSvg END-TO-END: normalised d round-trips through addShape(custGeom) → validateBuf 0 errors',
		fn: async () => {
			if (!isInstalled()) { console.log('       (skipped: OOXMLValidatorCLI not installed)'); return }
			// A real-world-ish icon: arc + smooth + primitive rect-rx + a stroke path
			const svg = '<svg viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2">' +
				'<circle cx="12" cy="12" r="9" fill="#FF4B14"/>' +
				'<rect x="6" y="6" width="12" height="6" rx="2" fill="#10B981"/>' +
				'<path d="M4 12 A8 8 0 0 1 20 12" />' +
				'<path d="M3 3 S9 9 12 3 T21 3"/>' +
				'</svg>'
			const parts = parseSvg(svg, { defaultFill: '333333' })
			assert(parts.length >= 3, 'expected ≥3 parts (2 fills + grouped strokes); got ' + parts.length)
			// none of the normalised paths may carry an unsupported command
			parts.forEach((p, i) => {
				assert(!/[AaHhVvSsTt]/.test(p.d), 'part ' + i + ' still has an unsupported command: ' + p.d)
			})
			const pres = new PptxGenJS()
			const slide = pres.addSlide()
			parts.forEach(part => {
				slide.addShape('custGeom', {
					x: 1, y: 1, w: 2, h: 2,
					svgPath: { d: part.d, viewBox: part.viewBox },
					fill: part.mode === 'stroke' ? { type: 'none' } : (typeof part.fill === 'string' ? { color: part.fill } : part.fill),
					line: part.mode === 'stroke' ? { color: part.stroke, width: part.strokeWidth } : { type: 'none' },
				})
			})
			const buf = await pres.stream()
			const errors = await validateBuf(Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
			assert(errors.length === 0, 'expected 0 validation errors; got ' + JSON.stringify(errors.slice(0, 5)))
			// confirm the custGeom XML actually carries the converted geometry (moveTo present)
			const zip = await JSZip.loadAsync(buf)
			const xml = await zip.file('ppt/slides/slide1.xml').async('string')
			assert(xml.indexOf('<a:custGeom>') !== -1, 'expected custGeom in slide XML')
			assert(xml.indexOf('<a:cubicBezTo>') !== -1, 'expected converted cubic geometry (arc/circle → cubics)')
		},
	},
]
