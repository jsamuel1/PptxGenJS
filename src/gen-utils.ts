/**
 * PptxGenJS: Utility Methods
 */

import { EMU, REGEX_HEX_COLOR, DEF_FONT_COLOR, ONEPT, SchemeColor, SCHEME_COLORS } from './core-enums'
import { PresLayout, TextGlowProps, PresSlide, ShapeFillProps, Color, ShapeLineProps, Coord, ShadowProps, GradientFillProps } from './core-interfaces'

/**
 * Translates any type of `x`/`y`/`w`/`h` prop to EMU
 * - guaranteed to return a result regardless of undefined, null, etc. (0)
 * - {number} - 12800 (EMU)
 * - {number} - 0.5 (inches)
 * - {string} - "75%"
 * @param {number|string} size - numeric ("5.5") or percentage ("90%")
 * @param {'X' | 'Y'} xyDir - direction
 * @param {PresLayout} layout - presentation layout
 * @returns {number} calculated size
 */
export function getSmartParseNumber (size: Coord, xyDir: 'X' | 'Y', layout: PresLayout): number {
	// FIRST: Convert string numeric value if reqd
	if (typeof size === 'string' && !isNaN(Number(size))) size = Number(size)

	// CASE 1: Number in inches
	// Assume any number less than 100 is inches
	if (typeof size === 'number' && size < 100) return inch2Emu(size)

	// CASE 2: Number is already converted to something other than inches
	// Assume any number greater than 100 sure isnt inches! Just return it (assume value is EMU already).
	if (typeof size === 'number' && size >= 100) return size

	// CASE 3: Percentage (ex: '50%')
	if (typeof size === 'string' && size.includes('%')) {
		if (xyDir && xyDir === 'X') return Math.round((parseFloat(size) / 100) * layout.width)
		if (xyDir && xyDir === 'Y') return Math.round((parseFloat(size) / 100) * layout.height)

		// Default: Assume width (x/cx)
		return Math.round((parseFloat(size) / 100) * layout.width)
	}

	// LAST: Default value
	return 0
}

/**
 * Basic UUID Generator Adapted
 * @link https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript#answer-2117523
 * @param {string} uuidFormat - UUID format
 * @returns {string} UUID
 */
export function getUuid (uuidFormat: string): string {
	return uuidFormat.replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0
		const v = c === 'x' ? r : (r & 0x3) | 0x8
		// OOXML ST_Guid requires uppercase hex: \{[0-9A-F]{8}-...\}
		return v.toString(16).toUpperCase()
	})
}

/**
 * Replace special XML characters with HTML-encoded strings
 * @param {string} xml - XML string to encode
 * @returns {string} escaped XML
 */
export function encodeXmlEntities (xml: string): string {
	// NOTE: Dont use short-circuit eval here as value c/b "0" (zero) etc.!
	if (typeof xml === 'undefined' || xml == null) return ''
	return xml.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/**
 * Convert inches into EMU
 * @param {number|string} inches - as string or number
 * @returns {number} EMU value
 */
export function inch2Emu (inches: number | string): number {
	// NOTE: Provide Caller Safety: Numbers may get conv<->conv during flight, so be kind and do some simple checks to ensure inches were passed
	// Any value over 100 damn sure isnt inches, so lets assume its in EMU already, therefore, just return the same value
	if (typeof inches === 'number' && inches > 100) return inches
	if (typeof inches === 'string') inches = Number(inches.replace(/in*/gi, ''))
	return Math.round(EMU * inches)
}

/**
 * Convert `pt` into points (using `ONEPT`)
 * @param {number|string} pt
 * @returns {number} value in points (`ONEPT`)
 */
export function valToPts (pt: number | string): number {
	const points = Number(pt) || 0
	return isNaN(points) ? 0 : Math.round(points * ONEPT)
}

/**
 * Convert degrees (0..360) to PowerPoint `rot` value
 * @param {number} d degrees
 * @returns {number} calculated `rot` value
 */
export function convertRotationDegrees (d: number): number {
	d = d || 0
	return Math.round((d > 360 ? d - 360 : d) * 60000)
}

/**
 * Converts component value to hex value
 * @param {number} c - component color
 * @returns {string} hex string
 */
export function componentToHex (c: number): string {
	const hex = c.toString(16)
	return hex.length === 1 ? '0' + hex : hex
}

/**
 * Converts RGB colors from css selectors to Hex for Presentation colors
 * @param {number} r - red value
 * @param {number} g - green value
 * @param {number} b - blue value
 * @returns {string} XML string
 */
export function rgbToHex (r: number, g: number, b: number): string {
	return (componentToHex(r) + componentToHex(g) + componentToHex(b)).toUpperCase()
}

/**  TODO: FUTURE: TODO-4.0:
 * @date 2022-04-10
 * @tldr this s/b a private method with all current calls switched to `genXmlColorSelection()`
 * @desc lots of code calls this method
 * @example [gen-charts.tx] `strXml += '<a:solidFill>' + createColorElement(seriesColor, `<a:alpha val="${Math.round(opts.chartColorsOpacity * 1000)}"/>`) + '</a:solidFill>'`
 * Thi sis wrong. We s/b calling `genXmlColorSelection()` instead as it returns `<a:solidfill>BLAH</a:solidFill>`!!
 */
/**
 * Create either a `a:schemeClr` - (scheme color) or `a:srgbClr` (hexa representation).
 * @param {string|SCHEME_COLORS} colorStr - hexa representation (eg. "FFFF00") or a scheme color constant (eg. pptx.SchemeColor.ACCENT1)
 * @param {string} innerElements - additional elements that adjust the color and are enclosed by the color element
 * @returns {string} XML string
 */
export function createColorElement (colorStr: string | SCHEME_COLORS, innerElements?: string): string {
	let colorVal = (colorStr || '').replace('#', '')

	// 8-char hex (RGBA) — strip the alpha byte to a sibling <a:alpha val="N"/>,
	// continue with the leading 6-char RGB through the existing validation. This keeps
	// fill/text/line/glow paths from silently falling back to DEF_FONT_COLOR on RGBA input.
	if (/^[0-9a-fA-F]{8}$/.test(colorVal)) {
		const alphaHex = colorVal.slice(6, 8)
		const alphaVal = Math.round((parseInt(alphaHex, 16) / 255) * 100000)
		innerElements = `<a:alpha val="${alphaVal}"/>${innerElements || ''}`
		colorVal = colorVal.slice(0, 6)
	}

	if (
		!REGEX_HEX_COLOR.test(colorVal) &&
		colorVal !== SchemeColor.background1 &&
		colorVal !== SchemeColor.background2 &&
		colorVal !== SchemeColor.text1 &&
		colorVal !== SchemeColor.text2 &&
		colorVal !== SchemeColor.accent1 &&
		colorVal !== SchemeColor.accent2 &&
		colorVal !== SchemeColor.accent3 &&
		colorVal !== SchemeColor.accent4 &&
		colorVal !== SchemeColor.accent5 &&
		colorVal !== SchemeColor.accent6
	) {
		console.warn(`"${colorVal}" is not a valid scheme color or hex RGB! "${DEF_FONT_COLOR}" used instead. Only provide 6-digit RGB or 'pptx.SchemeColor' values!`)
		colorVal = DEF_FONT_COLOR
	}

	const tagName = REGEX_HEX_COLOR.test(colorVal) ? 'srgbClr' : 'schemeClr'
	const colorAttr = 'val="' + (REGEX_HEX_COLOR.test(colorVal) ? colorVal.toUpperCase() : colorVal) + '"'

	return innerElements ? `<a:${tagName} ${colorAttr}>${innerElements}</a:${tagName}>` : `<a:${tagName} ${colorAttr}/>`
}

/**
 * Creates `a:glow` element
 * @param {TextGlowProps} options glow properties
 * @param {TextGlowProps} defaults defaults for unspecified properties in `opts`
 * @see http://officeopenxml.com/drwSp-effects.php
 * { size: 8, color: 'FFFFFF', opacity: 0.75 };
 */
export function createGlowElement (options: TextGlowProps, defaults: TextGlowProps): string {
	let strXml = ''
	const opts = { ...defaults, ...options }
	const size = Math.round(opts.size * ONEPT)
	const color = opts.color
	const opacity = Math.round(opts.opacity * 100000)

	strXml += `<a:glow rad="${size}">`
	strXml += createColorElement(color, `<a:alpha val="${opacity}"/>`)
	strXml += '</a:glow>'

	return strXml
}

/**
 * Create color selection
 * @param {Color | ShapeFillProps | ShapeLineProps | GradientFillProps} props fill props
 * @returns XML string
 */
export function genXmlColorSelection (props: Color | ShapeFillProps | ShapeLineProps | GradientFillProps): string {
	let fillType = 'solid'
	let colorVal = ''
	let internalElements = ''
	let outText = ''

	if (props) {
		if (typeof props === 'string') {
			colorVal = props
		} else if (props.type === 'gradient') {
			// Gradient fills are emitted as a self-contained `<a:gradFill>` (replaces `<a:solidFill>`)
			return genXmlGradientFill(props)
		} else {
			if (props.type) fillType = props.type
			if (props.color) colorVal = props.color
			if (props.alpha) internalElements += `<a:alpha val="${Math.round((100 - props.alpha) * 1000)}"/>` // DEPRECATED: @deprecated v3.3.0
			if (props.transparency) internalElements += `<a:alpha val="${Math.round((100 - props.transparency) * 1000)}"/>`
		}

		switch (fillType) {
			case 'solid':
				outText += `<a:solidFill>${createColorElement(colorVal, internalElements)}</a:solidFill>`
				break
			default: // @note need a statement as having only "break" is removed by rollup, then tiggers "no-default" js-linter
				outText += ''
				break
		}
	}

	return outText
}

/**
 * Create a gradient fill element (`<a:gradFill>`), replacing the solid fill in a shape's `<p:spPr>`.
 * Reuses `createColorElement()` per stop so hex and scheme colours are handled consistently.
 * @param {GradientFillProps} props gradient fill props
 * @returns {string} XML string (empty string when no stops are provided)
 * @see ECMA-376 §20.1.8.33 (gradFill) / §20.1.8.41 (lin)
 */
export function genXmlGradientFill (props: GradientFillProps): string {
	if (!props || !Array.isArray(props.stops) || props.stops.length === 0) return ''

	// Normalise out-of-order input by sorting stops ascending by position
	const stops = [...props.stops].sort((a, b) => (a.position || 0) - (b.position || 0))

	const gsList = stops
		.map(stop => {
			// position 0–100 → `pos` in thousandths of a percent (× 1000)
			const pos = Math.round((stop.position || 0) * 1000)
			// Per-stop transparency uses PROMPT.md direct mapping (100 = opaque → 100000; 40 → 40000).
			// NOTE: this differs from the solid-fill path which inverts via `(100 - transparency) * 1000`.
			const inner = typeof stop.transparency === 'number' ? `<a:alpha val="${Math.round(stop.transparency * 1000)}"/>` : ''
			return `<a:gs pos="${pos}">${createColorElement(stop.color, inner)}</a:gs>`
		})
		.join('')

	// direction/angle → `<a:lin ang>` in 60,000ths of a degree (degrees × 60000)
	let ang = 0
	if (typeof props.direction === 'number') ang = Math.round(props.direction * 60000)
	else if (props.direction === 'vertical') ang = 5400000 // 90°
	else if (props.direction === 'diagonal') ang = 2700000 // 45°
	else ang = 0 // 'horizontal' (0°) or undefined

	const rotWithShape = props.rotWithShape === false ? '0' : '1'

	return `<a:gradFill rotWithShape="${rotWithShape}"><a:gsLst>${gsList}</a:gsLst><a:lin ang="${ang}" scaled="1"/></a:gradFill>`
}

/**
 * Get a new rel ID (rId) for charts, media, etc.
 * @param {PresSlide} target - the slide to use
 * @returns {number} count of all current rels plus 1 for the caller to use as its "rId"
 */
export function getNewRelId (target: PresSlide): number {
	return target._rels.length + target._relsChart.length + target._relsMedia.length + 1
}

/**
 * Checks shadow options passed by user and performs corrections if needed.
 * @param {ShadowProps} ShadowProps - shadow options
 */
export function correctShadowOptions (ShadowProps: ShadowProps): ShadowProps | undefined {
	if (!ShadowProps || typeof ShadowProps !== 'object') {
		// console.warn("`shadow` options must be an object. Ex: `{shadow: {type:'none'}}`")
		return
	}

	// OPT: `type`
	if (ShadowProps.type !== 'outer' && ShadowProps.type !== 'inner' && ShadowProps.type !== 'none') {
		console.warn('Warning: shadow.type options are `outer`, `inner` or `none`.')
		ShadowProps.type = 'outer'
	}

	// OPT: `angle`
	if (ShadowProps.angle) {
		// A: REALITY-CHECK
		if (isNaN(Number(ShadowProps.angle)) || ShadowProps.angle < 0 || ShadowProps.angle > 359) {
			console.warn('Warning: shadow.angle can only be 0-359')
			ShadowProps.angle = 270
		}

		// B: ROBUST: Cast any type of valid arg to int: '12', 12.3, etc. -> 12
		ShadowProps.angle = Math.round(Number(ShadowProps.angle))
	}

	// OPT: `opacity`
	if (ShadowProps.opacity) {
		// A: REALITY-CHECK
		if (isNaN(Number(ShadowProps.opacity)) || ShadowProps.opacity < 0 || ShadowProps.opacity > 1) {
			console.warn('Warning: shadow.opacity can only be 0-1')
			ShadowProps.opacity = 0.75
		}

		// B: ROBUST: Cast any type of valid arg to int: '12', 12.3, etc. -> 12
		ShadowProps.opacity = Number(ShadowProps.opacity)
	}

	// OPT: `color`
	if (ShadowProps.color) {
		// INCORRECT FORMAT
		if (ShadowProps.color.startsWith('#')) {
			console.warn('Warning: shadow.color should not include hash (#) character, , e.g. "FF0000"')
			ShadowProps.color = ShadowProps.color.replace('#', '')
		}

		// 8-char hex (RGBA) — derive `opacity` from the alpha byte (only when caller
		// did not pass an explicit opacity), then strip the alpha byte from the color so
		// emit sites produce valid 6-char `<a:srgbClr val="…"/>`.
		if (/^[0-9a-fA-F]{8}$/.test(ShadowProps.color)) {
			const alphaHex = ShadowProps.color.slice(6, 8)
			if (ShadowProps.opacity === undefined) {
				ShadowProps.opacity = parseInt(alphaHex, 16) / 255
			}
			ShadowProps.color = ShadowProps.color.slice(0, 6)
		}
	}

	return ShadowProps
}

/**
 * Convert an SVG `<path d="…">` definition to an OOXML custom geometry (`<a:custGeom>`).
 *
 * Supports the following SVG path commands (both absolute upper-case and relative lower-case):
 * - `M`/`m` moveTo            → `<a:moveTo>`  (extra coordinate pairs become implicit `lineTo`)
 * - `L`/`l` lineTo            → `<a:lnTo>`
 * - `H`/`h` horizontal lineTo → `<a:lnTo>`
 * - `V`/`v` vertical lineTo   → `<a:lnTo>`
 * - `C`/`c` cubic Bézier      → `<a:cubicBezTo>`
 * - `Q`/`q` quadratic Bézier  → `<a:quadBezTo>`
 * - `Z`/`z` close path        → `<a:close>`
 *
 * Relative commands are tracked against the current pen position and converted to absolute
 * coordinates. Coordinates are scaled from the SVG viewBox into EMU via `914400 / width`, so the
 * viewBox width maps to exactly 1 inch (914400 EMU) of path coordinate space. The shape's on-slide
 * dimensions still come from the `<a:xfrm><a:ext>` set by the caller — the path coordinate system is
 * stretched to fit it — so the absolute scale here only needs to be internally consistent.
 *
 * @param {string} svgPathD - the SVG path `d` attribute (e.g. `"M 0 0 L 12 0 L 6 12 Z"`)
 * @param {number} width - SVG viewBox width
 * @param {number} height - SVG viewBox height
 * @returns {string} OOXML `<a:custGeom>…</a:custGeom>` string (empty string on invalid input)
 * @see ECMA-376 §20.1.9.8 (custGeom) / §20.1.9.16 (path2D)
 */
export function svgPathToOoxml (svgPathD: string, width: number, height: number): string {
	if (!svgPathD || typeof svgPathD !== 'string' || !(width > 0) || !(height > 0)) return ''

	const scale = 914400 / width
	const pathW = Math.round(width * scale)
	const pathH = Math.round(height * scale)

	// Match each command letter followed by its (possibly empty) run of numeric arguments
	const commandRegex = /([MmLlHhVvCcQqZz])([^MmLlHhVvCcQqZz]*)/g
	// Match numbers incl. decimals, leading sign, and scientific notation
	const numberRegex = /-?\d*\.?\d+(?:[eE][-+]?\d+)?/g

	const sc = (v: number): number => Math.round(v * scale)

	let curX = 0
	let curY = 0
	let startX = 0
	let startY = 0
	let xml = ''

	let match: RegExpExecArray | null
	while ((match = commandRegex.exec(svgPathD)) !== null) {
		const cmd = match[1]
		const isRel = cmd >= 'a' && cmd <= 'z'
		const upper = cmd.toUpperCase()
		const args = (match[2].match(numberRegex) ?? []).map(Number)
		let i = 0

		switch (upper) {
			case 'M': {
				// First coordinate pair is a moveTo; any subsequent pairs are implicit lineTo (per SVG spec)
				let first = true
				while (i + 1 < args.length) {
					let x = args[i]
					let y = args[i + 1]
					if (isRel) { x += curX; y += curY }
					curX = x
					curY = y
					if (first) {
						startX = curX
						startY = curY
						xml += `<a:moveTo><a:pt x="${sc(curX)}" y="${sc(curY)}"/></a:moveTo>`
						first = false
					} else {
						xml += `<a:lnTo><a:pt x="${sc(curX)}" y="${sc(curY)}"/></a:lnTo>`
					}
					i += 2
				}
				break
			}
			case 'L': {
				while (i + 1 < args.length) {
					let x = args[i]
					let y = args[i + 1]
					if (isRel) { x += curX; y += curY }
					curX = x
					curY = y
					xml += `<a:lnTo><a:pt x="${sc(curX)}" y="${sc(curY)}"/></a:lnTo>`
					i += 2
				}
				break
			}
			case 'H': {
				while (i < args.length) {
					let x = args[i]
					if (isRel) x += curX
					curX = x
					xml += `<a:lnTo><a:pt x="${sc(curX)}" y="${sc(curY)}"/></a:lnTo>`
					i += 1
				}
				break
			}
			case 'V': {
				while (i < args.length) {
					let y = args[i]
					if (isRel) y += curY
					curY = y
					xml += `<a:lnTo><a:pt x="${sc(curX)}" y="${sc(curY)}"/></a:lnTo>`
					i += 1
				}
				break
			}
			case 'C': {
				while (i + 5 < args.length) {
					let x1 = args[i]
					let y1 = args[i + 1]
					let x2 = args[i + 2]
					let y2 = args[i + 3]
					let x = args[i + 4]
					let y = args[i + 5]
					if (isRel) { x1 += curX; y1 += curY; x2 += curX; y2 += curY; x += curX; y += curY }
					xml += `<a:cubicBezTo><a:pt x="${sc(x1)}" y="${sc(y1)}"/><a:pt x="${sc(x2)}" y="${sc(y2)}"/><a:pt x="${sc(x)}" y="${sc(y)}"/></a:cubicBezTo>`
					curX = x
					curY = y
					i += 6
				}
				break
			}
			case 'Q': {
				while (i + 3 < args.length) {
					let x1 = args[i]
					let y1 = args[i + 1]
					let x = args[i + 2]
					let y = args[i + 3]
					if (isRel) { x1 += curX; y1 += curY; x += curX; y += curY }
					xml += `<a:quadBezTo><a:pt x="${sc(x1)}" y="${sc(y1)}"/><a:pt x="${sc(x)}" y="${sc(y)}"/></a:quadBezTo>`
					curX = x
					curY = y
					i += 4
				}
				break
			}
			case 'Z': {
				xml += '<a:close/>'
				// Pen returns to the start of the current subpath
				curX = startX
				curY = startY
				break
			}
			default:
				break
		}
	}

	return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="${pathW}" h="${pathH}">${xml}</a:path></a:pathLst></a:custGeom>`
}
