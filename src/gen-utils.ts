/**
 * PptxGenJS: Utility Methods
 */

import { EMU, REGEX_HEX_COLOR, DEF_FONT_COLOR, ONEPT, SchemeColor, SCHEME_COLORS, PRESET_PATTERN_VALS } from './core-enums'
import { PresLayout, TextGlowProps, PresSlide, ShapeFillProps, Color, ShapeLineProps, Coord, ShadowProps, GradientFillProps, PatternFillProps, ImageFillProps, ReflectionProps, SoftEdgeProps, Shape3DProps, LayoutGridProps, LayoutGridResult } from './core-interfaces'

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
 * Creates `a:reflection` element
 * @param {ReflectionProps} options reflection properties
 * @see http://officeopenxml.com/drwSp-effects.php
 * Defaults: { blur: 0.5, distance: 0, size: 50, opacity: 50, fadeDirection: 90 }
 */
export function createReflectionElement (options: ReflectionProps): string {
	const opts = { blur: 0.5, distance: 0, size: 50, opacity: 50, fadeDirection: 90, ...options }
	const blurRad = Math.round(opts.blur * ONEPT) // pt → EMU
	const stA = Math.round(opts.opacity * 1000) // % → thousandths
	const endPos = Math.round(opts.size * 1000) // % → thousandths
	const dist = Math.round(opts.distance * ONEPT) // pt → EMU
	const dir = Math.round(opts.fadeDirection * 60000) // degrees → 60,000ths

	// `endA`, `sy`, `rotWithShape` are fixed constants (no props exposed for them)
	return `<a:reflection blurRad="${blurRad}" stA="${stA}" endA="300" endPos="${endPos}" dist="${dist}" dir="${dir}" sy="-100000" rotWithShape="0"/>`
}

/**
 * Create a soft-edge (feathered edge) effect element
 * @param {SoftEdgeProps} options soft-edge properties
 * @see http://officeopenxml.com/drwSp-effects.php
 */
export function createSoftEdgeElement (options: SoftEdgeProps): string {
	const rad = Math.round(options.radius * EMU) // inches → EMU
	return `<a:softEdge rad="${rad}"/>`
}

/**
 * Create a 3-D bevel/extrusion element pair (`<a:scene3d>` + `<a:sp3d>`)
 * - emitted as siblings of `<a:effectLst>` inside `<p:spPr>`
 * - canonical CT_ShapeProperties order requires `scene3d` BEFORE `sp3d`
 * - `<a:sp3d>` requires a `<a:scene3d>` to render; a default camera/light rig is always emitted
 * @param {Shape3DProps} options 3-D bevel properties
 * @see http://officeopenxml.com/drwSp-3D.php
 */
export function createShape3DElement (options: Shape3DProps): string {
	const BEVEL_DEF = 76200 // CT_Bevel default w/h (EMU) == 0.083in
	const bevelXml = (b: { preset?: string, width?: number, height?: number }, tag: string): string => {
		const w = b.width != null ? Math.round(b.width * EMU) : BEVEL_DEF
		const h = b.height != null ? Math.round(b.height * EMU) : BEVEL_DEF
		const prst = b.preset || 'circle'
		return `<a:${tag} w="${w}" h="${h}" prst="${prst}"/>`
	}

	// scene3d: fixed default camera/light rig (camera/lightRig override is out of scope)
	const scene3d = '<a:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></a:scene3d>'

	// sp3d attrs (only emit set values)
	let sp3dAttrs = ''
	if (options.depth?.amount != null) sp3dAttrs += ` extrusionH="${Math.round(options.depth.amount * EMU)}"`
	if (options.contour?.width != null) sp3dAttrs += ` contourW="${Math.round(options.contour.width * EMU)}"`
	if (options.material) sp3dAttrs += ` prstMaterial="${options.material}"`

	// sp3d children — canonical CT_Shape3D order: bevelT, bevelB, extrusionClr, contourClr
	let sp3dChildren = ''
	if (options.top) sp3dChildren += bevelXml(options.top, 'bevelT')
	if (options.bottom) sp3dChildren += bevelXml(options.bottom, 'bevelB')
	if (options.depth?.color) sp3dChildren += `<a:extrusionClr><a:srgbClr val="${options.depth.color}"/></a:extrusionClr>`
	if (options.contour?.color) sp3dChildren += `<a:contourClr><a:srgbClr val="${options.contour.color}"/></a:contourClr>`

	const sp3d = sp3dChildren ? `<a:sp3d${sp3dAttrs}>${sp3dChildren}</a:sp3d>` : `<a:sp3d${sp3dAttrs}/>`

	return scene3d + sp3d
}

/**
 * Create color selection
 * @param {Color | ShapeFillProps | ShapeLineProps | GradientFillProps | PatternFillProps | ImageFillProps} props fill props
 * @returns XML string
 */
export function genXmlColorSelection (props: Color | ShapeFillProps | ShapeLineProps | GradientFillProps | PatternFillProps | ImageFillProps): string {
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
		} else if (props.type === 'pattern') {
			// Pattern fills are emitted as a self-contained `<a:pattFill>` (replaces `<a:solidFill>`)
			return genXmlPatternFill(props)
		} else if (props.type === 'image') {
			// Image/blip fills require a registered media relationship (an `r:embed` rId), which this
			// context-free helper has no access to — they are emitted inline at the shape-fill site
			// (gen-xml.ts). Reaching here means no rId was resolved → emit nothing (caller falls back).
			return ''
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
			// position 0–100 → `pos` in thousandths of a percent (× 1000).
			// `pos` is ST_PositiveFixedPercentage [0,100000]; clamp the 0–100 input
			// before scaling so out-of-range stops stay schema-valid (clamp-don't-crash).
			const pos = Math.round(Math.max(0, Math.min(100, stop.position || 0)) * 1000)
			// Per-stop transparency uses PROMPT.md direct mapping (100 = opaque → 100000; 40 → 40000).
			// NOTE: this differs from the solid-fill path which inverts via `(100 - transparency) * 1000`.
			// `a:alpha@val` is also ST_PositiveFixedPercentage [0,100000]; clamp into [0,100] first.
			const inner = typeof stop.transparency === 'number' ? `<a:alpha val="${Math.round(Math.max(0, Math.min(100, stop.transparency)) * 1000)}"/>` : ''
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
 * Create a preset pattern (hatch) fill element (`<a:pattFill>`), replacing the solid fill in a shape's `<p:spPr>`.
 * Reuses `createColorElement()` for fore/back colours so hex and scheme colours are handled consistently.
 * @param {PatternFillProps} props pattern fill props
 * @returns {string} XML string (empty string when the preset is unknown — guard-don't-crash, keeps output schema-valid)
 * @see ECMA-376 §20.1.8.32 (pattFill) / §20.1.10.58 (ST_PresetPatternVal)
 */
export function genXmlPatternFill (props: PatternFillProps): string {
	if (!props || !props.preset) return ''

	// Validate the preset against ST_PresetPatternVal; on unknown value warn + skip emit so the
	// part stays schema-valid (an invalid `prst` would otherwise fail OOXML validation).
	if (!PRESET_PATTERN_VALS.includes(props.preset)) {
		console.warn(`"${props.preset}" is not a valid preset pattern! Pattern fill skipped. Use an ECMA-376 ST_PresetPatternVal value (e.g. 'ltUpDiag', 'cross', 'pct50').`)
		return ''
	}

	const fgClr = `<a:fgClr>${createColorElement(props.foreColor)}</a:fgClr>`
	// Missing backColor → omit <a:bgClr> entirely (PowerPoint treats as no background).
	const bgClr = props.backColor ? `<a:bgClr>${createColorElement(props.backColor)}</a:bgClr>` : ''

	return `<a:pattFill prst="${props.preset}">${fgClr}${bgClr}</a:pattFill>`
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

/**
 * Compute evenly-spaced grid cell positions within a bounding area.
 * - Pure math utility (no OOXML emission); returns one `{ x, y, w, h }` (inches) per item, in item order.
 * - Eliminates repetitive grid-math when positioning capability cards, icon grids, comparison layouts, etc.
 *
 * Calculation (per item `i`):
 *   cellW = (area.w - (columns - 1) * gapX) / columns
 *   rows  = ceil(items / columns)
 *   cellH = (area.h - (rows - 1) * gapY) / rows
 *   col = i % columns; row = floor(i / columns)
 *   x = area.x + col * (cellW + gapX); y = area.y + row * (cellH + gapY)
 *
 * @param {LayoutGridProps} props - grid options
 * @returns {LayoutGridResult} array of `{ x, y, w, h }` cells (inches), one per item
 * @throws {Error} when `area` has zero/negative width or height
 * @example pptx.layoutGrid({ items: 6, columns: 3, area: { x: 0.5, y: 2, w: 12, h: 4 }, gap: 0.2 })
 */
export function layoutGrid (props: LayoutGridProps): LayoutGridResult {
	const { items, columns, area } = props
	const gap = props.gap ?? 0.2
	const gapX = props.gapX ?? gap
	const gapY = props.gapY ?? gap
	const padding = props.padding ?? 0
	const align = props.align ?? 'start'

	// Edge case: no items -> empty result
	if (!items || items <= 0) return []
	// Guard: a zero/negative area can't be subdivided
	if (!area || !(area.w > 0) || !(area.h > 0)) throw new Error('layoutGrid: `area` requires positive `w` and `h`')
	if (!(columns > 0)) throw new Error('layoutGrid: `columns` must be a positive number')

	const rows = Math.ceil(items / columns)
	const cellW = (area.w - (columns - 1) * gapX) / columns
	const cellH = (area.h - (rows - 1) * gapY) / rows

	const result: LayoutGridResult = []
	for (let i = 0; i < items; i++) {
		const col = i % columns
		const row = Math.floor(i / columns)

		// Items on the final (possibly partial) row can be re-aligned within the area
		let rowCellW = cellW
		let rowOffsetX = 0
		const isLastRow = row === rows - 1
		const lastRowCount = items - (rows - 1) * columns
		if (isLastRow && lastRowCount < columns && lastRowCount > 0) {
			const rowCols = lastRowCount
			if (align === 'stretch') {
				// Widen the partial row's cells to fill the full area width
				rowCellW = (area.w - (rowCols - 1) * gapX) / rowCols
			} else if (align === 'center') {
				// Centre the partial row (cells keep their size)
				const rowWidth = rowCols * cellW + (rowCols - 1) * gapX
				rowOffsetX = (area.w - rowWidth) / 2
			}
		}

		const x = area.x + rowOffsetX + col * (rowCellW + gapX)
		const y = area.y + row * (cellH + gapY)

		// `padding` insets each cell box on all sides
		result.push({
			x: x + padding,
			y: y + padding,
			w: rowCellW - 2 * padding,
			h: cellH - 2 * padding,
		})
	}

	return result
}
