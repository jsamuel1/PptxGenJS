/**
 * HSL/HWB → hex conversion and CSS var() fallback extraction.
 * Pure, dependency-free helpers consumed by both normalizeColor paths.
 */

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
