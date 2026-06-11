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
	},
	{
		name: 'feature-sandbox-runtime: embedFont with fs path produces non-zero .fntdata in sandbox context',
		fn: async () => {
			const vm = require('vm')
			const path = require('path')
			const JSZip = require('jszip')

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

			const libPath = path.resolve(__dirname, '../src/bld/pptxgen.cjs.js')
			const fontPath = path.resolve(__dirname, 'fixtures/test-minimal.ttf')

			const code = `(async () => { 'use strict';
				const PptxGenJS = require(${JSON.stringify(libPath)});
				const pres = new PptxGenJS();
				pres.embedFont({ family: 'TestFont', regular: ${JSON.stringify(fontPath)} });
				pres.addSlide().addText('font embed', { x: 1, y: 1 });
				const buf = await pres.write({ outputType: 'nodebuffer' });
				return buf;
			})()`

			const buf = await vm.runInContext(code, ctx)
			const zip = await JSZip.loadAsync(buf)
			const fntdata = zip.file('ppt/fonts/font1.fntdata')
			assert(fntdata !== null, 'expected ppt/fonts/font1.fntdata to exist in zip')
			const fntBuf = await fntdata.async('nodebuffer')
			assert(fntBuf.length > 0, 'expected font1.fntdata to have non-zero length')

			const presXml = await zip.file('ppt/presentation.xml').async('string')
			assert(presXml.includes('embeddedFontLst'), 'expected presentation.xml to contain embeddedFontLst')
			assert(presXml.includes('typeface="TestFont"'), 'expected presentation.xml to contain typeface="TestFont"')
		}
	},
	{
		name: 'feature-sandbox-runtime: embedFont with invalid path omits font entry (no 0-byte .fntdata)',
		fn: async () => {
			const vm = require('vm')
			const path = require('path')
			const JSZip = require('jszip')

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

			const libPath = path.resolve(__dirname, '../src/bld/pptxgen.cjs.js')

			const code = `(async () => { 'use strict';
				const PptxGenJS = require(${JSON.stringify(libPath)});
				const pres = new PptxGenJS();
				pres.embedFont({ family: 'Ghost', regular: '/nonexistent/path.ttf' });
				pres.addSlide().addText('ghost font', { x: 1, y: 1 });
				const buf = await pres.write({ outputType: 'nodebuffer' });
				return buf;
			})()`

			const buf = await vm.runInContext(code, ctx)
			const zip = await JSZip.loadAsync(buf)

			// Assert no .fntdata files exist (font read failed, so no binary was embedded)
			const fontFiles = zip.file(/^ppt\/fonts\/.*\.fntdata$/)
			assert(fontFiles.length === 0, 'expected no .fntdata files in zip when font path is invalid; found ' + fontFiles.map(f => f.name).join(', '))

			// The XML reference may still appear (declarative), but no actual font data was embedded
			// Verify that if any fntdata existed it would not be zero-length (vacuously true when empty)
			for (const f of fontFiles) {
				const content = await f.async('nodebuffer')
				assert(content.length > 0, 'found 0-byte fntdata file: ' + f.name)
			}
		}
	},
	{
		name: 'feature-sandbox-runtime: embedFont with base64 data works in sandbox (no fs needed)',
		fn: async () => {
			const vm = require('vm')
			const path = require('path')
			const fs = require('fs')
			const JSZip = require('jszip')

			const fontPath = path.resolve(__dirname, 'fixtures/test-minimal.ttf')
			const fontBuf = fs.readFileSync(fontPath)
			const dataUri = 'data:font/ttf;base64,' + fontBuf.toString('base64')

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
			ctx.dataUri = dataUri

			const libPath = path.resolve(__dirname, '../src/bld/pptxgen.cjs.js')

			const code = `(async () => { 'use strict';
				const PptxGenJS = require(${JSON.stringify(libPath)});
				const pres = new PptxGenJS();
				pres.embedFont({ family: 'B64Font', regular: dataUri });
				pres.addSlide().addText('base64 font', { x: 1, y: 1 });
				const buf = await pres.write({ outputType: 'nodebuffer' });
				return buf;
			})()`

			const buf = await vm.runInContext(code, ctx)
			const zip = await JSZip.loadAsync(buf)
			const fntdata = zip.file('ppt/fonts/font1.fntdata')
			assert(fntdata !== null, 'expected ppt/fonts/font1.fntdata to exist in zip')
			const fntBytes = await fntdata.async('nodebuffer')
			assert(fntBytes.equals(fontBuf), 'expected font1.fntdata content to equal the original font bytes')
		}
	}
]
