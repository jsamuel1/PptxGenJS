/**
 * PptxGenJS — Rollup build
 *
 * Replaces the previous gulp pipeline. Produces, in a single `rollup -c` run:
 *
 *   src/bld/pptxgen.js       iife (unminified)        — used by the watch/dev flow
 *   src/bld/pptxgen.cjs.js   cjs                      — consumed by the test harness
 *   src/bld/pptxgen.es.js    es                       — intermediate ES build
 *
 *   dist/pptxgen.cjs.js      cjs   + banner           — published (require)
 *   dist/pptxgen.es.js       es    + banner           — published (import)
 *   dist/pptxgen.min.js      iife  + banner, minified — published (browser <script>)
 *   dist/pptxgen.bundle.js   iife  + banner, minified — self-contained browser bundle
 *                                                       (jszip + polyfill prepended);
 *                                                       also copied to demos/browser/js/
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from 'rollup-plugin-typescript2'
import terser from '@rollup/plugin-terser'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')
const ts = require('typescript')

// `npm run build` (and the `pretest` hook) only needs the intermediate
// `src/bld/*` outputs that the test harness imports — fast, no minification.
// `npm run ship` sets SHIP=1 to additionally emit the published `dist/*`
// artifacts and the self-contained browser bundle.
const isShip = process.env.SHIP === '1'

const nodeBuiltinsRE = /^node:.*/ // matches all Node built-in specifiers

const banner = `/* PptxGenJS ${pkg.version} @ ${new Date().toISOString()} */`

// Browser bundle preamble: the pre-minified vendor libs are prepended verbatim
// ahead of the IIFE so the bundle is fully self-contained (provides the global
// `JSZip` that the IIFE expects, plus polyfills). Mirrors the old gulp `bundle`
// task which concatenated `libs/*` in front of the rollup IIFE output.
const vendorLibs = ['./libs/jszip.min.js', './libs/polyfill.min.js']
	.map(f => readFileSync(f, 'utf8'))
	.join('\n')

// jszip is an external (peer) global in the standalone IIFE/min builds, and in
// the cjs/es builds it stays an external import. It is ONLY inlined in the
// self-contained browser bundle.
const externalLib = [nodeBuiltinsRE, ...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]

const tsPlugin = () =>
	typescript({
		typescript: ts,
		// Declarations are NOT produced by the build — the published API types are
		// the hand-maintained `types/index.d.ts`. Disabling here prevents stray
		// `.d.ts` files from being emitted into `dist/` (and `src/bld/`).
		useTsconfigDeclarationDir: false,
		tsconfigOverride: { compilerOptions: { declaration: false, declarationMap: false } },
	})
const basePlugins = () => [resolve({ preferBuiltins: true }), commonjs(), tsPlugin()]

// Terser tuned to keep only banner-style `/* ! */`-less leading comment, drop
// the rest. `comments` keeps our single banner (added via output.banner, which
// terser preserves when it is the first legal comment) — we force-keep it.
const minify = () =>
	terser({
		format: { comments: /PptxGenJS \d/ }, // preserve the version banner only
		compress: { passes: 2 },
	})

export default [
	// 1) src/bld/* — intermediate builds (tests import src/bld/pptxgen.cjs.js)
	{
		input: 'src/pptxgen.ts',
		external: externalLib,
		plugins: basePlugins(),
		output: [
			{ file: './src/bld/pptxgen.js', format: 'iife', name: 'PptxGenJS', globals: { jszip: 'JSZip' } },
			{ file: './src/bld/pptxgen.cjs.js', format: 'cjs', exports: 'default' },
			{ file: './src/bld/pptxgen.es.js', format: 'es' },
		],
	},

	// 1b) src/bld/utils.* — optional utilities entry (tests import src/bld/utils.cjs.js)
	{
		input: 'src/utils.ts',
		external: externalLib,
		plugins: basePlugins(),
		output: [
			{ file: './src/bld/utils.cjs.js', format: 'cjs' },
			{ file: './src/bld/utils.es.js', format: 'es' },
		],
	},

	// 1c) src/bld/icons-fa.* — Font Awesome icon-pack entry
	{
		input: 'src/icons-fa.ts',
		external: externalLib,
		plugins: basePlugins(),
		output: [
			{ file: './src/bld/icons-fa.cjs.js', format: 'cjs', exports: 'default' },
			{ file: './src/bld/icons-fa.es.js', format: 'es', footer: 'export { default as FA_ICONS };' },
		],
	},

	// The dist/* artifacts are only built for publishing (`npm run ship`).
	...(isShip
		? [
			// 2) dist/* — published artifacts (cjs + es, with banner; min via terser)
			{
				input: 'src/pptxgen.ts',
				external: externalLib,
				plugins: basePlugins(),
				output: [
					{ file: './dist/pptxgen.cjs.js', format: 'cjs', exports: 'default', banner },
					{ file: './dist/pptxgen.es.js', format: 'es', banner },
					{
						file: './dist/pptxgen.min.js',
						format: 'iife',
						name: 'PptxGenJS',
						globals: { jszip: 'JSZip' },
						banner,
						sourcemap: true,
						plugins: [minify()],
					},
				],
			},

			// 2b) dist/utils.* — optional utilities entry (published)
			{
				input: 'src/utils.ts',
				external: externalLib,
				plugins: basePlugins(),
				output: [
					{ file: './dist/utils.cjs.js', format: 'cjs', banner },
					{ file: './dist/utils.js', format: 'cjs', banner },
					{ file: './dist/utils.es.js', format: 'es', banner },
				],
			},

			// 2c) dist/icons-fa.* — Font Awesome icon-pack entry (published)
			{
				input: 'src/icons-fa.ts',
				external: externalLib,
				plugins: basePlugins(),
				output: [
					{ file: './dist/icons-fa.cjs.js', format: 'cjs', banner, exports: 'default' },
					{ file: './dist/icons-fa.es.js', format: 'es', banner, footer: 'export { default as FA_ICONS };' },
				],
			},

			// 3) dist/pptxgen.bundle.js — self-contained browser bundle (jszip
			//    inlined via prepended vendor libs). Emitted to dist/ and
			//    demos/browser/js/.
			{
				input: 'src/pptxgen.ts',
				external: externalLib,
				plugins: basePlugins(),
				output: ['./dist', './demos/browser/js'].map(dir => ({
					file: `${dir}/pptxgen.bundle.js`,
					format: 'iife',
					name: 'PptxGenJS',
					globals: { jszip: 'JSZip' },
					banner: `${banner}\n${vendorLibs}`,
					sourcemap: true,
					plugins: [minify()],
				})),
			},
		]
		: []),
]
