/**
 * HSL/HWB → hex conversion and CSS var() fallback extraction.
 * Pure, dependency-free helpers consumed by both normalizeColor paths.
 */

import { cssNamedColorToHex } from './css-named-colors'

/** Convert HSL values to 6-digit uppercase hex (no #). h: 0-360, s/l: 0-100 */
export function hslToHex(h: number, s: number, l: number): string {
	h = ((h % 360) + 360) % 360
	s = Math.max(0, Math.min(100, s)) / 100
	l = Math.max(0, Math.min(100, l)) / 100
	const a = s * Math.min(l, 1 - l)
	const f = (n: number) => {
		const k = (n + h / 30) % 12
		return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
	}
	return [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Convert HWB values to 6-digit uppercase hex (no #). h: 0-360, w/b: 0-100 */
export function hwbToHex(h: number, w: number, b: number): string {
	w = Math.max(0, Math.min(100, w)) / 100
	b = Math.max(0, Math.min(100, b)) / 100
	if (w + b > 1) { const t = w + b; w /= t; b /= t }
	const rgb = [0, 8, 4].map(n => {
		const k = (n + h / 30) % 12
		const pure = 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1))
		return pure * (1 - w - b) + w
	})
	return rgb.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Parse `hsl(H, S%, L%)` or `hsl(H S% L%)` or `hsla(...)` → 6-hex or null */
export function parseHslString(raw: string): string | null {
	const m = raw.trim().match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i)
	if (!m) return null
	return hslToHex(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]))
}

/** Parse `hwb(H W% B%)` → 6-hex or null */
export function parseHwbString(raw: string): string | null {
	const m = raw.trim().match(/^hwb\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i)
	if (!m) return null
	return hwbToHex(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]))
}

/** Extract fallback value from `var(--name, fallback)` → fallback string or null */
export function extractVarFallback(raw: string): string | null {
	const s = raw.trim()
	if (!/^var\(\s*--[\w-]+\s*,/i.test(s)) return null
	// Strip outer `var(--name, ` prefix and trailing `)`
	const inner = s.slice(s.indexOf(',') + 1, -1).trim()
	return inner || null
}

/** Parse `rgb(R,G,B)` or `rgba(R,G,B,A)` or modern `rgb(R G B / A)` → hex + alpha, or null. */
export function parseRgbString(raw: string): { hex: string, alpha: number } | null {
	const m = raw.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)/i)
	if (!m) return null
	const r = Math.min(255, Math.max(0, Math.round(parseFloat(m[1]))))
	const g = Math.min(255, Math.max(0, Math.round(parseFloat(m[2]))))
	const b = Math.min(255, Math.max(0, Math.round(parseFloat(m[3]))))
	let alpha = 1
	if (m[4] != null) {
		alpha = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
	}
	const hex = [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()
	return { hex, alpha }
}

/** Convert OKLCh to 6-digit uppercase hex (no #). l: 0-1, c: 0-0.4ish, h: 0-360. */
export function oklchToHex(l: number, c: number, h: number): string {
	const hRad = h * Math.PI / 180
	const a_ = c * Math.cos(hRad)
	const b_ = c * Math.sin(hRad)
	// OKLab → linear sRGB via the cube-root matrix inversion
	const l_ = l + 0.3963377774 * a_ + 0.2158037573 * b_
	const m_ = l - 0.1055613458 * a_ - 0.0638541728 * b_
	const s_ = l - 0.0894841775 * a_ - 1.2914855480 * b_
	const ll = l_ * l_ * l_
	const mm = m_ * m_ * m_
	const ss = s_ * s_ * s_
	let r = +4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss
	let g = -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss
	let b = -0.0041960863 * ll - 0.7034186147 * mm + 1.7076147010 * ss
	// Linear sRGB → sRGB gamma
	const gamma = (x: number) => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
	r = Math.min(1, Math.max(0, gamma(r)))
	g = Math.min(1, Math.max(0, gamma(g)))
	b = Math.min(1, Math.max(0, gamma(b)))
	return [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Parse `oklch(L% C H)` or `oklch(L C H / A)` → hex + alpha, or null. L can be % or 0-1. */
export function parseOklchString(raw: string): { hex: string, alpha: number } | null {
	const m = raw.trim().match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/i)
	if (!m) return null
	let l = parseFloat(m[1])
	if (m[2] === '%') l = l / 100
	const c = parseFloat(m[3])
	const h = parseFloat(m[4])
	let alpha = 1
	if (m[5] != null) {
		alpha = m[5].endsWith('%') ? parseFloat(m[5]) / 100 : parseFloat(m[5])
	}
	return { hex: oklchToHex(l, c, h), alpha }
}

/** Convert CIELAB (D65) to 6-digit uppercase hex (no #). l: 0-100, a/b: roughly -128..127. */
export function labToHex(l: number, a: number, b: number): string {
	// CIELAB → XYZ (D65 reference white)
	const fy = (l + 16) / 116
	const fx = fy + a / 500
	const fz = fy - b / 200
	const delta = 6 / 29
	const finv = (t: number) => (t > delta ? t * t * t : 3 * delta * delta * (t - 4 / 29))
	// D65 reference white (Xn, Yn, Zn)
	const Xn = 0.95047
	const Yn = 1.0
	const Zn = 1.08883
	const X = Xn * finv(fx)
	const Y = Yn * finv(fy)
	const Z = Zn * finv(fz)
	// XYZ → linear sRGB
	let r = +3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z
	let g = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z
	let bl = +0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z
	// linear sRGB → sRGB gamma
	const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)
	r = Math.min(1, Math.max(0, gamma(r)))
	g = Math.min(1, Math.max(0, gamma(g)))
	bl = Math.min(1, Math.max(0, gamma(bl)))
	return [r, g, bl].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Parse `lab(L% a b)` or `lab(L a b / A)` → hex + alpha, or null. L may be `%` (0-100) or a 0-100 number. */
export function parseLabString(raw: string): { hex: string, alpha: number } | null {
	const m = raw.trim().match(/^lab\(\s*([\d.]+)(%?)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/i)
	if (!m) return null
	const l = parseFloat(m[1]) // L is 0-100 whether or not a % sign is present
	const a = parseFloat(m[3])
	const b = parseFloat(m[4])
	let alpha = 1
	if (m[5] != null) {
		alpha = m[5].endsWith('%') ? parseFloat(m[5]) / 100 : parseFloat(m[5])
	}
	return { hex: labToHex(l, a, b), alpha }
}

/** Extract alpha from hsl/hwb raw string (the `/ A` or `, A` portion after the main values). */
function extractAlphaFromColorFunc(raw: string): number {
	const m = raw.match(/[/,]\s*([\d.]+)(%?)\s*\)\s*$/)
	if (!m) return 1
	// Distinguish the alpha separator from the last value — hsl has 3 values before alpha
	const parts = raw.replace(/^[a-z]+\(\s*/i, '').replace(/\s*\)$/, '')
	const separators = parts.match(/[/,]/g)
	if (!separators || separators.length < 3) return 1
	const val = parseFloat(m[1])
	return m[2] === '%' ? val / 100 : val
}

/**
 * Normalise any CSS colour value to uppercase hex (no `#`).
 * Returns 6-digit hex for opaque, 8-digit hex when alpha < 1.
 * Falls through to trimmed input for unknown values.
 */
export function normalizeColor(raw: string): string {
	let v = (raw || '').trim().replace(/^#/, '')

	// Expand 3-digit → 6-digit, 4-digit → 8-digit
	if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.split('').map(c => c + c).join('')
	if (/^[0-9a-fA-F]{4}$/.test(v)) v = v.split('').map(c => c + c).join('')

	// 8-digit hex: strip alpha if FF, otherwise keep
	if (/^[0-9a-fA-F]{8}$/.test(v)) {
		return v.slice(6).toUpperCase() === 'FF' ? v.slice(0, 6).toUpperCase() : v.toUpperCase()
	}
	// 6-digit hex
	if (/^[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase()

	// rgb()/rgba()
	const rgb = parseRgbString(raw)
	if (rgb) {
		return rgb.alpha < 1
			? rgb.hex + Math.round(rgb.alpha * 255).toString(16).padStart(2, '0').toUpperCase()
			: rgb.hex
	}

	// Named CSS colour
	const named = cssNamedColorToHex(v)
	if (named) return named

	// hsl()/hsla()
	const hsl = parseHslString(raw)
	if (hsl) {
		const a = extractAlphaFromColorFunc(raw)
		return a < 1 ? hsl + Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase() : hsl
	}

	// hwb()
	const hwb = parseHwbString(raw)
	if (hwb) {
		const a = extractAlphaFromColorFunc(raw)
		return a < 1 ? hwb + Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase() : hwb
	}

	// oklch()
	const oklch = parseOklchString(raw)
	if (oklch) {
		return oklch.alpha < 1
			? oklch.hex + Math.round(oklch.alpha * 255).toString(16).padStart(2, '0').toUpperCase()
			: oklch.hex
	}

	// lab()
	const lab = parseLabString(raw)
	if (lab) {
		return lab.alpha < 1
			? lab.hex + Math.round(lab.alpha * 255).toString(16).padStart(2, '0').toUpperCase()
			: lab.hex
	}

	// var() fallback → recurse
	const varFb = extractVarFallback(raw)
	if (varFb) return normalizeColor(varFb)

	return v
}
