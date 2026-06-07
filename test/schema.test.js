'use strict'

// Schema-validation fixtures. Each case builds a representative `.pptx`
// and asserts the OpenXmlValidator (via OOXMLValidatorCLI) reports no
// errors.
//
// Fixtures are intentionally small and orthogonal — they exercise one
// API surface each — so when an error appears we can localise it.
//
// Run with: npm run schema-test

const { build, assert, readEntry } = require('./helpers')
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
	}
]
