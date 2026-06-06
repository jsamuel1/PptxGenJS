'use strict'

// Slice 0 enabling test: proves test/run.js discovers `feature-*.test.js`
// files (not just `bug-NN.test.js`). Later feature slices (gradient,
// transition, animation) add their own `feature-*.test.js` files which then
// run automatically in the `npm test` inner loop.

const { build, readEntry, assert } = require('./helpers')

module.exports = [
	{
		name: 'feature-runner: baseline deck builds and slide1 contains <p:sld',
		fn: async () => {
			const { zip } = await build(p => {
				const s = p.addSlide()
				s.addText('hello', { x: 1, y: 1 })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			assert(xml.indexOf('<p:sld') !== -1,
				'expected <p:sld in slide1.xml; got: ' + xml)
		}
	}
]
