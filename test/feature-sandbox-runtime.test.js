'use strict'

// S1 / Gap 2 — sandbox-safe zip generation.
//
// JSZip's DEFLATE compression path schedules async chunks via a bare global
// `setImmediate(...)`. A hardened Node `vm` sandbox does NOT expose
// `setImmediate`/`clearImmediate` (only `setTimeout`/`clearTimeout`), so
// generating a COMPRESSED `.pptx` used to throw "setImmediate is not defined".
//
// The library now polyfills `globalThis.setImmediate`/`clearImmediate` from
// `setTimeout`/`clearTimeout` (only when absent) before `zip.generateAsync`.
//
// These cases simulate the sandbox by deleting the two globals, then exercise
// the DEFLATE path and assert a non-empty buffer comes back. They restore the
// globals in a `finally` so other tests are unaffected.
//
// NOTE on regression-catch: compression MUST be `true` here. `pres.stream()`
// with compression maps to JSZip `compression: 'DEFLATE'`, which is the only
// path that touches the bare `setImmediate`. A STORE (uncompressed) export
// would NOT exercise the bug, so it would not guard the regression.

const { PptxGenJS, assert } = require('./helpers')

function buildDeck() {
	const pres = new PptxGenJS()
	const slide = pres.addSlide()
	slide.addText('sandbox compat', { x: 1, y: 1 })
	return pres
}

async function withoutSetImmediate(fn) {
	const g = globalThis
	const hadSet = Object.prototype.hasOwnProperty.call(g, 'setImmediate')
	const hadClear = Object.prototype.hasOwnProperty.call(g, 'clearImmediate')
	const savedSet = g.setImmediate
	const savedClear = g.clearImmediate
	try {
		delete g.setImmediate
		delete g.clearImmediate
		return await fn()
	} finally {
		if (hadSet) g.setImmediate = savedSet
		else delete g.setImmediate
		if (hadClear) g.clearImmediate = savedClear
		else delete g.clearImmediate
	}
}

module.exports = [
	{
		name: 'feature-sandbox-runtime: compressed export works without a setImmediate global (Gap 2)',
		fn: async () => {
			const buf = await withoutSetImmediate(async () => {
				assert(typeof globalThis.setImmediate === 'undefined',
					'precondition: setImmediate should be deleted before the DEFLATE export')
				const pres = buildDeck()
				// DEFLATE path (compression:true) — the path that touches JSZip's bare setImmediate.
				return await pres.stream({ compression: true })
			})
			const isBuffer = typeof Buffer !== 'undefined' && Buffer.isBuffer(buf)
			assert(isBuffer || buf instanceof Uint8Array,
				'expected a nodebuffer/Uint8Array from compressed stream(); got ' + Object.prototype.toString.call(buf))
			assert(buf.length > 0, 'expected a non-empty compressed buffer; got length ' + buf.length)
		}
	},
	{
		name: 'feature-sandbox-runtime: library defines setImmediate/clearImmediate when absent (polyfill installed)',
		fn: async () => {
			await withoutSetImmediate(async () => {
				const pres = buildDeck()
				await pres.stream({ compression: true })
				// After a compressed export, the library should have installed the polyfills.
				assert(typeof globalThis.setImmediate === 'function',
					'expected globalThis.setImmediate to be defined after compressed export')
				assert(typeof globalThis.clearImmediate === 'function',
					'expected globalThis.clearImmediate to be defined after compressed export')
			})
		}
	},
	{
		name: 'feature-sandbox-runtime: codegen-guard — export works in vm context with codeGeneration:{strings:false} (Gap 3)',
		fn: async () => {
			const vm = require('vm')
			const path = require('path')

			const restrictedBuffer = {
				from: Buffer.from.bind(Buffer),
				alloc: Buffer.alloc.bind(Buffer),
				allocUnsafe: Buffer.allocUnsafe.bind(Buffer),
				isBuffer: Buffer.isBuffer.bind(Buffer),
				concat: Buffer.concat.bind(Buffer),
				byteLength: Buffer.byteLength.bind(Buffer),
				isEncoding: Buffer.isEncoding.bind(Buffer)
			}

			const ctx = vm.createContext(Object.create(null), {
				codeGeneration: { strings: false, wasm: false }
			})
			ctx.require = require
			ctx.console = console
			ctx.setTimeout = setTimeout
			ctx.setInterval = setInterval
			ctx.clearTimeout = clearTimeout
			ctx.clearInterval = clearInterval
			ctx.Buffer = restrictedBuffer
			ctx.URL = URL
			ctx.URLSearchParams = URLSearchParams
			ctx.TextEncoder = TextEncoder
			ctx.TextDecoder = TextDecoder

			const code = `(async () => { 'use strict';
				const PptxGenJS = require(${JSON.stringify(path.resolve(__dirname, '../src/bld/pptxgen.cjs.js'))});
				const pres = new PptxGenJS();
				const slide = pres.addSlide();
				slide.addText('codegen guard', { x: 1, y: 1 });
				const buf = await pres.write({ outputType: 'nodebuffer' });
				return buf;
			})()`

			const buf = await vm.runInContext(code, ctx)
			assert(Buffer.isBuffer(buf), 'expected a Buffer from vm context write(); got ' + Object.prototype.toString.call(buf))
			assert(buf.length > 0, 'expected non-empty buffer; got length ' + buf.length)
		}
	},
	{
		name: 'feature-sandbox-runtime: faithful-context — compressed stream works in vm sandbox without setImmediate (Gap 1+2+3)',
		fn: async () => {
			const vm = require('vm')
			const path = require('path')

			const restrictedBuffer = {
				from: Buffer.from.bind(Buffer),
				alloc: Buffer.alloc.bind(Buffer),
				allocUnsafe: Buffer.allocUnsafe.bind(Buffer),
				isBuffer: Buffer.isBuffer.bind(Buffer),
				concat: Buffer.concat.bind(Buffer),
				byteLength: Buffer.byteLength.bind(Buffer),
				isEncoding: Buffer.isEncoding.bind(Buffer)
			}

			const ctx = vm.createContext(Object.create(null), {
				codeGeneration: { strings: false, wasm: false }
			})
			ctx.require = require
			ctx.console = console
			ctx.setTimeout = setTimeout
			ctx.setInterval = setInterval
			ctx.clearTimeout = clearTimeout
			ctx.clearInterval = clearInterval
			ctx.Buffer = restrictedBuffer
			ctx.URL = URL
			ctx.URLSearchParams = URLSearchParams
			ctx.TextEncoder = TextEncoder
			ctx.TextDecoder = TextDecoder

			const code = `(async () => { 'use strict';
				const PptxGenJS = require(${JSON.stringify(path.resolve(__dirname, '../src/bld/pptxgen.cjs.js'))});
				const pres = new PptxGenJS();
				const slide = pres.addSlide();
				slide.addText('faithful context', { x: 1, y: 1 });
				const buf = await pres.stream({ compression: true });
				return buf;
			})()`

			const buf = await vm.runInContext(code, ctx)
			const isbuf = Buffer.isBuffer(buf) || (buf instanceof Uint8Array)
			assert(isbuf, 'expected a Buffer/Uint8Array from vm context stream(); got ' + Object.prototype.toString.call(buf))
			assert(buf.length > 0, 'expected non-empty compressed buffer; got length ' + buf.length)
		}
	}
]
