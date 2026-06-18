'use strict'

// Feature: Generic prefix-stripping fallback and @media (prefers-color-scheme) overlay.
// Tests that unknown prefixes are stripped and that media-query vars override base vars.

const { extractThemeFromCSS } = require('../src/bld/utils.cjs.js')
const { assert, assertEqual } = require('./helpers')

module.exports = [
	// --- Generic prefix stripping ---
	{
		name: 'prefix-fallback: --clr-primary maps to accent',
		fn: async () => {
			const css = ':root { --clr-primary: #FF5500; }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.accent, 'FF5500', '--clr-primary → accent')
		},
	},
	{
		name: 'prefix-fallback: --brand-accent maps to accent',
		fn: async () => {
			const css = ':root { --brand-accent: #AA00BB; }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.accent, 'AA00BB', '--brand-accent → accent')
		},
	},
	{
		name: 'prefix-fallback: --app-background maps to bg',
		fn: async () => {
			const css = ':root { --app-background: #112233; }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.bg, '112233', '--app-background → bg')
		},
	},
	{
		name: 'prefix-fallback: --my-text maps to text',
		fn: async () => {
			const css = ':root { --my-text: #EEDDCC; }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.text, 'EEDDCC', '--my-text → text')
		},
	},
	// --- @media (prefers-color-scheme: dark) overlay ---
	{
		name: 'media-query: dark vars override base when mode is dark',
		fn: async () => {
			const css = `
:root { --bg: #111111; --accent: #AAAAAA; }
@media (prefers-color-scheme: dark) {
  :root { --accent: #FF0000; }
}
`
			const theme = extractThemeFromCSS(css, { defaultPreset: 'dark' })
			assertEqual(theme.bg, '111111', 'bg from base')
			assertEqual(theme.accent, 'FF0000', 'accent overridden by dark media query')
		},
	},
	// --- @media (prefers-color-scheme: light) overlay ---
	{
		name: 'media-query: light vars override base when mode is light',
		fn: async () => {
			const css = `
:root { --bg: #FFFFFF; --accent: #333333; }
@media (prefers-color-scheme: light) {
  :root { --accent: #00FF00; }
}
`
			const theme = extractThemeFromCSS(css, { defaultPreset: 'light' })
			assertEqual(theme.bg, 'FFFFFF', 'bg from base')
			assertEqual(theme.accent, '00FF00', 'accent overridden by light media query')
		},
	},
	// --- Base vars without media queries still work ---
	{
		name: 'media-query: base vars work when no media queries present',
		fn: async () => {
			const css = ':root { --bg: #AABBCC; --accent: #112233; }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.bg, 'AABBCC', 'bg from base')
			assertEqual(theme.accent, '112233', 'accent from base')
		},
	},
]
