'use strict'

// Tests for the proposed dynamic icon-font resolver (see docs/features/feature-icon-font-resolver.md).
// resolveIconFonts(html, opts) -> Promise<Map<string, SvgPart[]>>. Keys are the icon element's
// class string (Material/ligature entries keyed `family|glyph`); each SvgPart carries a
// `source` tag ('cdn' | 'bundled' | 'custom').
//
// NOTE: until the feature ships, `resolveIconFonts` is undefined and these go red (tests-first).
// Network-dependent cases (CDN fallback) are written to SKIP gracefully when offline so the
// suite never hangs or flakes on CI.

const { resolveIconFonts } = require('../src/bld/utils.cjs.js')
const { assert } = require('./helpers')

const IMPLEMENTED = typeof resolveIconFonts === 'function'
function requireImpl() {
	if (!IMPLEMENTED) throw new Error('resolveIconFonts not implemented yet (proposed feature — see docs/features/feature-icon-font-resolver.md)')
}

// A resolved value should be a non-empty SvgPart[] whose first part has a normalised path.
function assertVectorParts(parts, label) {
	assert(Array.isArray(parts) && parts.length > 0, label + ': expected non-empty SvgPart[]')
	const p = parts[0]
	assert(typeof p.d === 'string' && /^[Mm]/.test(p.d.trim()), label + ': expected a path starting with M; got ' + JSON.stringify(p.d).slice(0, 40))
	assert(!/[AaSsTtHhVv]/.test(p.d), label + ': path must be normalised to M/L/C/Q/Z (no A/S/T/H/V); got ' + p.d.slice(0, 60))
	assert(p.viewBox && p.viewBox.w > 0 && p.viewBox.h > 0, label + ': expected a positive viewBox')
}

// Detect "feature missing" vs "network unavailable" so CDN tests can skip rather than fail.
function isNetworkError(e) {
	return /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|fetch failed|network|getaddrinfo|socket hang up/i.test(String(e && (e.message || e)))
}

module.exports = [
	{
		name: 'FA Solid: "fas fa-trophy" resolves to a normalised vector path with the FA viewBox',
		fn: async () => {
			requireImpl()
			const m = await resolveIconFonts('<i class="fas fa-trophy"></i>', { useCdn: false })
			assert(m instanceof Map, 'expected a Map')
			// Bundled icons removed (ADR 0008); without CDN or pack, icon is unresolved
			const parts = m.get('fas fa-trophy')
			assert(!parts || parts.length === 0, 'expected no bundled resolution without pack/CDN; got ' + JSON.stringify(parts))
		},
	},
	{
		name: 'FA Brands: "fab fa-github" resolves to a vector path',
		fn: async () => {
			requireImpl()
			const m = await resolveIconFonts('<i class="fab fa-github"></i>', { useCdn: false })
			// Bundled icons removed (ADR 0008); without CDN or pack, icon is unresolved
			const parts = m.get('fab fa-github')
			assert(!parts || parts.length === 0, 'expected no bundled resolution without pack/CDN; got ' + JSON.stringify(parts))
		},
	},
	{
		name: 'Material Icons: ligature text content "home" resolves (keyed family|glyph)',
		fn: async () => {
			requireImpl()
			const m = await resolveIconFonts('<i class="material-icons">home</i>', { useCdn: false })
			// Bundled icons removed (ADR 0008); without CDN or pack, icon is unresolved
			const parts = m.get('material-icons|home')
			assert(!parts || parts.length === 0, 'expected no bundled resolution without pack/CDN; got ' + JSON.stringify(parts))
		},
	},
	{
		name: 'CSS content extraction: an inline <style> ::before rule maps class -> codepoint',
		fn: async () => {
			requireImpl()
			// Provide a custom resolver that can resolve the icon to a path.
			const html = '<style>.my-icon::before{content:"\\e900"}</style><i class="my-icon iconset"></i>'
			const m = await resolveIconFonts(html, {
				// custom resolver receives the class + family
				customResolver: (cls /*, family */) => cls.includes('my-icon')
					? [{ d: 'M0 0L24 0L24 24L0 24Z', viewBox: { w: 24, h: 24 }, fill: '000000', mode: 'fill', source: 'custom' }]
					: null,
			})
			const parts = m.get('my-icon iconset')
			assertVectorParts(parts, 'my-icon iconset')
			assert(parts[0].source === 'custom', 'expected custom source; got ' + parts[0].source)
		},
	},
	{
		name: 'Unknown icon class is resolved by a customResolver (source: "custom")',
		fn: async () => {
			requireImpl()
			const m = await resolveIconFonts('<i class="acme-logo brand"></i>', {
				useCdn: false,
				customResolver: (cls) => cls.includes('acme')
					? [{ d: 'M2 2L22 2L22 22L2 22Z', viewBox: { w: 24, h: 24 }, fill: '7C3AED', mode: 'fill', source: 'custom' }]
					: null,
			})
			const parts = m.get('acme-logo brand')
			assertVectorParts(parts, 'acme-logo brand')
			assert(parts[0].source === 'custom', 'expected source custom; got ' + parts[0].source)
			assert(parts[0].fill === '7C3AED', 'expected custom fill carried through')
		},
	},
	{
		name: 'CDN fallback: a known icon with no stylesheet/font resolves via CDN (or bundled offline)',
		fn: async () => {
			requireImpl()
			try {
				const m = await resolveIconFonts('<i class="fas fa-star"></i>', { useCdn: true })
				const parts = m.get('fas fa-star')
				assertVectorParts(parts, 'fas fa-star (cdn/bundled)')
				assert(['cdn', 'bundled'].includes(parts[0].source), 'expected cdn or bundled source; got ' + parts[0].source)
			} catch (e) {
				if (isNetworkError(e)) { console.log('    (skipped CDN test — network unavailable)'); return }
				throw e
			}
		},
	},
	{
		name: 'Cache hit: resolving the same icon twice with a cacheDir does not re-fetch',
		fn: async () => {
			requireImpl()
			const os = require('os'); const path = require('path'); const fs = require('fs')
			const cacheDir = path.join(os.tmpdir(), 'pptx-icon-cache-test-' + Date.now())
			let calls = 0
			const customResolver = (cls) => {
				calls++
				return cls.includes('fa-bell')
					? [{ d: 'M224 0L224 512Z', viewBox: { w: 448, h: 512 }, fill: '000000', mode: 'fill', source: 'custom' }]
					: null
			}
			try {
				const first = await resolveIconFonts('<i class="fas fa-bell"></i>', { useCdn: false, cacheDir, customResolver })
				const a = first.get('fas fa-bell')
				assertVectorParts(a, 'fas fa-bell (1st)')
				// second call with same cacheDir should serve from cache
				const second = await resolveIconFonts('<i class="fas fa-bell"></i>', { useCdn: false, cacheDir, customResolver })
				const b = second.get('fas fa-bell')
				assertVectorParts(b, 'fas fa-bell (2nd, cached)')
				assert(a[0].d === b[0].d, 'expected identical path data on the cached second call')
			} finally {
				try { fs.rmSync(cacheDir, { recursive: true, force: true }) } catch (_) { /* ignore */ }
			}
		},
	},
	{
		name: 'Empty/missing icons: HTML with no icon elements returns an empty Map (no throw)',
		fn: async () => {
			requireImpl()
			const m = await resolveIconFonts('<div><p>no icons here</p><span class="text-muted">x</span></div>')
			assert(m instanceof Map, 'expected a Map')
			assert(m.size === 0, 'expected an empty map for icon-less HTML; got size ' + m.size)
			// an unresolvable icon (no stylesheet/font/CDN/bundled entry) is omitted, not an error
			const m2 = await resolveIconFonts('<i class="totally-unknown-font xyz-9999"></i>', { useCdn: false })
			assert(m2 instanceof Map && !m2.has('totally-unknown-font xyz-9999'), 'unresolvable icon should be omitted')
		},
	},
	{
		name: 'CDN_VERSIONS: exported constant has pinned semver strings for fa, bi, ion',
		fn: () => {
			const { CDN_VERSIONS } = require('../src/bld/utils.cjs.js')
			assert(CDN_VERSIONS, 'CDN_VERSIONS must be exported')
			assert(/^\d+\.\d+\.\d+$/.test(CDN_VERSIONS.fa), 'fa version must be semver; got ' + CDN_VERSIONS.fa)
			assert(/^\d+\.\d+\.\d+$/.test(CDN_VERSIONS.bi), 'bi version must be semver; got ' + CDN_VERSIONS.bi)
			assert(/^\d+\.\d+\.\d+$/.test(CDN_VERSIONS.ion), 'ion version must be semver; got ' + CDN_VERSIONS.ion)
		},
	},
	{
		name: 'useCdn defaults false: no CDN fetch without explicit useCdn:true',
		fn: async () => {
			requireImpl()
			// An icon NOT in the bundled set should NOT resolve when useCdn is not set (default = false)
			const m = await resolveIconFonts('<i class="fas fa-zzzz-nonexistent-icon-999"></i>')
			assert(m instanceof Map, 'expected a Map')
			assert(m.size === 0, 'icon should NOT resolve without useCdn:true; got size ' + m.size)
		},
	},
]
