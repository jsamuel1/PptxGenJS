/**
 * PptxGenJS: Slide Object Generators
 */

import {
	BARCHART_COLORS,
	CHART_NAME,
	CHART_TYPE,
	DEF_CELL_BORDER,
	DEF_CELL_MARGIN_IN,
	DEF_CHART_BORDER,
	DEF_FONT_COLOR,
	DEF_FONT_SIZE,
	DEF_SHAPE_LINE_COLOR,
	DEF_SLIDE_MARGIN_IN,
	EMU,
	IMG_PLAYBTN,
	MASTER_OBJECTS,
	PIECHART_COLORS,
	SCHEME_COLOR_NAMES,
	SHAPE_NAME,
	SHAPE_TYPE,
	SLIDE_OBJECT_TYPES,
	TEXT_HALIGN,
	TEXT_VALIGN,
} from './core-enums'
import {
	AddSlideProps,
	AvatarProps,
	BackgroundProps,
	BadgeProps,
	CalloutProps,
	CardProps,
	GroupProps,
	IChartMulti,
	IChartOptsLib,
	IOptsChartData,
	ISlideObject,
	ImageFillProps,
	ImageProps,
	MediaProps,
	NoteParagraph,
	CommentProps,
	InkProps,
	SmartArtProps,
	ObjectOptions,
	OptsChartGridLine,
	PresLayout,
	PresSlide,
	ShapeLineProps,
	ShapeProps,
	SeparatorProps,
	SlideGroup,
	SlideLayout,
	SlideMasterProps,
	TableCell,
	TableProps,
	TableRow,
	TextProps,
	TextPropsOptions,
} from './core-interfaces'
import { getSlidesForTableRows } from './gen-tables'
import { encodeXmlEntities, getNewRelId, getSmartParseNumber, inch2Emu, valToPts, correctShadowOptions, inkForFill } from './gen-utils'
import { measureTextWidth } from './utils/measure-text-width'
import type { ThemePalette } from './utils/extract-theme'

/** counter for included charts (used for index in their filenames) */
let _chartCounter = 0

/**
 * Transforms a slide definition to a slide object that is then passed to the XML transformation process.
 * @param {SlideMasterProps} props - slide definition
 * @param {PresSlide|SlideLayout} target - empty slide object that should be updated by the passed definition
 */
export function createSlideMaster(props: SlideMasterProps, target: SlideLayout): void {
	// STEP 1: Add background if either the slide or layout has background props
	// if (props.background || target.background) addBackgroundDefinition(props.background, target)
	if (props.bkgd) target.bkgd = props.bkgd // DEPRECATED: (remove in v4.0.0)

	// STEP 2: Add all Slide Master objects in the order they were given
	if (props.objects && Array.isArray(props.objects) && props.objects.length > 0) {
		props.objects.forEach((object, idx) => {
			const key = Object.keys(object)[0]
			const tgt = target as PresSlide
			if (MASTER_OBJECTS[key] && key === 'chart') addChartDefinition(tgt, object[key].type, object[key].data, object[key].opts)
			else if (MASTER_OBJECTS[key] && key === 'image') addImageDefinition(tgt, object[key])
			else if (MASTER_OBJECTS[key] && key === 'line') addShapeDefinition(tgt, SHAPE_TYPE.LINE, object[key])
			else if (MASTER_OBJECTS[key] && key === 'rect') addShapeDefinition(tgt, SHAPE_TYPE.RECTANGLE, object[key])
			else if (MASTER_OBJECTS[key] && key === 'text') addTextDefinition(tgt, [{ text: object[key].text }], object[key].options, false)
			else if (MASTER_OBJECTS[key] && key === 'placeholder') {
				// TODO: 20180820: Check for existing `name`?
				object[key].options.placeholder = object[key].options.name
				delete object[key].options.name // remap name for earier handling internally
				object[key].options._placeholderType = object[key].options.type
				delete object[key].options.type // remap name for earier handling internally
				object[key].options._placeholderIdx = 100 + idx
				addTextDefinition(tgt, [{ text: object[key].text }], object[key].options, true)
				// TODO: ISSUE#599 - only text is suported now (add more below)
				// else if (object[key].image) addImageDefinition(tgt, object[key].image)
				/* 20200120: So... image placeholders go into the "slideLayoutN.xml" file and addImage doesnt do this yet...
					<p:sp>
				  <p:nvSpPr>
					<p:cNvPr id="7" name="Picture Placeholder 6">
					  <a:extLst>
						<a:ext uri="{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}">
						  <a16:creationId xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" id="{CE1AE45D-8641-0F4F-BDB5-080E69CCB034}"/>
						</a:ext>
					  </a:extLst>
					</p:cNvPr>
					<p:cNvSpPr>
				*/
			}
		})
	}

	// STEP 3: Add Slide Numbers (NOTE: Do this last so numbers are not covered by objects!)
	if (props.slideNumber && typeof props.slideNumber === 'object') target._slideNumberProps = props.slideNumber

	// STEP 4: Stash header/footer config (drives derived `<p:hf>` + ftr/dt placeholders on the layout)
	if (props.headerFooter && typeof props.headerFooter === 'object') target._headerFooter = props.headerFooter
}

/**
 * Generate the chart based on input data.
 * OOXML Chart Spec: ISO/IEC 29500-1:2016(E)
 *
 * @param {CHART_NAME | IChartMulti[]} `type` should belong to: 'column', 'pie'
 * @param {[]} `data` a JSON object with follow the following format
 * @param {IChartOptsLib} `opt` chart options
 * @param {PresSlide} `target` slide object that the chart will be added to
 * @return {object} chart object
 * {
 *    title: 'eSurvey chart',
 *    data: [
 *        {
 *            name: 'Income',
 *            labels: ['2005', '2006', '2007', '2008', '2009'],
 *            values: [23.5, 26.2, 30.1, 29.5, 24.6]
 *        },
 *        {
 *            name: 'Expense',
 *            labels: ['2005', '2006', '2007', '2008', '2009'],
 *            values: [18.1, 22.8, 23.9, 25.1, 25]
 *        }
 *    ]
 * }
 */
export function addChartDefinition(target: PresSlide, type: CHART_NAME | IChartMulti[], data: IOptsChartData[], opt: IChartOptsLib): object {
	function correctGridLineOptions(glOpts: OptsChartGridLine): void {
		if (!glOpts || glOpts.style === 'none') return
		if (glOpts.size !== undefined && (isNaN(Number(glOpts.size)) || glOpts.size <= 0)) {
			console.warn('Warning: chart.gridLine.size must be greater than 0.')
			delete glOpts.size // delete prop to used defaults
		}
		if (glOpts.style && !['solid', 'dash', 'dot'].includes(glOpts.style)) {
			console.warn('Warning: chart.gridLine.style options: `solid`, `dash`, `dot`.')
			delete glOpts.style
		}
		if (glOpts.cap && !['flat', 'square', 'round'].includes(glOpts.cap)) {
			console.warn('Warning: chart.gridLine.cap options: `flat`, `square`, `round`.')
			delete glOpts.cap
		}
	}

	const chartId = ++_chartCounter
	const resultObject = {
		_type: null,
		text: null,
		options: null,
		chartRid: null,
	}
	// DESIGN: `type` can an object (ex: `pptx.charts.DOUGHNUT`) or an array of chart objects
	// EX: addChartDefinition([ { type:pptx.charts.BAR, data:{name:'', labels:[], values[]} }, {<etc>} ])
	// Multi-Type Charts
	let tmpOpt = null
	let tmpData = []
	if (Array.isArray(type)) {
		// For multi-type charts there needs to be data for each type,
		// as well as a single data source for non-series operations.
		// The data is indexed below to keep the data in order when segmented
		// into types.
		type.forEach(obj => {
			tmpData = tmpData.concat(obj.data)
		})
		tmpOpt = data || opt
	} else {
		tmpData = data
		tmpOpt = opt
	}
	tmpData.forEach((item, i) => {
		item._dataIndex = i

		// Converts the 'labels' array from string[] to string[][] (or the respective primitive type), if needed
		if (item.labels !== undefined && !Array.isArray(item.labels[0])) {
			item.labels = [item.labels as string[]]
		}
	})
	const options: IChartOptsLib = tmpOpt && typeof tmpOpt === 'object' ? tmpOpt : {}

	// STEP 1: TODO: check for reqd fields, correct type, etc
	// `type` exists in CHART_TYPE
	// Array.isArray(data)
	/*
		if ( Array.isArray(rel.data) && rel.data.length > 0 && typeof rel.data[0] === 'object'
			&& rel.data[0].labels && Array.isArray(rel.data[0].labels)
			&& rel.data[0].values && Array.isArray(rel.data[0].values) ) {
			obj = rel.data[0];
		}
		else {
			console.warn("USAGE: addChart( 'pie', [ {name:'Sales', labels:['Jan','Feb'], values:[10,20]} ], {x:1, y:1} )");
			return;
		}
		*/

	// STEP 2: Set default options/decode user options
	// A: Core
	options._type = type
	options.x = typeof options.x !== 'undefined' && options.x != null && !isNaN(Number(options.x)) ? options.x : 1
	options.y = typeof options.y !== 'undefined' && options.y != null && !isNaN(Number(options.y)) ? options.y : 1
	options.w = options.w || '50%'
	options.h = options.h || '50%'
	options.objectName = options.objectName
		? encodeXmlEntities(options.objectName)
		: `Chart ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.chart).length}`

	// B: Options: misc
	if (!['bar', 'col'].includes(options.barDir || '')) options.barDir = 'col'

	// barGrouping: "21.2.3.17 ST_Grouping (Grouping)"
	// barGrouping must be handled before data label validation as it can affect valid label positioning
	if (options._type === CHART_TYPE.AREA) {
		if (!['stacked', 'standard', 'percentStacked'].includes(options.barGrouping || '')) options.barGrouping = 'standard'
	}
	if (options._type === CHART_TYPE.BAR) {
		if (!['clustered', 'stacked', 'percentStacked'].includes(options.barGrouping || '')) options.barGrouping = 'clustered'
	}
	if (options._type === CHART_TYPE.BAR3D) {
		if (!['clustered', 'stacked', 'standard', 'percentStacked'].includes(options.barGrouping || '')) options.barGrouping = 'standard'
	}
	if (options.barGrouping?.includes('tacked')) {
		if (!options.barGapWidthPct) options.barGapWidthPct = 50
	}
	// Clean up and validate data label positions
	// REFERENCE: https://docs.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/e2b1697c-7adc-463d-9081-3daef72f656f?redirectedfrom=MSDN
	if (options.dataLabelPosition) {
		if (options._type === CHART_TYPE.AREA || options._type === CHART_TYPE.BAR3D || options._type === CHART_TYPE.DOUGHNUT || options._type === CHART_TYPE.RADAR) { delete options.dataLabelPosition }
		if (options._type === CHART_TYPE.PIE) {
			if (!['bestFit', 'ctr', 'inEnd', 'outEnd'].includes(options.dataLabelPosition)) delete options.dataLabelPosition
		}
		if (options._type === CHART_TYPE.BUBBLE || options._type === CHART_TYPE.BUBBLE3D || options._type === CHART_TYPE.LINE || options._type === CHART_TYPE.SCATTER) {
			if (!['b', 'ctr', 'l', 'r', 't'].includes(options.dataLabelPosition)) delete options.dataLabelPosition
		}
		if (options._type === CHART_TYPE.BAR) {
			if (!['stacked', 'percentStacked'].includes(options.barGrouping || '')) {
				if (!['ctr', 'inBase', 'inEnd'].includes(options.dataLabelPosition)) delete options.dataLabelPosition
			}
			if (!['clustered'].includes(options.barGrouping || '')) {
				if (!['ctr', 'inBase', 'inEnd', 'outEnd'].includes(options.dataLabelPosition)) delete options.dataLabelPosition
			}
		}
	}
	options.dataLabelBkgrdColors = options.dataLabelBkgrdColors || !options.dataLabelBkgrdColors ? options.dataLabelBkgrdColors : false
	if (!['b', 'l', 'r', 't', 'tr'].includes(options.legendPos || '')) options.legendPos = 'r'

	// 3D bar: ST_Shape
	if (!['cone', 'coneToMax', 'box', 'cylinder', 'pyramid', 'pyramidToMax'].includes(options.bar3DShape || '')) options.bar3DShape = 'box'
	// lineDataSymbol: http://www.datypic.com/sc/ooxml/a-val-32.html
	// Spec has [plus,star,x] however neither PPT2013 nor PPT-Online support them
	if (!['circle', 'dash', 'diamond', 'dot', 'none', 'square', 'triangle'].includes(options.lineDataSymbol || '')) options.lineDataSymbol = 'circle'
	if (!['gap', 'span'].includes(options.displayBlanksAs || '')) options.displayBlanksAs = 'span'
	if (!['standard', 'marker', 'filled'].includes(options.radarStyle || '')) options.radarStyle = 'standard'
	options.lineDataSymbolSize = options.lineDataSymbolSize && !isNaN(options.lineDataSymbolSize) ? options.lineDataSymbolSize : 6
	options.lineDataSymbolLineSize = options.lineDataSymbolLineSize && !isNaN(options.lineDataSymbolLineSize) ? valToPts(options.lineDataSymbolLineSize) : valToPts(0.75)
	// `layout` allows the override of PPT defaults to maximize space
	if (options.layout) {
		['x', 'y', 'w', 'h'].forEach(key => {
			const val = options.layout[key]
			if (isNaN(Number(val)) || val < 0 || val > 1) {
				console.warn('Warning: chart.layout.' + key + ' can only be 0-1')
				delete options.layout[key] // remove invalid value so that default will be used
			}
		})
	}

	// Set gridline defaults
	options.catGridLine = options.catGridLine || (options._type === CHART_TYPE.SCATTER ? { color: 'D9D9D9', size: 1 } : { style: 'none' })
	options.valGridLine = options.valGridLine || (options._type === CHART_TYPE.SCATTER ? { color: 'D9D9D9', size: 1 } : {})
	options.serGridLine = options.serGridLine || (options._type === CHART_TYPE.SCATTER ? { color: 'D9D9D9', size: 1 } : { style: 'none' })
	correctGridLineOptions(options.catGridLine)
	correctGridLineOptions(options.valGridLine)
	correctGridLineOptions(options.serGridLine)
	correctShadowOptions(options.shadow)

	// C: Options: plotArea
	options.showDataTable = options.showDataTable || !options.showDataTable ? options.showDataTable : false
	options.showDataTableHorzBorder = options.showDataTableHorzBorder || !options.showDataTableHorzBorder ? options.showDataTableHorzBorder : true
	options.showDataTableVertBorder = options.showDataTableVertBorder || !options.showDataTableVertBorder ? options.showDataTableVertBorder : true
	options.showDataTableOutline = options.showDataTableOutline || !options.showDataTableOutline ? options.showDataTableOutline : true
	options.showDataTableKeys = options.showDataTableKeys || !options.showDataTableKeys ? options.showDataTableKeys : true
	options.showLabel = options.showLabel || !options.showLabel ? options.showLabel : false
	options.showLegend = options.showLegend || !options.showLegend ? options.showLegend : false
	options.showPercent = options.showPercent || !options.showPercent ? options.showPercent : true
	options.showTitle = options.showTitle || !options.showTitle ? options.showTitle : false
	options.showValue = options.showValue || !options.showValue ? options.showValue : false
	options.showLeaderLines = options.showLeaderLines || !options.showLeaderLines ? options.showLeaderLines : false
	options.catAxisLineShow = typeof options.catAxisLineShow !== 'undefined' ? options.catAxisLineShow : true
	options.valAxisLineShow = typeof options.valAxisLineShow !== 'undefined' ? options.valAxisLineShow : true
	options.serAxisLineShow = typeof options.serAxisLineShow !== 'undefined' ? options.serAxisLineShow : true

	options.v3DRotX = !isNaN(options.v3DRotX) && options.v3DRotX >= -90 && options.v3DRotX <= 90 ? options.v3DRotX : 30
	options.v3DRotY = !isNaN(options.v3DRotY) && options.v3DRotY >= 0 && options.v3DRotY <= 360 ? options.v3DRotY : 30
	options.v3DRAngAx = options.v3DRAngAx || !options.v3DRAngAx ? options.v3DRAngAx : true
	options.v3DPerspective = !isNaN(options.v3DPerspective) && options.v3DPerspective >= 0 && options.v3DPerspective <= 240 ? options.v3DPerspective : 30

	// D: Options: chart
	options.barGapWidthPct = !isNaN(options.barGapWidthPct) && options.barGapWidthPct >= 0 && options.barGapWidthPct <= 1000 ? options.barGapWidthPct : 150
	options.barGapDepthPct = !isNaN(options.barGapDepthPct) && options.barGapDepthPct >= 0 && options.barGapDepthPct <= 1000 ? options.barGapDepthPct : 150

	options.chartColors = Array.isArray(options.chartColors)
		? options.chartColors
		: options._type === CHART_TYPE.PIE || options._type === CHART_TYPE.DOUGHNUT
			? PIECHART_COLORS
			: BARCHART_COLORS
	options.chartColorsOpacity = options.chartColorsOpacity && !isNaN(options.chartColorsOpacity) ? options.chartColorsOpacity : null
	// DEPRECATED: v3.11.0 - use `plotArea.border` vvv
	options.border = options.border && typeof options.border === 'object' ? options.border : null
	if (options.border && (!options.border.pt || isNaN(options.border.pt))) options.border.pt = DEF_CHART_BORDER.pt
	if (options.border && (!options.border.color || typeof options.border.color !== 'string')) options.border.color = DEF_CHART_BORDER.color
	// DEPRECATED: (remove above in v4.0) ^^^
	options.plotArea = options.plotArea || {}
	options.plotArea.border = options.plotArea.border && typeof options.plotArea.border === 'object' ? options.plotArea.border : null
	if (options.plotArea.border && (!options.plotArea.border.pt || isNaN(options.plotArea.border.pt))) options.plotArea.border.pt = DEF_CHART_BORDER.pt
	if (options.plotArea.border && (!options.plotArea.border.color || typeof options.plotArea.border.color !== 'string')) { options.plotArea.border.color = DEF_CHART_BORDER.color }
	if (options.border) options.plotArea.border = options.border // @deprecated [[remove in v4.0]]
	options.plotArea.fill = options.plotArea.fill || { color: null, transparency: null }
	if (options.fill) options.plotArea.fill.color = options.fill // @deprecated [[remove in v4.0]]
	//
	options.chartArea = options.chartArea || {}
	options.chartArea.border = options.chartArea.border && typeof options.chartArea.border === 'object' ? options.chartArea.border : null
	if (options.chartArea.border) {
		options.chartArea.border = {
			color: options.chartArea.border.color || DEF_CHART_BORDER.color,
			pt: options.chartArea.border.pt || DEF_CHART_BORDER.pt,
		}
	}
	options.chartArea.roundedCorners = typeof options.chartArea.roundedCorners === 'boolean' ? options.chartArea.roundedCorners : true
	//
	options.dataBorder = options.dataBorder && typeof options.dataBorder === 'object' ? options.dataBorder : null
	if (options.dataBorder && (!options.dataBorder.pt || isNaN(options.dataBorder.pt))) options.dataBorder.pt = 0.75
	if (options.dataBorder && options.dataBorder.color) {
		const isHexColor = typeof options.dataBorder.color === 'string' && options.dataBorder.color.length === 6 && /^[0-9A-Fa-f]{6}$/.test(options.dataBorder.color)
		const isSchemeColor = Object.values(SCHEME_COLOR_NAMES).includes(options.dataBorder.color as SCHEME_COLOR_NAMES)
		if (!isHexColor && !isSchemeColor) {
			options.dataBorder.color = 'F9F9F9' // Fallback if neither hex nor scheme color
		}
	}
	//
	if (!options.dataLabelFormatCode && options._type === CHART_TYPE.SCATTER) options.dataLabelFormatCode = 'General'
	if (!options.dataLabelFormatCode && (options._type === CHART_TYPE.PIE || options._type === CHART_TYPE.DOUGHNUT)) { options.dataLabelFormatCode = options.showPercent ? '0%' : 'General' }
	options.dataLabelFormatCode = options.dataLabelFormatCode && typeof options.dataLabelFormatCode === 'string' ? options.dataLabelFormatCode : '#,##0'
	//
	// Set default format for Scatter chart labels to custom string if not defined
	if (!options.dataLabelFormatScatter && options._type === CHART_TYPE.SCATTER) options.dataLabelFormatScatter = 'custom'
	//
	options.lineSize = typeof options.lineSize === 'number' ? options.lineSize : 2
	options.valAxisMajorUnit = typeof options.valAxisMajorUnit === 'number' ? options.valAxisMajorUnit : null

	if (options._type === CHART_TYPE.AREA || options._type === CHART_TYPE.BAR || options._type === CHART_TYPE.BAR3D || options._type === CHART_TYPE.LINE) {
		options.catAxisMultiLevelLabels = !!options.catAxisMultiLevelLabels
	} else {
		delete options.catAxisMultiLevelLabels
	}

	// STEP 4: Set props
	resultObject._type = 'chart'
	resultObject.options = options
	resultObject.chartRid = getNewRelId(target)

	// STEP 5: Add this chart to this Slide Rels (rId/rels count spans all slides! Count all images to get next rId)
	target._relsChart.push({
		rId: getNewRelId(target),
		data: tmpData,
		opts: options,
		type: options._type,
		globalId: chartId,
		fileName: `chart${chartId}.xml`,
		Target: `/ppt/charts/chart${chartId}.xml`,
	})

	target._slideObjects.push(resultObject)
	return resultObject
}

/**
 * Adds an image object to a slide definition.
 * This method can be called with only two args (opt, target) - this is supposed to be the only way in future.
 * @param {ImageProps} `opt` - object containing `path`/`data`, `x`, `y`, etc.
 * @param {PresSlide} `target` - slide that the image should be added to (if not specified as the 2nd arg)
 * @note: Remote images (eg: "http://whatev.com/blah"/from web and/or remote server arent supported yet - we'd need to create an <img>, load it, then send to canvas
 * @see: https://stackoverflow.com/questions/164181/how-to-fetch-a-remote-image-to-display-in-a-canvas)
 */
export function addImageDefinition(target: PresSlide, opt: ImageProps): void {
	const newObject: ISlideObject = {
		_type: null,
		text: null,
		options: null,
		image: null,
		imageRid: null,
		hyperlink: null,
	}
	// FIRST: Set vars for this image (object param replaces positional args in 1.1.0)
	const intPosX = opt.x || 0
	const intPosY = opt.y || 0
	const intWidth = opt.w || 0
	const intHeight = opt.h || 0
	const sizing = opt.sizing || null
	const objHyperlink = opt.hyperlink || ''
	const strImageData = opt.data || ''
	const strImagePath = opt.path || ''
	let imageRelId = getNewRelId(target)
	const objectName = opt.morphId ? encodeXmlEntities(opt.morphId) : opt.objectName ? encodeXmlEntities(opt.objectName) : `Image ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.image).length}`

	// REALITY-CHECK:
	if (!strImagePath && !strImageData) {
		console.error('ERROR: addImage() requires either \'data\' or \'path\' parameter!')
		return null
	} else if (strImagePath && typeof strImagePath !== 'string') {
		console.error(`ERROR: addImage() 'path' should be a string, ex: {path:'/img/sample.png'} - you sent ${String(strImagePath)}`)
		return null
	} else if (strImageData && typeof strImageData !== 'string') {
		console.error(`ERROR: addImage() 'data' should be a string, ex: {data:'image/png;base64,NMP[...]'} - you sent ${String(strImageData)}`)
		return null
	} else if (strImageData && typeof strImageData === 'string' && !strImageData.toLowerCase().includes('base64,')) {
		console.error('ERROR: Image `data` value lacks a base64 header! Ex: \'image/png;base64,NMP[...]\')')
		return null
	}

	// STEP 1: Set extension
	// NOTE: Split to address URLs with params (eg: `path/brent.jpg?someParam=true`)
	let strImgExtn = (
		strImagePath
			.substring(strImagePath.lastIndexOf('/') + 1)
			.split('?')[0]
			.split('.')
			.pop()
			.split('#')[0] || 'png'
	).toLowerCase()

	// However, pre-encoded images can be whatever mime-type they want (and good for them!)
	if (strImageData && /image\/(\w+);/.exec(strImageData) && /image\/(\w+);/.exec(strImageData).length > 0) {
		strImgExtn = /image\/(\w+);/.exec(strImageData)[1]
	} else if (strImageData?.toLowerCase().includes('image/svg+xml')) {
		strImgExtn = 'svg'
	}

	// STEP 2: Set type/path
	newObject._type = SLIDE_OBJECT_TYPES.image
	newObject.image = strImagePath || 'preencoded.png'

	// STEP 3: Set image properties & options
	// FIXME: Measure actual image when no intWidth/intHeight params passed
	// ....: This is an async process: we need to make getSizeFromImage use callback, then set H/W...
	// if ( !intWidth || !intHeight ) { var imgObj = getSizeFromImage(strImagePath);
	newObject.options = {
		x: intPosX || 0,
		y: intPosY || 0,
		w: intWidth || 1,
		h: intHeight || 1,
		altText: opt.altText || '',
		rounding: typeof opt.rounding === 'boolean' ? opt.rounding : false,
		sizing,
		placeholder: opt.placeholder,
		rotate: opt.rotate || 0,
		flipV: opt.flipV || false,
		flipH: opt.flipH || false,
		transparency: opt.transparency || 0,
		objectName,
		shadow: correctShadowOptions(opt.shadow),
		animation: opt.animation,
	}

	// STEP 4: Add this image to this Slide Rels (rId/rels count spans all slides! Count all images to get next rId)
	if (strImgExtn === 'svg') {
		// SVG files consume *TWO* rId's: (a png version and the svg image)
		// <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
		// <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.svg"/>
		target._relsMedia.push({
			path: strImagePath || strImageData + 'png',
			type: 'image/png',
			extn: 'png',
			data: strImageData || '',
			rId: imageRelId,
			Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.png`,
			isSvgPng: true,
			svgSize: { w: getSmartParseNumber(newObject.options.w, 'X', target._presLayout), h: getSmartParseNumber(newObject.options.h, 'Y', target._presLayout) },
		})
		newObject.imageRid = imageRelId
		target._relsMedia.push({
			path: strImagePath || strImageData,
			type: 'image/svg+xml',
			extn: strImgExtn,
			data: strImageData || '',
			rId: imageRelId + 1,
			Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.${strImgExtn}`,
		})
		newObject.imageRid = imageRelId + 1
	} else {
		// PERF: Duplicate media should reuse existing `Target` value and not create an additional copy
		const dupeItem = target._relsMedia.filter(item => item.path && item.path === strImagePath && item.type === 'image/' + strImgExtn && !item.isDuplicate)[0]

		target._relsMedia.push({
			path: strImagePath || 'preencoded.' + strImgExtn,
			type: 'image/' + strImgExtn,
			extn: strImgExtn,
			data: strImageData || '',
			rId: imageRelId,
			isDuplicate: !!(dupeItem?.Target),
			Target: dupeItem?.Target ? dupeItem.Target : `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.${strImgExtn}`,
		})
		newObject.imageRid = imageRelId
	}

	// STEP 5: Hyperlink support
	if (typeof objHyperlink === 'object') {
		if (!objHyperlink.url && !objHyperlink.slide) throw new Error('ERROR: `hyperlink` option requires either: `url` or `slide`')
		else {
			imageRelId++

			target._rels.push({
				type: SLIDE_OBJECT_TYPES.hyperlink,
				data: objHyperlink.slide ? 'slide' : 'dummy',
				rId: imageRelId,
				Target: objHyperlink.url || objHyperlink.slide.toString(),
			})

			objHyperlink._rId = imageRelId
			newObject.hyperlink = objHyperlink
		}
	}

	// STEP 6: Add object to slide
	target._slideObjects.push(newObject)
}

/**
 * Adds a media object to a slide definition.
 * @param {PresSlide} `target` - slide object that the media will be added to
 * @param {MediaProps} `opt` - media options
 */
export function addMediaDefinition(target: PresSlide, opt: MediaProps): void {
	const intPosX = opt.x || 0
	const intPosY = opt.y || 0
	const intSizeX = opt.w || 2
	const intSizeY = opt.h || 2
	const strData = opt.data || ''
	const strLink = opt.link || ''
	const strPath = opt.path || ''
	const strType = opt.type || 'audio'
	let strExtn = ''
	const strCover = opt.cover || IMG_PLAYBTN
	const objectName = opt.objectName ? encodeXmlEntities(opt.objectName) : `Media ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.media).length}`
	const slideData: ISlideObject = { _type: SLIDE_OBJECT_TYPES.media }

	// STEP 1: REALITY-CHECK
	if (!strPath && !strData && strType !== 'online') {
		throw new Error('addMedia() error: either `data` or `path` are required!')
	} else if (strData && !strData.toLowerCase().includes('base64,')) {
		throw new Error('addMedia() error: `data` value lacks a base64 header! Ex: \'video/mpeg;base64,NMP[...]\')')
	} else if (strCover && !strCover.toLowerCase().includes('base64,')) {
		throw new Error('addMedia() error: `cover` value lacks a base64 header! Ex: \'data:image/png;base64,iV[...]\')')
	}
	// Online Video: requires `link`
	if (strType === 'online' && !strLink) {
		throw new Error('addMedia() error: online videos require `link` value')
	}

	// FIXME: 20190707
	// strType = strData ? strData.split(';')[0].split('/')[0] : strType
	strExtn = opt.extn || (strData ? strData.split(';')[0].split('/')[1] : strPath.split('.').pop()) || 'mp3'

	// STEP 2: Set type, media
	slideData.mtype = strType
	slideData.media = strPath || 'preencoded.mov'
	slideData.options = {}

	// STEP 3: Set media properties & options
	slideData.options.x = intPosX
	slideData.options.y = intPosY
	slideData.options.w = intSizeX
	slideData.options.h = intSizeY
	slideData.options.objectName = objectName

	// STEP 4: Add this media to this Slide Rels (rId/rels count spans all slides! Count all media to get next rId)
	/**
	 * NOTE:
	 * - rId starts at 2 (hence the intRels+1 below) as slideLayout.xml is rId=1!
	 *
	 * NOTE:
	 * - Audio/Video files consume *TWO* rId's:
	 * <Relationship Id="rId2" Target="../media/media1.mov" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video"/>
	 * <Relationship Id="rId3" Target="../media/media1.mov" Type="http://schemas.microsoft.com/office/2007/relationships/media"/>
	 */
	if (strType === 'online') {
		const relId1 = getNewRelId(target)
		// A: Add video
		target._relsMedia.push({
			path: strPath || 'preencoded' + strExtn,
			data: 'dummy',
			type: 'online',
			extn: strExtn,
			rId: relId1,
			Target: strLink,
		})
		slideData.mediaRid = relId1

		// B: Add cover (preview/overlay) image
		target._relsMedia.push({
			path: 'preencoded.png',
			data: strCover,
			type: 'image/png',
			extn: 'png',
			rId: getNewRelId(target),
			Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.png`,
		})
	} else {
		// PERF: Duplicate media should reuse existing `Target` value and not create an additional copy
		const dupeItem = target._relsMedia.filter(item => item.path && item.path === strPath && item.type === strType + '/' + strExtn && !item.isDuplicate)[0]

		// A: "relationships/video"
		const relId1 = getNewRelId(target)
		target._relsMedia.push({
			path: strPath || 'preencoded' + strExtn,
			type: strType + '/' + strExtn,
			extn: strExtn,
			data: strData || '',
			rId: relId1,
			isDuplicate: !!(dupeItem?.Target),
			Target: dupeItem?.Target ? dupeItem.Target : `../media/media-${target._slideNum}-${target._relsMedia.length + 1}.${strExtn}`,
		})
		slideData.mediaRid = relId1

		// B: "relationships/media"
		target._relsMedia.push({
			path: strPath || 'preencoded' + strExtn,
			type: strType + '/' + strExtn,
			extn: strExtn,
			data: strData || '',
			rId: getNewRelId(target),
			isDuplicate: !!(dupeItem?.Target),
			Target: dupeItem?.Target ? dupeItem.Target : `../media/media-${target._slideNum}-${target._relsMedia.length + 0}.${strExtn}`,
		})

		// C: Add cover (preview/overlay) image
		target._relsMedia.push({
			path: 'preencoded.png',
			type: 'image/png',
			extn: 'png',
			data: strCover,
			rId: getNewRelId(target),
			Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.png`,
		})
	}

	// LAST
	target._slideObjects.push(slideData)
}

/**
 * Adds Notes to a slide.
 * @param {PresSlide} `target` slide object
 * @param {string | NoteParagraph[]} `notes` plain string (single paragraph) or structured talking-points
 * @since 2.3.0
 */
export function addNotesDefinition(target: PresSlide, notes: string | NoteParagraph[]): void {
	if (typeof notes === 'string') {
		// String path is UNCHANGED — single-paragraph notes, byte-identical to prior behavior (supports multi-call concat).
		target._slideObjects.push({
			_type: SLIDE_OBJECT_TYPES.notes,
			text: [{ text: notes }],
		})
	} else {
		// Structured path: store one notes object whose `text` carries per-paragraph `options`.
		// The presence of an `options` key on a `text` entry is the structured discriminator (see buildNotesBodyParagraphs).
		target._slideObjects.push({
			_type: SLIDE_OBJECT_TYPES.notes,
			text: (notes || []).map(para => ({
				text: para.text,
				options: { bullet: para.bullet, indentLevel: para.indentLevel },
			})),
		})
	}
}

/**
 * Adds a review comment to a slide.
 * Requires non-empty `author` AND `text` (warns + skips otherwise — clamp, don't crash).
 * Stores the comment on `target._comments`; the write path emits the comment parts/rels.
 * @param {PresSlide} target - slide object the comment is added to
 * @param {CommentProps} props - comment author, text, and optional anchor/date
 */
export function addCommentDefinition(target: PresSlide, props: CommentProps): void {
	if (!props || typeof props.author !== 'string' || props.author.length === 0) {
		console.warn('addComment requires a non-empty `author`')
		return
	}
	if (typeof props.text !== 'string' || props.text.length === 0) {
		console.warn('addComment requires non-empty `text`')
		return
	}
	if (!Array.isArray(target._comments)) target._comments = []
	target._comments.push({
		author: props.author,
		text: props.text,
		x: typeof props.x === 'number' ? props.x : undefined,
		y: typeof props.y === 'number' ? props.y : undefined,
		date: props.date,
	})
}

/**
 * Adds an ink (stylus/handwriting) annotation to a slide.
 * Allocates a slide relationship id via `getNewRelId(target)` and stashes it on the stored
 * ink item alongside the part filename so the `<p:contentPart r:id>`, the slide `<Relationship>`,
 * and the written `ppt/ink/...xml` part all reference the SAME id/target (cross-entity invariant).
 * Clamp-don't-crash: strokes with no valid finite `[x, y]` points are dropped, and a call with no
 * surviving strokes is a no-op (no part/rel/contentPart/Override) — preserving the default-off invariant.
 * @param {PresSlide} target - slide object the ink is added to
 * @param {InkProps} props - ink strokes (inches) + optional color/width
 */
export function addInkDefinition(target: PresSlide, props: InkProps): void {
	// Sanitize: keep only strokes that have >=1 finite [x, y] point.
	const cleanStrokes: number[][][] = (props?.strokes || [])
		.filter(stroke => Array.isArray(stroke))
		.map(stroke => stroke.filter(pt => Array.isArray(pt) && pt.length >= 2 && isFinite(pt[0]) && isFinite(pt[1])))
		.filter(stroke => stroke.length > 0)
	if (cleanStrokes.length === 0) {
		console.warn('addInk requires at least one stroke with a valid [x, y] point')
		return
	}

	if (!Array.isArray(target._ink)) target._ink = []
	const rId = getNewRelId(target)
	// Per-call part filename, globally unique across the package (slideNum + per-slide index),
	// mirroring the media `image-{slideNum}-{i}` scheme so multiple inks never collide.
	const target_file = `ink-${target._slideNum}-${target._ink.length + 1}.xml`

	target._rels.push({
		type: SLIDE_OBJECT_TYPES.ink,
		data: 'ink',
		Target: `../ink/${target_file}`,
		rId,
	})
	target._ink.push({
		strokes: cleanStrokes,
		color: props.color,
		width: props.width,
		_rId: rId,
		_target: target_file,
	})
}

/**
 * Adds a SmartArt/diagram object to a slide definition.
 * Allocates FOUR diagram-family slide relationships (data/layout/quickStyle/colors) — referenced by
 * the `<dgm:relIds>` on the emitted `<p:graphicFrame>` — and stashes the four rIds + a globally-unique
 * diagram index on a `_diagram` slide-object so the graphicFrame, the slide rels, and the written
 * `/ppt/diagrams/*N.xml` parts all agree (cross-entity id invariant). The drawing cache part is a
 * sub-rel of the data part (written in pptxgen.ts). Empty/invalid `items` or an unknown `layout`
 * is a no-op (default-off preserved).
 * @param {PresSlide} target - slide the diagram is added to
 * @param {SmartArtProps} props - layout + items (+ optional position/color)
 */
export function addSmartArtDefinition (target: PresSlide, props: SmartArtProps): void {
	const layout = props?.layout
	const items = (props?.items || []).filter(it => typeof it === 'string' && it.length > 0)
	if ((layout !== 'list' && layout !== 'process') || items.length === 0) {
		console.warn("addSmartArt requires layout 'list'|'process' and at least one non-empty item")
		return
	}

	if (!Array.isArray(target._diagram)) target._diagram = []
	// Deck-deterministic, globally-unique filename index (slideNum + per-slide index), mirroring the
	// ink `ink-{slideNum}-{i}` scheme so diagrams never collide and filenames are reproducible.
	const diagramId = `${target._slideNum}-${target._diagram.length + 1}`

	// Allocate FOUR distinct slide-rel rIds in sequence. Push each rel as it is allocated so the next
	// getNewRelId() call (which counts _rels.length) increments — exactly the ink/chart pattern.
	const dataRid = getNewRelId(target)
	target._rels.push({ type: SLIDE_OBJECT_TYPES.diagram, data: 'diagramData', Target: `../diagrams/data${diagramId}.xml`, rId: dataRid })
	const layoutRid = getNewRelId(target)
	target._rels.push({ type: SLIDE_OBJECT_TYPES.diagram, data: 'diagramLayout', Target: `../diagrams/layout${diagramId}.xml`, rId: layoutRid })
	const quickStyleRid = getNewRelId(target)
	target._rels.push({ type: SLIDE_OBJECT_TYPES.diagram, data: 'diagramQuickStyle', Target: `../diagrams/quickStyle${diagramId}.xml`, rId: quickStyleRid })
	const colorsRid = getNewRelId(target)
	target._rels.push({ type: SLIDE_OBJECT_TYPES.diagram, data: 'diagramColors', Target: `../diagrams/colors${diagramId}.xml`, rId: colorsRid })
	// 5th rel = the drawing cache (MS extension). The Open XML SDK requires this part to be related
	// from the SLIDE (not the data part); the data model's <dsp:dataModelExt relId> references THIS rId.
	const drawingRid = getNewRelId(target)
	target._rels.push({ type: SLIDE_OBJECT_TYPES.diagram, data: 'diagramDrawing', Target: `../diagrams/drawing${diagramId}.xml`, rId: drawingRid })

	const diagram = {
		layout,
		items,
		color: props.color,
		w: typeof props.w === 'number' && isFinite(props.w) ? props.w : 8,
		h: typeof props.h === 'number' && isFinite(props.h) ? props.h : 3,
		_id: diagramId,
		_dataRid: dataRid,
		_layoutRid: layoutRid,
		_quickStyleRid: quickStyleRid,
		_colorsRid: colorsRid,
		_drawingRid: drawingRid,
	}
	target._diagram.push(diagram)

	// Push a top-level slide object so the existing slideObjectToXml switch emits the graphicFrame at
	// the natural shape position (mirrors how charts are stored). Carries position + the stashed rIds.
	const objectName = props.objectName
		? encodeXmlEntities(props.objectName)
		: `Diagram ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.diagram).length + 1}`
	target._slideObjects.push({
		_type: SLIDE_OBJECT_TYPES.diagram,
		options: {
			x: typeof props.x !== 'undefined' && props.x !== null ? props.x : 1,
			y: typeof props.y !== 'undefined' && props.y !== null ? props.y : 1,
			w: typeof props.w !== 'undefined' && props.w !== null ? props.w : 8,
			h: typeof props.h !== 'undefined' && props.h !== null ? props.h : 3,
			objectName,
		},
		_diagram: diagram,
	} as unknown as ISlideObject)
}

/**
 * Map of common friendly shape names users pass as bare strings to their
 * valid OOXML preset values. PowerPoint can't parse the friendly spellings
 * and removes the shape during repair .
 */
const SHAPE_NAME_ALIASES: { [key: string]: SHAPE_NAME } = {
	oval: 'ellipse',
	rectangle: 'rect',
	roundedRectangle: 'roundRect',
	roundedrectangle: 'roundRect',
}

/**
 * Adds a shape object to a slide definition.
 * @param {PresSlide} target slide object that the shape should be added to
 * @param {SHAPE_NAME} shapeName shape name
 * @param {ShapeProps} opts shape options
 */
export function addShapeDefinition(target: PresSlide, shapeName: SHAPE_NAME, opts: ShapeProps): void {
	const options = typeof opts === 'object' ? opts : {}
	options.line = options.line || { type: 'none' }
	options.shadow = correctShadowOptions(options.shadow)
	// Normalize friendly shape names (e.g. "oval" -> "ellipse") to their valid
	// OOXML preset spellings before storing on the slide object.
	const resolvedShapeName: SHAPE_NAME = (typeof shapeName === 'string' && SHAPE_NAME_ALIASES[shapeName])
		? SHAPE_NAME_ALIASES[shapeName]
		: shapeName
	const newObject: ISlideObject = {
		_type: SLIDE_OBJECT_TYPES.text,
		shape: resolvedShapeName || SHAPE_TYPE.RECTANGLE,
		options,
		text: null,
	}

	// Reality check
	if (!shapeName) throw new Error('Missing/Invalid shape parameter! Example: `addShape(pptxgen.shapes.LINE, {x:1, y:1, w:1, h:1});`')

	// 1: ShapeLineProps defaults
	const newLineOpts: ShapeLineProps = {
		type: options.line.type || 'solid',
		color: options.line.color || DEF_SHAPE_LINE_COLOR,
		transparency: options.line.transparency || 0,
		width: options.line.width || 1,
		dashType: options.line.dashType || 'solid',
		beginArrowType: options.line.beginArrowType || null,
		endArrowType: options.line.endArrowType || null,
	}
	if (typeof options.line === 'object' && options.line.type !== 'none') options.line = newLineOpts

	// 2: Set options defaults
	options.x = options.x || (options.x === 0 ? 0 : 1)
	options.y = options.y || (options.y === 0 ? 0 : 1)
	options.w = options.w || (options.w === 0 ? 0 : 1)
	options.h = options.h || (options.h === 0 ? 0 : 1)
	options.objectName = options.morphId
		? encodeXmlEntities(options.morphId)
		: options.objectName
			? encodeXmlEntities(options.objectName)
			: `Shape ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.text).length}`

	// 3: Handle line (lots of deprecated opts)
	if (typeof options.line === 'string') {
		const tmpOpts = newLineOpts
		tmpOpts.color = String(options.line) // @deprecated `options.line` string (was line color)
		options.line = tmpOpts
	}
	if (typeof options.lineSize === 'number') options.line.width = options.lineSize // @deprecated (part of `ShapeLineProps` now)
	if (typeof options.lineDash === 'string') options.line.dashType = options.lineDash // @deprecated (part of `ShapeLineProps` now)
	if (typeof options.lineHead === 'string') options.line.beginArrowType = options.lineHead // @deprecated (part of `ShapeLineProps` now)
	if (typeof options.lineTail === 'string') options.line.endArrowType = options.lineTail // @deprecated (part of `ShapeLineProps` now)

	// 3b: Picture/blip fill — register a media relationship so the shape can be filled with an image.
	// NOTE: This is NOT the gradient/pattern precedent: an image fill needs a registered media part
	// (+ `_rels` entry + `[Content_Types].xml` Default). We reuse the `addImageDefinition` rel logic
	// (derive extn → dedupe by path → push to `_relsMedia`) and stash the resolved rId on
	// `options.fill._rId` for the inline `<a:blipFill>` emit (gen-xml.ts). Done BEFORE
	// `createHyperlinkRels` so any hyperlink rels allocate after the fill rel (deterministic rId order).
	if (typeof options.fill === 'object' && (options.fill as ImageFillProps).type === 'image') {
		const imgFill = options.fill as ImageFillProps
		const strImagePath = imgFill.path || ''
		const strImageData = imgFill.data || ''
		if (!strImagePath && !strImageData) {
			// Guard-don't-crash (ground rule 4): missing both path+data → warn + drop the fill so the
			// shape emits `<a:noFill/>`; do NOT register a dangling media rel.
			console.warn('Warning: shape image fill requires either `path` or `data` - falling back to no fill')
			delete options.fill
		} else {
			// Derive extension (mirrors addImageDefinition): path-based, then mime-from-data override.
			let strImgExtn = (
				strImagePath
					.substring(strImagePath.lastIndexOf('/') + 1)
					.split('?')[0]
					.split('.')
					.pop()
					.split('#')[0] || 'png'
			).toLowerCase()
			if (strImageData && /image\/(\w+);/.exec(strImageData) && /image\/(\w+);/.exec(strImageData).length > 0) {
				strImgExtn = /image\/(\w+);/.exec(strImageData)[1]
			} else if (strImageData?.toLowerCase().includes('image/svg+xml')) {
				strImgExtn = 'svg'
			}

			if (strImgExtn === 'svg') {
				// SVG-as-shape-fill (dual-rId + `svgBlip` extLst) is out of scope for this slice → warn + noFill.
				console.warn('Warning: SVG image fill on shapes is not supported - falling back to no fill')
				delete options.fill
			} else {
				const imageRelId = getNewRelId(target)
				// PERF: reuse an existing media part for the same path (dedupe) — same filter as addImage.
				const dupeItem = target._relsMedia.filter(item => item.path && item.path === strImagePath && item.type === 'image/' + strImgExtn && !item.isDuplicate)[0]
				target._relsMedia.push({
					path: strImagePath || 'preencoded.' + strImgExtn,
					type: 'image/' + strImgExtn,
					extn: strImgExtn,
					data: strImageData || '',
					rId: imageRelId,
					isDuplicate: !!(dupeItem?.Target),
					Target: dupeItem?.Target ? dupeItem.Target : `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.${strImgExtn}`,
				})
				imgFill._rId = imageRelId
			}
		}
	}

	// 4: Create hyperlink rels
	createHyperlinkRels(target, newObject)

	// LAST: Add object to slide
	target._slideObjects.push(newObject)
}

/**
 * Feature 7: Adds a rounded-rectangle callout/badge to a slide definition.
 * Thin sugar over `addTextDefinition` with `shape:'roundRect'`, centred text, and a
 * corner-radius `adj` value computed from `cornerRadius` (inches) per:
 *   `adj = Math.round((cornerRadius / (h / 2)) * 50000)`.
 * @param {PresSlide} target slide object that the callout should be added to
 * @param {CalloutProps} opts callout options
 */
export function addCalloutDefinition(target: PresSlide, opts: CalloutProps, palette?: ThemePalette): void {
	const options = typeof opts === 'object' ? opts : ({} as CalloutProps)
	const h = options.h !== undefined ? Number(options.h) : 0.4
	const w = options.w !== undefined ? Number(options.w) : 1.5
	const cornerRadius = options.cornerRadius !== undefined ? options.cornerRadius : 0.1
	const fill = options.fill !== undefined ? options.fill : '6366F1'
	// Body text may be a string (single run) or a TextProps[] (multi-run). Normalise once.
	const bodyText: TextProps[] = typeof options.text === 'string' ? [{ text: options.text || '', options: null }] : (options.text as TextProps[])

	// v2 group path is entered ONLY when an accent bar or an attribution line is requested.
	// Otherwise the v1 single-roundRect path runs unchanged (byte-identical for v1 callers).
	const isV2 = !!(options.accentBar || options.attribution)

	if (!isV2) {
		// ── v1 path (structurally UNCHANGED) — optional fontFace/fontItalic threaded in (undefined → identical) ──
		// Map inches -> OOXML `adj` (percentage of half-shortest-side × 1000). Guard divide-by-zero.
		const calloutAdj = h > 0 ? Math.round((cornerRadius / (h / 2)) * 50000) : 0
		const textOpts: TextPropsOptions = {
			shape: SHAPE_TYPE.ROUNDED_RECTANGLE,
			x: options.x !== undefined ? options.x : 1,
			y: options.y !== undefined ? options.y : 1,
			w,
			h,
			fill: typeof fill === 'string' ? { color: fill } : fill,
			color: options.fontColor !== undefined ? options.fontColor : 'FFFFFF',
			fontSize: options.fontSize !== undefined ? options.fontSize : 12,
			bold: options.fontBold !== undefined ? options.fontBold : true,
			align: options.align || 'center',
			valign: options.valign || 'middle',
			_calloutAdj: calloutAdj,
		}
		if (options.fontFace !== undefined) textOpts.fontFace = options.fontFace
		if (options.fontItalic !== undefined) textOpts.italic = options.fontItalic
		if (options.objectName) textOpts.objectName = options.objectName
		if (options.morphId) textOpts.morphId = options.morphId
		addTextDefinition(target, bodyText, textOpts, false)
		return
	}

	// ── v2 group path — blockquote/callout motif (group + bg roundRect + accent bar + body + attribution) ──
	const x = options.x !== undefined ? Number(options.x) : 1
	const y = options.y !== undefined ? Number(options.y) : 1
	const pad = options.padding
	const padL = typeof pad === 'number' ? pad : (pad && pad.l !== undefined ? pad.l : 0.15)
	const padR = typeof pad === 'number' ? pad : (pad && pad.r !== undefined ? pad.r : 0.15)
	const padT = typeof pad === 'number' ? pad : (pad && pad.t !== undefined ? pad.t : 0.1)
	const padB = typeof pad === 'number' ? pad : (pad && pad.b !== undefined ? pad.b : 0.1)
	const align = options.align || 'left' // v2 motif is left-aligned (v1 stays 'center')

	const group = addGroupDefinition(target, { x, y, w, h, objectName: options.objectName })

	// 1) Background roundRect
	group.addShape(SHAPE_TYPE.ROUNDED_RECTANGLE, {
		x: 0, y: 0, w, h,
		fill: typeof fill === 'string' ? { color: fill } : fill,
		rectRadius: cornerRadius,
	})

	// 2) Optional left accent bar (SLICE-4 pattern: inset vertically by cornerRadius, drawn behind text)
	let barW = 0
	if (options.accentBar) {
		barW = options.accentBar.width !== undefined ? Number(options.accentBar.width) : 0.03
		const barColor = options.accentBar.color !== undefined ? options.accentBar.color : (palette?.accents?.[0] ?? '6366F1')
		group.addShape(SHAPE_TYPE.RECTANGLE, {
			x: 0, y: cornerRadius, w: barW, h: Math.max(0, h - 2 * cornerRadius),
			fill: typeof barColor === 'string' ? { color: barColor } : barColor,
			line: { type: 'none' },
		})
	}

	// 3) Body text box — inset by accent-bar width + left padding (group-relative coords)
	const leftInset = barW + padL
	const bodyX = leftInset
	const bodyW = Math.max(0.1, w - leftInset - padR)
	const attrSize = options.attributionFont && options.attributionFont.size !== undefined ? options.attributionFont.size : 9
	const attrH = options.attribution ? Math.max(0.2, attrSize / 72 + 0.08) : 0
	const bodyY = padT
	const bodyH = Math.max(0.1, h - padT - padB - attrH)
	group.addText(bodyText, {
		x: bodyX, y: bodyY, w: bodyW, h: bodyH,
		color: options.fontColor !== undefined ? options.fontColor : 'FFFFFF',
		fontSize: options.fontSize !== undefined ? options.fontSize : 12,
		bold: options.fontBold !== undefined ? options.fontBold : false,
		italic: options.fontItalic,
		fontFace: options.fontFace,
		align,
		valign: options.valign || 'top',
	})

	// 4) Optional attribution line below the body (smaller, muted)
	if (options.attribution) {
		group.addText(options.attribution, {
			x: bodyX, y: Math.max(0, h - padB - attrH), w: bodyW, h: attrH,
			color: options.attributionFont && options.attributionFont.color !== undefined ? options.attributionFont.color : inkForFill(typeof fill === 'string' ? fill : 'FFFFFF'),
			fontSize: attrSize,
			italic: options.attributionFont ? options.attributionFont.italic : undefined,
			align,
			valign: 'top',
		})
	}
}

/**
 * Adds a structured "card" to a slide definition (docs/features/feature-card-helper.md).
 * Builds a single shape group (`<p:grpSp>`) containing a rounded-rect background and,
 * as applicable, an icon container + icon (SVG path or emoji/text), a title, a description,
 * and a top-right badge — all positioned with group-relative coordinates. When `animation`
 * is supplied it is attached to the group object so the whole card animates as one.
 * @param {PresSlide} target slide the card should be added to
 * @param {CardProps} opts card options
 */
export function addCardDefinition(target: PresSlide, opts: CardProps, palette?: ThemePalette): void {
	const options = typeof opts === 'object' ? opts : ({} as CardProps)
	const x = options.x !== undefined ? Number(options.x) : 1
	const y = options.y !== undefined ? Number(options.y) : 1
	const w = options.w !== undefined ? Number(options.w) : 3
	const h = options.h !== undefined ? Number(options.h) : 2
	const padding = 0.2
	const cornerRadius = options.cornerRadius !== undefined ? options.cornerRadius : 0.12
	const fill = options.fill !== undefined ? options.fill : '1E293B'
	const align = options.align === 'left' ? 'left' : 'center'
	const iconPosition = options.iconPosition === 'left' ? 'left' : 'top'
	const iconSize = options.iconSize !== undefined ? Number(options.iconSize) : 0.4
	const hasIcon = options.icon !== undefined && options.icon !== null
	const titleFont = options.titleFont || {}
	const descFont = options.descFont || {}
	const textAlign = align === 'center' ? 'center' : 'left'

	// Create the group container; children below use coords relative to the group origin (0,0..w,h)
	const group = addGroupDefinition(target, { x, y, w, h, objectName: options.objectName })
	// The group is the just-pushed top-level slide object — grab it so card-level animation can attach
	const groupObj = target._slideObjects[target._slideObjects.length - 1]
	if (options.animation && groupObj && groupObj.options) groupObj.options.animation = options.animation

	// 1) Background roundRect (fill + optional border/shadow/glow). `rectRadius` maps inches -> adj.
	const bgOpts: ShapeProps = {
		x: 0, y: 0, w, h,
		fill: typeof fill === 'string' ? { color: fill } : fill,
		rectRadius: cornerRadius,
	}
	if (options.border) bgOpts.line = { color: options.border.color || '334155', width: options.border.width || 1 }
	if (options.shadow) bgOpts.shadow = { type: 'outer', ...options.shadow }
	if (options.glow) bgOpts.glow = options.glow
	group.addShape(SHAPE_TYPE.ROUNDED_RECTANGLE, bgOpts)

	// 1a) Optional left accent bar (drawn behind content). Inset vertically by cornerRadius so the
	//     square bar corners stay within the card's rounded outline.
	if (options.accentBar) {
		const barW = options.accentBar.width !== undefined ? Number(options.accentBar.width) : 0.03
		const barColor = options.accentBar.color !== undefined ? options.accentBar.color : (palette?.accents?.[0] ?? '6366F1')
		const barH = Math.max(0, h - 2 * cornerRadius)
		group.addShape(SHAPE_TYPE.RECTANGLE, {
			x: 0, y: cornerRadius, w: barW, h: barH,
			fill: typeof barColor === 'string' ? { color: barColor } : barColor,
			line: { type: 'none' },
		})
	}

	// 2) Layout anchors for icon / title / description (group-relative inches)
	let iconX = (w - iconSize) / 2
	let iconY = padding
	let titleX = padding
	let titleY = hasIcon ? padding + iconSize + 0.15 : padding
	let titleW = w - 2 * padding
	const titleH = 0.4
	if (iconPosition === 'left' && hasIcon) {
		iconX = padding
		iconY = padding
		titleX = padding + iconSize + 0.2
		titleY = padding
		titleW = w - titleX - padding
	}
	const descX = titleX
	const descY = titleY + titleH + 0.05
	const descW = titleW
	const descH = Math.max(0.2, h - descY - padding)

	// 3) Icon container + glyph
	if (hasIcon) {
		// Bare-icon mode: `iconFill: 'none' | false` suppresses the container tile
		const tileless = options.iconFill === 'none' || options.iconFill === false
		const glyphColor = options.iconColor || titleFont.color || inkForFill(typeof fill === 'string' ? fill : '1E293B')
		if (!tileless) {
			const iconFill = options.iconFill !== undefined ? options.iconFill : '6366F1'
			group.addShape(SHAPE_TYPE.ROUNDED_RECTANGLE, {
				x: iconX, y: iconY, w: iconSize, h: iconSize,
				fill: { color: iconFill as string }, rectRadius: cornerRadius / 2, line: { type: 'none' },
			})
		}
		if (typeof options.icon === 'string') {
			// Emoji / text glyph centred in the container
			group.addText(options.icon, {
				x: iconX, y: iconY, w: iconSize, h: iconSize,
				align: 'center', valign: 'middle', fontSize: Math.round(iconSize * 36), color: glyphColor,
			})
		} else if (options.icon && typeof options.icon === 'object' && 'char' in options.icon && options.icon.char && options.icon.fontFace) {
			// Font-icon glyph (e.g. Font Awesome) — requires `fontFace` to render correctly
			group.addText(options.icon.char, {
				x: iconX, y: iconY, w: iconSize, h: iconSize,
				align: 'center', valign: 'middle', fontFace: options.icon.fontFace,
				fontSize: Math.round(iconSize * 36), color: options.icon.color || glyphColor,
			})
		} else if (options.icon && typeof options.icon === 'object' && 'svgPath' in options.icon && options.icon.svgPath) {
			// SVG path glyph, inset within the container; emits <a:custGeom>
			const inset = iconSize * 0.22
			group.addShape('rect', {
				x: iconX + inset, y: iconY + inset, w: iconSize - 2 * inset, h: iconSize - 2 * inset,
				svgPath: options.icon.svgPath, fill: { color: glyphColor }, line: { type: 'none' },
			})
		} else if (options.icon && typeof options.icon === 'object' && 'parts' in options.icon && Array.isArray(options.icon.parts)) {
			// Multi-colour SVG: render each parseSvg() part as its own <a:custGeom> child,
			// keeping its own resolved fill/gradient/stroke (logos keep their real colours;
			// `iconColor` intentionally does NOT override per-part colour). Empty/non-array
			// `parts` → loop runs 0× (no child, no throw).
			const inset = iconSize * 0.22
			for (const part of options.icon.parts) {
				if (!part || !part.d || !part.viewBox) continue
				const partOpts: ShapeProps = {
					x: iconX + inset, y: iconY + inset, w: iconSize - 2 * inset, h: iconSize - 2 * inset,
					svgPath: { d: part.d, viewBox: part.viewBox },
				}
				if (part.mode === 'stroke') {
					partOpts.fill = { type: 'none' }
					partOpts.line = { color: part.stroke || glyphColor, width: Math.max(0.5, part.strokeWidth || 1) }
				} else {
					partOpts.fill = typeof part.fill === 'string' ? { color: part.fill } : part.fill
					partOpts.line = { type: 'none' }
				}
				group.addShape('rect', partOpts)
			}
		}
	}

	// 4) Title
	group.addText(options.title || '', {
		x: titleX, y: titleY, w: titleW, h: titleH,
		fontFace: titleFont.face, fontSize: titleFont.size !== undefined ? titleFont.size : 13,
		bold: titleFont.bold !== undefined ? titleFont.bold : true,
		color: titleFont.color || inkForFill(typeof fill === 'string' ? fill : '1E293B'), align: textAlign, valign: 'top',
	})

	// 5) Description (shrink-to-fit so overflow stays inside the card)
	if (options.description) {
		group.addText(options.description, {
			x: descX, y: descY, w: descW, h: descH,
			fontFace: descFont.face, fontSize: descFont.size !== undefined ? descFont.size : 10,
			bold: descFont.bold !== undefined ? descFont.bold : false,
			color: descFont.color || inkForFill(typeof fill === 'string' ? fill : '1E293B'), align: textAlign, valign: 'top', fit: 'shrink',
		})
	}

	// 6) Badge (top-right). Either a count bubble (`{ type:'count', value }`) or a text pill.
	const badge = options.badge
	if (badge && 'type' in badge && badge.type === 'count') {
		const label = Number.isFinite(badge.value) ? String(badge.value) : '0'
		const dia = 0.28
		const bx = w - dia - padding
		const by = badge.position === 'inline-right' ? Math.max(0, (h - dia) / 2) : padding
		group.addShape(SHAPE_TYPE.OVAL, {
			x: bx, y: by, w: dia, h: dia,
			fill: { color: badge.fill || '6366F1' }, line: { type: 'none' },
		})
		group.addText(label, {
			x: bx, y: by, w: dia, h: dia,
			align: 'center', valign: 'middle', fontSize: 8, bold: true, color: badge.color || 'FFFFFF',
		})
	} else if (badge && !('type' in badge) && badge.text) {
		const badgeH = 0.28
		const badgeW = Math.max(0.5, badge.text.length * 0.11 + 0.2)
		group.addShape(SHAPE_TYPE.ROUNDED_RECTANGLE, {
			x: w - badgeW - padding, y: padding, w: badgeW, h: badgeH,
			fill: { color: badge.fill || '10B981' }, rectRadius: badgeH / 2, line: { type: 'none' },
		})
		group.addText(badge.text, {
			x: w - badgeW - padding, y: padding, w: badgeW, h: badgeH,
			align: 'center', valign: 'middle', fontSize: 8, bold: true, color: badge.color || 'FFFFFF',
		})
	}
}

/**
 * Avatar/initials helper (docs/features/feature-avatar-badge.md). Draws a filled `ellipse`
 * (diameter `size`) then centred initials — a pure composition of existing primitives,
 * no new OOXML. Works against a slide OR a group's child target (same intake fns).
 * @param {PresSlide} target slide (or group child-target proxy) the avatar should be added to
 * @param {AvatarProps} opts avatar options
 */
export function addAvatarDefinition(target: PresSlide, opts: AvatarProps): void {
	const options = typeof opts === 'object' ? opts : ({} as AvatarProps)
	const size = options.size !== undefined && Number(options.size) > 0 ? Number(options.size) : 0.4
	const x = options.x !== undefined ? Number(options.x) : 1
	const y = options.y !== undefined ? Number(options.y) : 1
	const fill = options.fill !== undefined ? options.fill : '4B3F72'
	const color = options.color !== undefined ? options.color : 'FFFFFF'
	const fontSize = options.fontSize !== undefined ? options.fontSize : Math.max(6, Math.round(size * 72 * 0.4))
	const initials = options.initials !== undefined ? String(options.initials) : ''

	// 1) Disc (ellipse). Animation (if any) rides on the disc so the chip animates as a unit.
	const shapeOpts: ShapeProps = {
		x, y, w: size, h: size,
		fill: typeof fill === 'string' ? { color: fill } : fill,
		line: { type: 'none' },
	}
	if (options.animation) shapeOpts.animation = options.animation
	if (options.objectName) shapeOpts.objectName = options.objectName
	if (options.morphId) shapeOpts.morphId = options.morphId
	addShapeDefinition(target, SHAPE_TYPE.OVAL, shapeOpts)

	// 2) Centred initials
	const textOpts: TextPropsOptions = {
		x, y, w: size, h: size,
		align: 'center', valign: 'middle',
		color, fontSize, bold: true,
	}
	if (options.fontFace !== undefined) textOpts.fontFace = options.fontFace
	addTextDefinition(target, [{ text: initials, options: null }], textOpts, false)
}

/**
 * Badge/pill helper (docs/features/feature-avatar-badge.md). Draws a `roundRect` with a full corner
 * radius (pill) or an `ellipse` (count bubble) sized to the text, then a centred label.
 * Pure composition of existing primitives, no new OOXML. Clamps degenerate sizes (never throws).
 * @param {PresSlide} target slide (or group child-target proxy) the badge should be added to
 * @param {BadgeProps} opts badge options
 */
export function addBadgeDefinition(target: PresSlide, opts: BadgeProps): void {
	const options = typeof opts === 'object' ? opts : ({} as BadgeProps)
	const text = options.text !== undefined ? String(options.text) : ''
	const shape = options.shape === 'circle' ? 'circle' : 'pill'
	const x = options.x !== undefined ? Number(options.x) : 1
	const y = options.y !== undefined ? Number(options.y) : 1
	const h = options.h !== undefined && Number(options.h) > 0 ? Number(options.h) : 0.25
	const fill = options.fill !== undefined ? options.fill : '6366F1'
	const color = options.color !== undefined ? options.color : 'FFFFFF'
	const fontSize = options.fontSize !== undefined ? options.fontSize : 8
	const bold = options.bold !== undefined ? options.bold : true

	// Width: explicit `w` wins; else size to the text. Circles are square (w = h = diameter).
	let w: number
	if (shape === 'circle') {
		// Count bubble: a square sized to fit the (short) label, never smaller than `h`.
		w = options.w !== undefined && Number(options.w) > 0 ? Number(options.w) : Math.max(h, measureTextWidth(text, { fontSize }) + 0.1)
	} else {
		w = options.w !== undefined && Number(options.w) > 0 ? Number(options.w) : Math.max(h, measureTextWidth(text, { fontSize }) + 0.2)
	}
	// Circles must be square so the ellipse is a true circle (use the larger of w/h).
	const dim = shape === 'circle' ? Math.max(w, h) : 0

	const fillProps = typeof fill === 'string' ? { color: fill } : fill
	const shapeOpts: ShapeProps = shape === 'circle'
		? { x, y, w: dim, h: dim, fill: fillProps, line: { type: 'none' } }
		: { x, y, w, h, fill: fillProps, line: { type: 'none' }, rectRadius: h / 2 }
	if (options.animation) shapeOpts.animation = options.animation
	if (options.objectName) shapeOpts.objectName = options.objectName
	if (options.morphId) shapeOpts.morphId = options.morphId
	addShapeDefinition(target, shape === 'circle' ? SHAPE_TYPE.OVAL : SHAPE_TYPE.ROUNDED_RECTANGLE, shapeOpts)

	// Centred label (sized to the shape's bounding box)
	const tW = shape === 'circle' ? dim : w
	const tH = shape === 'circle' ? dim : h
	addTextDefinition(target, [{ text, options: null }], {
		x, y, w: tW, h: tH,
		align: 'center', valign: 'middle',
		color, fontSize, bold,
	}, false)
}

/**
 * Separator line helper (docs/features/feature-enhancements-converter-gaps.md §4.1). Draws a thin
 * horizontal (or vertical) rule as a single `rect` shape with colour/thickness/opacity — a
 * pure composition of the existing shape primitive, no new OOXML. Clamps degenerate
 * thickness/opacity to defaults (never throws). Works against a slide OR a group child target.
 * @param {PresSlide} target slide (or group child-target proxy) the separator should be added to
 * @param {SeparatorProps} opts separator options
 */
export function addSeparatorDefinition(target: PresSlide, opts: SeparatorProps): void {
	const options = typeof opts === 'object' ? opts : ({} as SeparatorProps)
	const x = options.x !== undefined ? Number(options.x) : 1
	const y = options.y !== undefined ? Number(options.y) : 1
	const color = options.color !== undefined ? options.color : 'D4D4D8'
	const thickness = options.thickness !== undefined && Number(options.thickness) > 0 ? Number(options.thickness) : 0.01
	// opacity 0–1 (clamp); map to the rect fill transparency (0–100, 100 = fully transparent)
	const rawOpacity = options.opacity !== undefined ? Number(options.opacity) : 0.5
	const opacity = isFinite(rawOpacity) ? Math.max(0, Math.min(1, rawOpacity)) : 0.5
	const transparency = Math.round((1 - opacity) * 100)
	const vertical = options.orientation === 'vertical'

	// Horizontal: width spans (`w`, default 1), height = thickness. Vertical: swap.
	const w = vertical ? thickness : (options.w !== undefined && Number(options.w) > 0 ? Number(options.w) : 1)
	const h = vertical ? (options.h !== undefined && Number(options.h) > 0 ? Number(options.h) : 1) : thickness

	const shapeOpts: ShapeProps = {
		x, y, w, h,
		fill: { color, transparency },
		line: { type: 'none' },
	}
	if (options.animation) shapeOpts.animation = options.animation
	if (options.objectName) shapeOpts.objectName = options.objectName
	if (options.morphId) shapeOpts.morphId = options.morphId
	addShapeDefinition(target, SHAPE_TYPE.RECTANGLE, shapeOpts)
}

/**
 * Feature 6: Adds a shape group to a slide definition and returns a group handle.
 * The group emits a `<p:grpSp>` whose `<a:xfrm>` carries the absolute position/size plus
 * `chOff="0,0"`/`chExt` equal to the extent — so child shapes/text use coordinates relative
 * to the group origin (1:1 scale). Children are added via the returned object's
 * `addShape()` / `addText()`, which reuse the existing shape/text intake but push onto the
 * group's private child array instead of the slide.
 * @param {PresSlide} target slide the group should be added to
 * @param {GroupProps} opts group position/size options
 * @return {SlideGroup} group handle exposing `addShape` / `addText`
 */
export function addGroupDefinition(target: PresSlide, opts: GroupProps): SlideGroup {
	const options = typeof opts === 'object' ? opts : ({} as GroupProps)
	const grpObjects: ISlideObject[] = []
	const groupObj: ISlideObject = {
		_type: SLIDE_OBJECT_TYPES.group,
		options: {
			x: options.x !== undefined ? options.x : 0,
			y: options.y !== undefined ? options.y : 0,
			w: options.w !== undefined ? options.w : 0,
			h: options.h !== undefined ? options.h : 0,
			objectName: options.objectName ? encodeXmlEntities(options.objectName) : `Group ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.group).length + 1}`,
		},
		_grpObjects: grpObjects,
	}
	target._slideObjects.push(groupObj)

	// Proxy target: existing intake fns push onto the group's child array but reuse the parent
	// slide's rels/layout/color so child shapes/text render identically to top-level ones.
	const childTarget = {
		_slideObjects: grpObjects,
		_rels: target._rels,
		_relsChart: target._relsChart,
		_relsMedia: target._relsMedia,
		_slideLayout: target._slideLayout,
		_presLayout: target._presLayout,
		color: target.color,
	} as unknown as PresSlide

	const group: SlideGroup = {
		addShape(shapeName: SHAPE_NAME, shapeOpts?: ShapeProps): SlideGroup {
			addShapeDefinition(childTarget, shapeName, (shapeOpts || {}) as ShapeProps)
			return group
		},
		addText(text: string | TextProps[], textOpts?: TextPropsOptions): SlideGroup {
			const textParam = typeof text === 'string' || typeof text === 'number' ? [{ text, options: textOpts }] : text
			addTextDefinition(childTarget, textParam as TextProps[], (textOpts || {}) as TextPropsOptions, false)
			return group
		},
		addAvatar(avatarOpts: AvatarProps): SlideGroup {
			addAvatarDefinition(childTarget, avatarOpts)
			return group
		},
		addBadge(badgeOpts: BadgeProps): SlideGroup {
			addBadgeDefinition(childTarget, badgeOpts)
			return group
		},
		addSeparator(separatorOpts: SeparatorProps): SlideGroup {
			addSeparatorDefinition(childTarget, separatorOpts)
			return group
		},
	}

	return group
}

/**
 * Adds a table object to a slide definition.
 * @param {PresSlide} target - slide object that the table should be added to
 * @param {TableRow[]} tableRows - table data
 * @param {TableProps} options - table options
 * @param {SlideLayout} slideLayout - Slide layout
 * @param {PresLayout} presLayout - Presentation layout
 * @param {Function} addSlide - method
 * @param {Function} getSlide - method
 */
export function addTableDefinition(
	target: PresSlide,
	tableRows: TableRow[],
	options: TableProps,
	slideLayout: SlideLayout,
	presLayout: PresLayout,
	addSlide: (options?: AddSlideProps) => PresSlide,
	getSlide: (slideNumber: number) => PresSlide
): PresSlide[] {
	const slides: PresSlide[] = [target] // Create array of Slides as more may be added by auto-paging
	const opt: TableProps = options && typeof options === 'object' ? options : {}
	opt.objectName = opt.objectName ? encodeXmlEntities(opt.objectName) : `Table ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.table).length}`

	// STEP 1: REALITY-CHECK
	{
		// A: check for empty
		if (!Array.isArray(tableRows)) {
			throw new Error('addTable: Array expected! EX: \'slide.addTable( [rows], {options} );\' (https://gitbrent.github.io/PptxGenJS/docs/api-tables.html)')
		}
		if (tableRows.length === 0) {
			throw new Error('addTable: rows array must not be empty. EX: \'slide.addTable( [rows], {options} );\' (https://gitbrent.github.io/PptxGenJS/docs/api-tables.html)')
		}

		// B: check for non-well-formatted array (ex: rows=['a','b'] instead of [['a','b']])
		if (!tableRows[0] || !Array.isArray(tableRows[0])) {
			throw new Error(
				'addTable: \'rows\' should be an array of cells! EX: \'slide.addTable( [ [\'A\'], [\'B\'], {text:\'C\',options:{align:\'center\'}} ] );\' (https://gitbrent.github.io/PptxGenJS/docs/api-tables.html)'
			)
		}

		// TODO: FUTURE: This is wacky and wont function right (shows .w value when there is none from demo.js?!) 20191219
		/*
		if (opt.w && opt.colW) {
			console.warn('addTable: please use either `colW` or `w` - not both (table will use `colW` and ignore `w`)')
			console.log(`${opt.w} ${opt.colW}`)
		}
		*/
	}

	// STEP 2: Transform `tableRows` into well-formatted TableCell's
	// tableRows can be object or plain text array: `[{text:'cell 1'}, {text:'cell 2', options:{color:'ff0000'}}]` | `["cell 1", "cell 2"]`
	const arrRows: TableCell[][] = []
	tableRows.forEach(row => {
		const newRow: TableCell[] = []

		if (Array.isArray(row)) {
			row.forEach((cell: number | string | TableCell) => {
				// A:
				const newCell: TableCell = {
					_type: SLIDE_OBJECT_TYPES.tablecell,
					text: '',
					options: typeof cell === 'object' && cell.options ? cell.options : {},
				}

				// B:
				if (typeof cell === 'string' || typeof cell === 'number') newCell.text = cell.toString()
				else if (cell.text) {
					// Cell can contain complex text type, or string, or number
					if (typeof cell.text === 'string' || typeof cell.text === 'number') newCell.text = cell.text.toString()
					else if (cell.text) newCell.text = cell.text
					// Capture options
					if (cell.options && typeof cell.options === 'object') newCell.options = cell.options
				}

				// C: Set cell borders
				newCell.options.border = newCell.options.border || opt.border || [{ type: 'none' }, { type: 'none' }, { type: 'none' }, { type: 'none' }]
				const cellBorder = newCell.options.border

				// CASE 1: border interface is: BorderOptions | [BorderOptions, BorderOptions, BorderOptions, BorderOptions]
				if (!Array.isArray(cellBorder) && typeof cellBorder === 'object') newCell.options.border = [cellBorder, cellBorder, cellBorder, cellBorder]
				// Handle: [null, null, {type:'solid'}, null]
				if (!newCell.options.border[0]) newCell.options.border[0] = { type: 'none' }
				if (!newCell.options.border[1]) newCell.options.border[1] = { type: 'none' }
				if (!newCell.options.border[2]) newCell.options.border[2] = { type: 'none' }
				if (!newCell.options.border[3]) newCell.options.border[3] = { type: 'none' }

				// set complete BorderOptions for all sides
				const arrSides = [0, 1, 2, 3]
				arrSides.forEach(idx => {
					newCell.options.border[idx] = {
						type: newCell.options.border[idx].type || DEF_CELL_BORDER.type,
						color: newCell.options.border[idx].color || DEF_CELL_BORDER.color,
						pt: typeof newCell.options.border[idx].pt === 'number' ? newCell.options.border[idx].pt : DEF_CELL_BORDER.pt,
					}
				})

				// LAST:
				newRow.push(newCell)
			})
		} else {
			console.log('addTable: tableRows has a bad row. A row should be an array of cells. You provided:')
			console.log(row)
		}

		arrRows.push(newRow)
	})

	// STEP 3: Set options
	opt.x = getSmartParseNumber(opt.x || (opt.x === 0 ? 0 : EMU / 2), 'X', presLayout)
	opt.y = getSmartParseNumber(opt.y || (opt.y === 0 ? 0 : EMU / 2), 'Y', presLayout)
	if (opt.h) opt.h = getSmartParseNumber(opt.h, 'Y', presLayout) // NOTE: Dont set default `h` - leaving it null triggers auto-rowH in `makeXMLSlide()`
	opt.fontSize = opt.fontSize || DEF_FONT_SIZE
	opt.margin = opt.margin === 0 || opt.margin ? opt.margin : DEF_CELL_MARGIN_IN
	if (typeof opt.margin === 'number') opt.margin = [Number(opt.margin), Number(opt.margin), Number(opt.margin), Number(opt.margin)]
	// defensive fallback - if `opt.margin` is not a 4-element array of finite numbers, use defaults so non-numeric table-level margins don't leak NaN into <a:tcPr>
	if (!Array.isArray(opt.margin) || opt.margin.length !== 4 || opt.margin.some((v: any) => typeof v !== 'number' || !isFinite(v))) {
		opt.margin = DEF_CELL_MARGIN_IN
	}
	// NOTE: dont add default color on tables with hyperlinks! (it causes any textObj's with hyperlinks to have subsequent words to be black)
	if (JSON.stringify({ arrRows: arrRows }).indexOf('hyperlink') === -1) {
		if (!opt.color) opt.color = opt.color || DEF_FONT_COLOR // Set default color if needed (table option > inherit from Slide > default to black)
	}
	if (typeof opt.border === 'string') {
		console.warn('addTable `border` option must be an object. Ex: `{border: {type:\'none\'}}`')
		opt.border = null
	} else if (Array.isArray(opt.border)) {
		[0, 1, 2, 3].forEach(idx => {
			opt.border[idx] = opt.border[idx]
				? { type: opt.border[idx].type || DEF_CELL_BORDER.type, color: opt.border[idx].color || DEF_CELL_BORDER.color, pt: opt.border[idx].pt || DEF_CELL_BORDER.pt }
				: { type: 'none' }
		})
	}

	opt.autoPage = typeof opt.autoPage === 'boolean' ? opt.autoPage : false
	opt.autoPageRepeatHeader = typeof opt.autoPageRepeatHeader === 'boolean' ? opt.autoPageRepeatHeader : false
	opt.autoPageHeaderRows = typeof opt.autoPageHeaderRows !== 'undefined' && !isNaN(Number(opt.autoPageHeaderRows)) ? Number(opt.autoPageHeaderRows) : 1
	opt.autoPageLineWeight = typeof opt.autoPageLineWeight !== 'undefined' && !isNaN(Number(opt.autoPageLineWeight)) ? Number(opt.autoPageLineWeight) : 0
	if (opt.autoPageLineWeight) {
		if (opt.autoPageLineWeight > 1) opt.autoPageLineWeight = 1
		else if (opt.autoPageLineWeight < -1) opt.autoPageLineWeight = -1
	}
	// autoPage ^^^

	// Set/Calc table width
	// Get slide margins - start with default values, then adjust if master or slide margins exist
	let arrTableMargin = DEF_SLIDE_MARGIN_IN
	// Case 1: Master margins
	if (slideLayout && typeof slideLayout._margin !== 'undefined') {
		if (Array.isArray(slideLayout._margin)) arrTableMargin = slideLayout._margin
		else if (!isNaN(Number(slideLayout._margin))) { arrTableMargin = [Number(slideLayout._margin), Number(slideLayout._margin), Number(slideLayout._margin), Number(slideLayout._margin)] }
	}
	// Case 2: Table margins
	/* FIXME: add `_margin` option to slide options
		else if ( addNewSlide._margin ) {
			if ( Array.isArray(addNewSlide._margin) ) arrTableMargin = addNewSlide._margin;
			else if ( !isNaN(Number(addNewSlide._margin)) ) arrTableMargin = [Number(addNewSlide._margin), Number(addNewSlide._margin), Number(addNewSlide._margin), Number(addNewSlide._margin)];
		}
	*/

	/**
	 * Calc table width depending upon what data we have - several scenarios exist (including bad data, eg: colW doesnt match col count)
	 * The API does not require a `w` value, but XML generation does, hence, code to calc a width below using colW value(s)
	 */
	if (opt.colW) {
		const firstRowColCnt = arrRows[0].reduce((totalLen, c) => {
			if (c?.options?.colspan && typeof c.options.colspan === 'number') {
				totalLen += c.options.colspan
			} else {
				totalLen += 1
			}
			return totalLen
		}, 0)

		if (typeof opt.colW === 'string' || typeof opt.colW === 'number') {
			// Ex: `colW = 3` or `colW = '3'`
			opt.w = Math.floor(Number(opt.colW) * firstRowColCnt)
			opt.colW = null // IMPORTANT: Unset `colW` so table is created using `opt.w`, which will evenly divide cols
		} else if (opt.colW && Array.isArray(opt.colW) && opt.colW.length === 1 && firstRowColCnt > 1) {
			// Ex: `colW=[3]` but with >1 cols (same as above, user is saying "use this width for all")
			opt.w = Math.floor(Number(opt.colW) * firstRowColCnt)
			opt.colW = null // IMPORTANT: Unset `colW` so table is created using `opt.w`, which will evenly divide cols
		} else if (opt.colW && Array.isArray(opt.colW) && opt.colW.length !== firstRowColCnt) {
			// Err: Mismatched colW and cols count
			console.warn('addTable: mismatch: (colW.length != data.length) Therefore, defaulting to evenly distributed col widths.')
			opt.colW = null
		}
	} else if (opt.w) {
		opt.w = getSmartParseNumber(opt.w, 'X', presLayout)
	} else {
		opt.w = Math.floor(presLayout._sizeW / EMU - arrTableMargin[1] - arrTableMargin[3])
	}

	// STEP 4: Convert units to EMU now (we use different logic in makeSlide->table - smartCalc is not used)
	if (opt.x && opt.x < 20) opt.x = inch2Emu(opt.x)
	if (opt.y && opt.y < 20) opt.y = inch2Emu(opt.y)
	if (opt.w && typeof opt.w === 'number' && opt.w < 20) opt.w = inch2Emu(opt.w)
	if (opt.h && typeof opt.h === 'number' && opt.h < 20) opt.h = inch2Emu(opt.h)

	// STEP 5: Loop over cells: transform each to ITableCell; check to see whether to unset `autoPage` while here
	arrRows.forEach(row => {
		row.forEach((cell, idy) => {
			// A: Transform cell data if needed
			/* Table rows can be an object or plain text - transform into object when needed
				// EX:
				var arrTabRows1 = [
					[ { text:'A1\nA2', options:{rowspan:2, fill:'99FFCC'} } ]
					,[ 'B2', 'C2', 'D2', 'E2' ]
				]
			*/
			if (typeof cell === 'number' || typeof cell === 'string') {
				// Grab table formatting `opts` to use here so text style/format inherits as it should
				row[idy] = { _type: SLIDE_OBJECT_TYPES.tablecell, text: String(row[idy]), options: opt }
			} else if (typeof cell === 'object') {
				// ARG0: `text`
				if (typeof cell.text === 'number') row[idy].text = row[idy].text.toString()
				else if (typeof cell.text === 'undefined' || cell.text === null) row[idy].text = ''

				// ARG1: `options`: ensure options exists
				row[idy].options = cell.options || {}

				// Set type to tabelcell
				row[idy]._type = SLIDE_OBJECT_TYPES.tablecell
			}

			// B: Check for fine-grained formatting, disable auto-page when found
			// Since genXmlTextBody already checks for text array ( text:[{},..{}] ) we're done!
			// Text in individual cells will be formatted as they are added by calls to genXmlTextBody within table builder
			// if (cell.text && Array.isArray(cell.text)) opt.autoPage = false
			// TODO: FIXME: WIP: 20210807: We cant do this anymore
		})
	})

	// If autoPage = true, we need to return references to newly created slides if any
	const newAutoPagedSlides: PresSlide[] = []

	// STEP 6: Auto-Paging: (via {options} and used internally)
	// (used internally by `tableToSlides()` to not engage recursion - we've already paged the table data, just add this one)
	if (opt && !opt.autoPage) {
		// Create hyperlink rels (IMPORTANT: Wait until table has been shredded across Slides or all rels will end-up on Slide 1!)
		createHyperlinkRels(target, arrRows)

		// Add slideObjects (NOTE: Use `extend` to avoid mutation)
		target._slideObjects.push({
			_type: SLIDE_OBJECT_TYPES.table,
			arrTabRows: arrRows,
			options: Object.assign({}, opt),
		})
	} else {
		if (opt.autoPageRepeatHeader) opt._arrObjTabHeadRows = arrRows.filter((_row, idx) => idx < opt.autoPageHeaderRows)

		// Loop over rows and create 1-N tables as needed (ISSUE#21)
		getSlidesForTableRows(arrRows, opt, presLayout, slideLayout).forEach((slide, idx) => {
			// A: Create new Slide when needed, otherwise, use existing (NOTE: More than 1 table can be on a Slide, so we will go up AND down the Slide chain)
			if (!getSlide(target._slideNum + idx)) slides.push(addSlide({ masterName: slideLayout?._name || null }))

			// B: Reset opt.y to `option`/`margin` after first Slide (ISSUE#43, ISSUE#47, ISSUE#48)
			if (idx > 0) opt.y = inch2Emu(opt.autoPageSlideStartY || opt.newSlideStartY || arrTableMargin[0])

			// C: Add this table to new Slide
			{
				const newSlide: PresSlide = getSlide(target._slideNum + idx)

				opt.autoPage = false

				// Create hyperlink rels (IMPORTANT: Wait until table has been shredded across Slides or all rels will end-up on Slide 1!)
				createHyperlinkRels(newSlide, slide.rows)

				// Add rows to new slide
				newSlide.addTable(slide.rows, Object.assign({}, opt))

				// Add reference to the new slide so it can be returned, but don't add the first one because the user already has a reference to that one.
				if (idx > 0) newAutoPagedSlides.push(newSlide)
			}
		})
	}
	return newAutoPagedSlides
}

/**
 * Adds a text object to a slide definition.
 * @param {PresSlide} target - slide object that the text should be added to
 * @param {string|TextProps[]} text text string or object
 * @param {TextPropsOptions} opts text options
 * @param {boolean} isPlaceholder whether this a placeholder object
 * @since: 1.0.0
 */
export function addTextDefinition(target: PresSlide, text: TextProps[], opts: TextPropsOptions, isPlaceholder: boolean): void {
	// COUNTER SUGAR (PROMPT §2.4 approach #1): a `counter` option is NOT a native OOXML
	// animation — OOXML cannot mutate displayed text content. We emulate a count-up by
	// stacking N text frames at the same position, each reusing the `appear` entrance and
	// hiding the previous frame after `stepMs`. Approach #2 (<p:anim> on a numeric attr)
	// does not drive displayed text and is intentionally not attempted.
	if (opts?.counter) {
		const { from, to, suffix = '', stepMs = 500 } = opts.counter
		const valid = typeof from === 'number' && isFinite(from) && typeof to === 'number' && isFinite(to) && to >= from
		if (valid) {
			const frameCount = to - from + 1
			for (let i = 0; i < frameCount; i++) {
				const value = from + i
				const frameOpts: TextPropsOptions = { ...opts }
				delete frameOpts.counter
				// Odometer entrance: ALL frames live in ONE parallel build step (`withPrevious`),
				// each appearing at a CUMULATIVE delay from the container start (frame 0 -> 0,
				// frame 1 -> stepMs, frame 2 -> 2*stepMs, ...). `afterPrevious` would split each
				// frame into a separate build step in genXmlTiming, breaking the count-up; using
				// `withPrevious` keeps them in one group so the staggered delays drive the odometer.
				frameOpts.animation = { type: 'appear', trigger: 'withPrevious', delay: i * stepMs }
				// Every frame except the last hides itself one step after IT appears (the exit delay
				// is relative to each frame's own appearance), so frame N+1 masks frame N -> count-up.
				if (i < frameCount - 1) frameOpts._counterExit = stepMs
				else delete frameOpts._counterExit
				frameOpts._counterFrame = true
				addTextDefinition(target, [{ text: `${value}${suffix}`, options: null }], frameOpts, isPlaceholder)
			}
			return
		}
		// Invalid counter: fall through to normal single-text behaviour (defensive, no crash).
	}

	// fit:'fill' (alias 'grow') — compute the largest font size that fits the box dimensions
	if (opts?.fit === 'fill' || opts?.fit === 'grow') {
		// Combine all text items; use a single space as fallback so measureTextWidth returns non-zero.
		const combinedText = (text || []).map(t => t.text || '').join('') || ' '
		// Box dimensions in inches (default to standard slide 10×5.625; convert percentage strings)
		const slideW = 10
		const slideH = 5.625
		const w = typeof opts.w === 'string' ? (parseFloat(opts.w) / 100) * slideW : (opts.w || slideW)
		const h = typeof opts.h === 'string' ? (parseFloat(opts.h) / 100) * slideH : (opts.h || slideH)
		// Width at 1pt scales linearly with fontSize; back-compute the fontSize that fills width w.
		const widthAt1pt = measureTextWidth(combinedText, { fontSize: 1 })
		const fontSize = Math.max(1, Math.min(256, Math.min(h * 72, widthAt1pt > 0 ? w / widthAt1pt : 256)))
		opts.fontSize = Math.round(fontSize)
		opts.fit = 'none' // pre-computed size; no autofit XML needed
	}

	const newObject: ISlideObject = {
		_type: isPlaceholder ? SLIDE_OBJECT_TYPES.placeholder : SLIDE_OBJECT_TYPES.text,
		shape: (opts?.shape) || SHAPE_TYPE.RECTANGLE,
		text: !text || text.length === 0 ? [{ text: '', options: null }] : text,
		options: opts || {},
	}

	function cleanOpts(itemOpts: ObjectOptions): TextPropsOptions {
		// STEP 1: Set some options
		{
			// A.1: Color (placeholders should inherit their colors or override them, so don't default them)
			if (!itemOpts.placeholder) {
				itemOpts.color = itemOpts.color || newObject.options.color || target.color || DEF_FONT_COLOR
			}

			// A.2: Placeholder should inherit their bullets or override them, so don't default them
			if (itemOpts.placeholder || isPlaceholder) {
				itemOpts.bullet = itemOpts.bullet || false
			}

			// A.3: Text targeting a placeholder need to inherit the placeholders options (eg: margin, valign, etc.) (Issue #640)
			if (itemOpts.placeholder && target._slideLayout && target._slideLayout._slideObjects) {
				const placeHold = target._slideLayout._slideObjects.filter(
					item => item._type === 'placeholder' && item.options && item.options.placeholder && item.options.placeholder === itemOpts.placeholder
				)[0]
				if (placeHold?.options) itemOpts = { ...itemOpts, ...placeHold.options }
			}

			// A.4: Other options
			itemOpts.objectName = itemOpts.morphId
				? encodeXmlEntities(itemOpts.morphId)
				: itemOpts.objectName
					? encodeXmlEntities(itemOpts.objectName)
					: `Text ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.text).length}`

			// B:
			if (itemOpts.shape === SHAPE_TYPE.LINE) {
				// ShapeLineProps defaults
				const newLineOpts: ShapeLineProps = {
					type: itemOpts.line.type || 'solid',
					color: itemOpts.line.color || DEF_SHAPE_LINE_COLOR,
					transparency: itemOpts.line.transparency || 0,
					width: itemOpts.line.width || 1,
					dashType: itemOpts.line.dashType || 'solid',
					beginArrowType: itemOpts.line.beginArrowType || null,
					endArrowType: itemOpts.line.endArrowType || null,
				}
				if (typeof itemOpts.line === 'object') itemOpts.line = newLineOpts

				// 3: Handle line (lots of deprecated opts)
				if (typeof itemOpts.line === 'string') {
					const tmpOpts = newLineOpts
					if (typeof itemOpts.line === 'string') tmpOpts.color = itemOpts.line // @deprecated [remove in v4.0]
					// tmpOpts.color = itemOpts.line!.toString() // @deprecated `itemOpts.line`:[string] (was line color)
					itemOpts.line = tmpOpts
				}
				if (typeof itemOpts.lineSize === 'number') itemOpts.line.width = itemOpts.lineSize // @deprecated (part of `ShapeLineProps` now)
				if (typeof itemOpts.lineDash === 'string') itemOpts.line.dashType = itemOpts.lineDash // @deprecated (part of `ShapeLineProps` now)
				if (typeof itemOpts.lineHead === 'string') itemOpts.line.beginArrowType = itemOpts.lineHead // @deprecated (part of `ShapeLineProps` now)
				if (typeof itemOpts.lineTail === 'string') itemOpts.line.endArrowType = itemOpts.lineTail // @deprecated (part of `ShapeLineProps` now)
			}

			// C: Line opts
			itemOpts.line = itemOpts.line || {}
			itemOpts.lineSpacing = itemOpts.lineSpacing && !isNaN(itemOpts.lineSpacing) ? itemOpts.lineSpacing : null
			itemOpts.lineSpacingMultiple = itemOpts.lineSpacingMultiple && !isNaN(itemOpts.lineSpacingMultiple) ? itemOpts.lineSpacingMultiple : null

			// D: Transform text options to bodyProperties as thats how we build XML
			itemOpts._bodyProp = itemOpts._bodyProp || {}
			// Back-compat: legacy `autoFit: true` ("resize shape to fit text") now maps to `fit: 'resize'`.
			// Routing through `fit` keeps a single code path (and avoids emitting `<a:spAutoFit/>` twice). @deprecated 3.3.0
			if (itemOpts.autoFit === true && !itemOpts.fit) itemOpts.fit = 'resize'
			itemOpts._bodyProp.autoFit = false // DEPRECATED: (3.3.0) superseded by `fit` (see above)
			itemOpts._bodyProp.anchor = !itemOpts.placeholder ? TEXT_VALIGN.ctr : null // VALS: [t,ctr,b]
			itemOpts._bodyProp.vert = itemOpts.vert || null // VALS: [eaVert,horz,mongolianVert,vert,vert270,wordArtVert,wordArtVertRtl]
			itemOpts._bodyProp.wrap = typeof itemOpts.wrap === 'boolean' ? itemOpts.wrap : true

			// E: Inset
			// @deprecated 3.10.0 (`inset` - use `margin`)
			if ((itemOpts.inset && !isNaN(Number(itemOpts.inset))) || itemOpts.inset === 0) {
				itemOpts._bodyProp.lIns = inch2Emu(itemOpts.inset)
				itemOpts._bodyProp.rIns = inch2Emu(itemOpts.inset)
				itemOpts._bodyProp.tIns = inch2Emu(itemOpts.inset)
				itemOpts._bodyProp.bIns = inch2Emu(itemOpts.inset)
			}

			// F: Transform @deprecated props
			if (typeof itemOpts.underline === 'boolean' && itemOpts.underline === true) itemOpts.underline = { style: 'sng' }
		}

		// STEP 2: Transform `align`/`valign` to XML values, store in _bodyProp for XML gen
		{
			if ((itemOpts.align || '').toLowerCase().indexOf('c') === 0) itemOpts._bodyProp.align = TEXT_HALIGN.center
			else if ((itemOpts.align || '').toLowerCase().indexOf('l') === 0) itemOpts._bodyProp.align = TEXT_HALIGN.left
			else if ((itemOpts.align || '').toLowerCase().indexOf('r') === 0) itemOpts._bodyProp.align = TEXT_HALIGN.right
			else if ((itemOpts.align || '').toLowerCase().indexOf('j') === 0) itemOpts._bodyProp.align = TEXT_HALIGN.justify

			if ((itemOpts.valign || '').toLowerCase().indexOf('b') === 0) itemOpts._bodyProp.anchor = TEXT_VALIGN.b
			else if ((itemOpts.valign || '').toLowerCase().indexOf('m') === 0) itemOpts._bodyProp.anchor = TEXT_VALIGN.ctr
			else if ((itemOpts.valign || '').toLowerCase().indexOf('t') === 0) itemOpts._bodyProp.anchor = TEXT_VALIGN.t
		}

		// STEP 3: ROBUST: Set rational values for some shadow props if needed
		correctShadowOptions(itemOpts.shadow)

		return itemOpts
	}

	// STEP 1: Create/Clean object options
	newObject.options = cleanOpts(newObject.options)

	// STEP 2: Create/Clean text options
	newObject.text.forEach(item => (item.options = cleanOpts(item.options || {})))

	// STEP 3: Create hyperlinks
	createHyperlinkRels(target, newObject.text || '')

	// LAST: Add object to Slide
	target._slideObjects.push(newObject)
}

/**
 * Adds placeholder objects to slide
 * @param {PresSlide} slide - slide object containing layouts
 */
export function addPlaceholdersToSlideLayouts(slide: PresSlide): void {
	// Add all placeholders on this Slide that dont already exist
	(slide._slideLayout._slideObjects || []).forEach(slideLayoutObj => {
		if (slideLayoutObj._type === SLIDE_OBJECT_TYPES.placeholder) {
			// A: Search for this placeholder on Slide before we add
			// NOTE: Check to ensure a placeholder does not already exist on the Slide
			// They are created when they have been populated with text (ex: `slide.addText('Hi', { placeholder:'title' });`)
			if (slide._slideObjects.filter(slideObj => slideObj.options && slideObj.options.placeholder === slideLayoutObj.options.placeholder).length === 0) {
				addTextDefinition(slide, [{ text: '' }], slideLayoutObj.options, true)
			}
		}
	})
}

/* -------------------------------------------------------------------------------- */

/**
 * Adds a background image or color to a slide definition.
 * @param {BackgroundProps} props - color string or an object with image definition
 * @param {PresSlide} target - slide object that the background is set to
 */
export function addBackgroundDefinition(props: BackgroundProps, target: SlideLayout): void {
	// A: @deprecated
	if (target.bkgd) {
		if (!target.background) target.background = {}

		if (typeof target.bkgd === 'string') target.background.color = target.bkgd
		else {
			if (target.bkgd.data) target.background.data = target.bkgd.data
			if (target.bkgd.path) target.background.path = target.bkgd.path
			if (target.bkgd.src) target.background.path = target.bkgd.src // @deprecated (drop in 4.x)
		}
	}
	if (target.background?.fill) target.background.color = target.background.fill

	// B: Handle media
	if (props && (props.path || props.data)) {
		// Allow the use of only the data key (`path` isnt reqd)
		props.path = props.path || 'preencoded.png'
		let strImgExtn = (props.path.split('.').pop() || 'png').split('?')[0] // Handle "blah.jpg?width=540" etc.
		if (strImgExtn === 'jpg') strImgExtn = 'jpeg' // base64-encoded jpg's come out as "data:image/jpeg;base64,/9j/[...]", so correct exttnesion to avoid content warnings at PPT startup

		target._relsMedia = target._relsMedia || []
		const intRels = target._relsMedia.length + 1
		// NOTE: `Target` cannot have spaces (eg:"Slide 1-image-1.jpg") or a "presentation is corrupt" warning comes up
		target._relsMedia.push({
			path: props.path,
			type: SLIDE_OBJECT_TYPES.image,
			extn: strImgExtn,
			data: props.data || null,
			rId: intRels,
			Target: `../media/${(target._name || '').replace(/\s+/gi, '-')}-image-${target._relsMedia.length + 1}.${strImgExtn}`,
		})
		target._bkgdImgRid = intRels
	}
}

/**
 * Parses text/text-objects from `addText()` and `addTable()` methods; creates 'hyperlink'-type Slide Rels for each hyperlink found
 * @param {PresSlide} target - slide object that any hyperlinks will be be added to
 * @param {number | string | TextProps | TextProps[] | ITableCell[][]} text - text to parse
 */
function createHyperlinkRels(
	target: PresSlide,
	text: number | string | ISlideObject | TextProps | TextProps[] | TableCell[][],
	options?: TextPropsOptions[],
): void {
	let textObjs = []

	// Only text objects can have hyperlinks, bail when text param is plain text
	if (typeof text === 'string' || typeof text === 'number') return
	// IMPORTANT: "else if" Array.isArray must come before typeof===object! Otherwise, code will exhaust recursion!
	else if (Array.isArray(text)) textObjs = text
	else if (typeof text === 'object') textObjs = [text]

	textObjs.forEach((text: TextProps, idx: number) => {
		// IMPORTANT: `options` are lost due to recursion/copy!
		if (options && options[idx] && options[idx].hyperlink) text.options = { ...text.options, ...options[idx] }

		// NOTE: `text` can be an array of other `text` objects (table cell word-level formatting), continue parsing using recursion
		if (Array.isArray(text)) {
			const cellOpts = []
			text.forEach((tablecell) => {
				if (tablecell.options && !tablecell.text.options) {
					cellOpts.push(tablecell.options)
				}
			})
			createHyperlinkRels(target, text, cellOpts)
		} else if (Array.isArray(text.text)) {
			createHyperlinkRels(target, text.text, options && options[idx] ? [options[idx]] : undefined)
		} else if (text && typeof text === 'object' && text.options && text.options.hyperlink && !text.options.hyperlink._rId) {
			if (typeof text.options.hyperlink !== 'object') {
				console.log('ERROR: text `hyperlink` option should be an object. Ex: `hyperlink: {url:\'https://github.com\'}` ')
			}
			else if (!text.options.hyperlink.url && !text.options.hyperlink.slide) {
				// NOTE: Navigation action jumps (e.g. `action: 'nextSlide'`) need NO relationship (they emit `r:id=""`) — skip silently
				if (!(text.options.hyperlink.action && text.options.hyperlink.action !== 'slide')) {
					console.log('ERROR: \'hyperlink requires either: `url` or `slide`\'')
				}
			}
			else {
				const relId = getNewRelId(target)

				target._rels.push({
					type: SLIDE_OBJECT_TYPES.hyperlink,
					data: text.options.hyperlink.slide ? 'slide' : 'dummy',
					rId: relId,
					Target: encodeXmlEntities(text.options.hyperlink.url) || text.options.hyperlink.slide.toString(),
				})

				text.options.hyperlink._rId = relId
			}
		}
		else if (text && typeof text === 'object' && text.options && text.options.hyperlink && text.options.hyperlink._rId) {
			// NOTE: auto-paging will create new slides, but skip above as _rId exists, BUT this is a new slide, so add rels!
			if (target._rels.filter(rel => rel.rId === text.options.hyperlink._rId).length === 0) {
				target._rels.push({
					type: SLIDE_OBJECT_TYPES.hyperlink,
					data: text.options.hyperlink.slide ? 'slide' : 'dummy',
					rId: text.options.hyperlink._rId,
					Target: encodeXmlEntities(text.options.hyperlink.url) || text.options.hyperlink.slide.toString(),
				})
			}
		}
	})
}
