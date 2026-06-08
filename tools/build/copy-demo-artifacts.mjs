/**
 * Post-build: refresh the locally-installed copies of the library inside the
 * demo apps' node_modules so the demos run against the freshly-built output.
 *
 * Mirrors the old gulp tasks `reactTestCode`, `reactTestDefs`, `nodeTestCjs`,
 * `nodeTestEs`. These target dirs are gitignored and only exist after a demo's
 * own `npm install`, so each copy is a no-op when the target is absent.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const copies = [
	// vite-demo (React) consumes the ES build + type defs
	['dist/pptxgen.es.js', 'demos/vite-demo/node_modules/pptxgenjs/dist/pptxgen.es.js'],
	['types/index.d.ts', 'demos/vite-demo/node_modules/pptxgenjs/types/index.d.ts'],
	// node demo consumes both cjs + es
	['dist/pptxgen.cjs.js', 'demos/node/node_modules/pptxgenjs/dist/pptxgen.cjs.js'],
	['dist/pptxgen.es.js', 'demos/node/node_modules/pptxgenjs/dist/pptxgen.es.js'],
]

let copied = 0
for (const [src, dest] of copies) {
	// Only refresh when the demo package is already installed (target dir exists).
	const destPkgDir = dest.split('/').slice(0, 4).join('/') // demos/<x>/node_modules/pptxgenjs
	if (!existsSync(destPkgDir)) continue
	if (!existsSync(src)) {
		console.warn(`copy-demo-artifacts: source missing, skipped: ${src}`)
		continue
	}
	mkdirSync(dirname(dest), { recursive: true })
	copyFileSync(src, dest)
	copied++
}

console.log(`copy-demo-artifacts: refreshed ${copied} demo file(s).`)
