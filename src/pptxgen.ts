/**
 *  :: pptxgen.ts ::
 *
 *  JavaScript framework that creates PowerPoint (pptx) presentations
 *  https://github.com/gitbrent/PptxGenJS
 *
 *  This framework is released under the MIT Public License (MIT)
 *
 *  PptxGenJS (C) 2015-present Brent Ely -- https://github.com/gitbrent
 *
 *  Some code derived from the OfficeGen project:
 *  github.com/Ziv-Barber/officegen/ (Copyright 2013 Ziv Barber)
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the "Software"), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in all
 *  copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *  SOFTWARE.
 */

/**
 * Units of Measure used in PowerPoint documents
 *
 * PowerPoint units are in `DXA` (except for font sizing)
 * - 1 inch is 1440 DXA
 * - 1 inch is 72 points
 * -  1 DXA is 1/20th's of a point
 * - 20 DXA is 1 point
 *
 * Another form of measurement using is an `EMU`
 * - 914400 EMUs is 1 inch
 * -  12700 EMUs is 1 point
 *
 * @see https://startbigthinksmall.wordpress.com/2010/01/04/points-inches-and-emus-measuring-units-in-office-open-xml/
 */

/**
 * Object Layouts
 *
 * - 16x9 (10" x 5.625")
 * - 16x10 (10" x 6.25")
 * - 4x3 (10" x 7.5")
 * - Wide (13.33" x 7.5")
 * - [custom] (any size)
 *
 * @see https://docs.microsoft.com/en-us/office/open-xml/structure-of-a-presentationml-document
 * @see https://docs.microsoft.com/en-us/previous-versions/office/developer/office-2010/hh273476(v=office.14)
 */

import JSZip from 'jszip'
import Slide from './slide'
import {
	AlignH,
	AlignV,
	CHART_TYPE,
	ChartType,
	DEF_PRES_LAYOUT,
	DEF_PRES_LAYOUT_NAME,
	DEF_SLIDE_MARGIN_IN,
	EMU,
	OutputType,
	SCHEME_COLOR_NAMES,
	SHAPE_TYPE,
	SchemeColor,
	ShapeType,
	WRITE_OUTPUT_TYPE,
} from './core-enums'
import {
	AddSlideProps,
	HeaderFooterProps,
	IPresentationProps,
	KinsokuProps,
	CustomShowProps,
	PhotoAlbumProps,
	EmbedFontProps,
	HandoutMasterProps,
	LayoutGridProps,
	LayoutGridResult,
	LayoutStackProps,
	LayoutStackResult,
	PresLayout,
	PresSlide,
	SectionProps,
	SlideLayout,
	SlideMasterProps,
	SlideNumberProps,
	TableToSlidesProps,
	ThemeProps,
	WriteBaseProps,
	WriteFileProps,
	WriteProps,
} from './core-interfaces'
import * as genCharts from './gen-charts'
import * as genObj from './gen-objects'
import * as genMedia from './gen-media'
import * as genTable from './gen-tables'
import * as genXml from './gen-xml'
import * as genSmartArt from './gen-smartart'
import { layoutGrid as layoutGridUtil, layoutStack as layoutStackUtil } from './gen-utils'

const VERSION = '4.3.25'

/**
 * Ensure `globalThis.setImmediate`/`clearImmediate` exist before invoking JSZip.
 *
 * JSZip's DEFLATE path schedules async chunks via a bare `setImmediate(...)`
 * global (its bundled `setimmediate` shim attaches to `self`/`global`/`exports`,
 * none of which are reachable inside a hardened Node `vm` sandbox). Without a
 * `setImmediate` global, generating a compressed `.pptx` throws
 * "setImmediate is not defined".
 *
 * This polyfills the two globals from `setTimeout`/`clearTimeout` ONLY when they
 * are absent, so a real Node implementation is never clobbered. No emitted XML
 * changes; this only affects async scheduling availability.
 */
function ensureSetImmediate(): void {
	const g = globalThis as unknown as {
		setImmediate?: (callback: (...args: any[]) => void, ...args: any[]) => any
		clearImmediate?: (handle: any) => void
	}
	if (typeof g.setImmediate === 'undefined') {
		g.setImmediate = (callback: (...args: any[]) => void, ...args: any[]) => setTimeout(callback, 0, ...args)
	}
	if (typeof g.clearImmediate === 'undefined') {
		g.clearImmediate = (handle: any) => { clearTimeout(handle) }
	}
}

export default class PptxGenJS implements IPresentationProps {
	// Property getters/setters

	/**
	 * Presentation layout name
	 * Standard layouts:
	 * - 'LAYOUT_4x3'   (10"    x 7.5")
	 * - 'LAYOUT_16x9'  (10"    x 5.625")
	 * - 'LAYOUT_16x10' (10"    x 6.25")
	 * - 'LAYOUT_WIDE'  (13.33" x 7.5")
	 * Custom layouts:
	 * Use `pptx.defineLayout()` to create custom layouts (e.g.: 'A4')
	 * @type {string}
	 * @see https://support.office.com/en-us/article/Change-the-size-of-your-slides-040a811c-be43-40b9-8d04-0de5ed79987e
	 */
	private _layout: string
	public set layout(value: string) {
		const newLayout: PresLayout = this.LAYOUTS[value]

		if (newLayout) {
			this._layout = value
			this._presLayout = newLayout
		} else {
			throw new Error('UNKNOWN-LAYOUT')
		}
	}

	public get layout(): string {
		return this._layout
	}

	/**
	 * PptxGenJS Library Version
	 */
	private readonly _version: string = VERSION
	public get version(): string {
		return this._version
	}

	/**
	 * @type {string}
	 */
	private _author: string
	public set author(value: string) {
		this._author = value
	}

	public get author(): string {
		return this._author
	}

	/**
	 * @type {string}
	 */
	private _company: string
	public set company(value: string) {
		this._company = value
	}

	public get company(): string {
		return this._company
	}

	/**
	 * @type {string}
	 * @note the `revision` value must be a whole number only (without "." or "," - otherwise, PPT will throw errors upon opening!)
	 */
	private _revision: string
	public set revision(value: string) {
		this._revision = value
	}

	public get revision(): string {
		return this._revision
	}

	/**
	 * @type {string}
	 */
	private _subject: string
	public set subject(value: string) {
		this._subject = value
	}

	public get subject(): string {
		return this._subject
	}

	/**
	 * @type {ThemeProps}
	 */
	private _theme: ThemeProps
	public set theme(value: ThemeProps) {
		this._theme = value
	}

	public get theme(): ThemeProps {
		return this._theme
	}

	/**
	 * Presentation-level notes-master header/footer config.
	 * Injects `<p:hf>` + fills the header/footer placeholder text in `notesMaster1.xml`.
	 * @type {HeaderFooterProps}
	 */
	private _notesMaster: HeaderFooterProps
	public set notesMaster(value: HeaderFooterProps) {
		this._notesMaster = value
	}

	public get notesMaster(): HeaderFooterProps {
		return this._notesMaster
	}

	/**
	 * Presentation-level kinsoku (East-Asian line-break) rules.
	 * Emits `<p:kinsoku>` into `presentation.xml` when set (default-off).
	 * @type {KinsokuProps}
	 */
	private _kinsoku: KinsokuProps
	public set kinsoku(value: KinsokuProps) {
		this._kinsoku = value
	}

	public get kinsoku(): KinsokuProps {
		return this._kinsoku
	}

	/**
	 * Presentation-level photo album metadata.
	 * Emits `<p:photoAlbum>` into `presentation.xml` when set (default-off).
	 * @type {PhotoAlbumProps}
	 */
	private _photoAlbum: PhotoAlbumProps
	public set photoAlbum(value: PhotoAlbumProps) {
		this._photoAlbum = value
	}

	public get photoAlbum(): PhotoAlbumProps {
		return this._photoAlbum
	}

	/**
	 * Presentation-level handout master.
	 * Emits a `/ppt/handoutMasters/handoutMaster1.xml` part + `<p:handoutMasterIdLst>` into
	 * `presentation.xml` (plus presentation rel + Content_Types Override) when set (default-off).
	 * Populate via `defineHandoutMaster()`.
	 * @type {HandoutMasterProps}
	 */
	private _handoutMaster: HandoutMasterProps
	public get handoutMaster(): HandoutMasterProps {
		return this._handoutMaster
	}

	/**
	 * Presentation-level embedded fonts.
	 * Emits `<p:embeddedFontLst>` + `embedTrueTypeFonts="1"` into `presentation.xml` and packages
	 * the font binaries into `/ppt/fonts/*.fntdata` when set (default-off). Populate via `embedFont()`.
	 * @type {EmbedFontProps[]}
	 */
	private readonly _embeddedFonts: EmbedFontProps[]
	public get embeddedFonts(): EmbedFontProps[] {
		return this._embeddedFonts
	}

	/**
	 * @type {string}
	 */
	private _title: string
	public set title(value: string) {
		this._title = value
	}

	public get title(): string {
		return this._title
	}

	/**
	 * Whether Right-to-Left (RTL) mode is enabled
	 * @type {boolean}
	 */
	private _rtlMode: boolean
	public set rtlMode(value: boolean) {
		this._rtlMode = value
	}

	public get rtlMode(): boolean {
		return this._rtlMode
	}

	/** master slide layout object */
	private readonly _masterSlide: PresSlide
	public get masterSlide(): PresSlide {
		return this._masterSlide
	}

	/** this Presentation's Slide objects */
	private readonly _slides: PresSlide[]
	public get slides(): PresSlide[] {
		return this._slides
	}

	/** this Presentation's sections */
	private readonly _sections: SectionProps[]
	public get sections(): SectionProps[] {
		return this._sections
	}

	/** this Presentation's custom shows */
	private readonly _customShows: CustomShowProps[]
	public get customShows(): CustomShowProps[] {
		return this._customShows
	}

	/** slide layout definition objects, used for generating slide layout files */
	private readonly _slideLayouts: SlideLayout[]
	public get slideLayouts(): SlideLayout[] {
		return this._slideLayouts
	}

	private LAYOUTS: { [key: string]: PresLayout }

	// Exposed class props
	private readonly _alignH = AlignH
	public get AlignH(): typeof AlignH {
		return this._alignH
	}

	private readonly _alignV = AlignV
	public get AlignV(): typeof AlignV {
		return this._alignV
	}

	private readonly _chartType = ChartType
	public get ChartType(): typeof ChartType {
		return this._chartType
	}

	private readonly _outputType = OutputType
	public get OutputType(): typeof OutputType {
		return this._outputType
	}

	private _presLayout: PresLayout
	public get presLayout(): PresLayout {
		return this._presLayout
	}

	private readonly _schemeColor = SchemeColor
	public get SchemeColor(): typeof SchemeColor {
		return this._schemeColor
	}

	private readonly _shapeType = ShapeType
	public get ShapeType(): typeof ShapeType {
		return this._shapeType
	}

	/**
	 * @depricated use `ChartType`
	 */
	private readonly _charts = CHART_TYPE
	public get charts(): typeof CHART_TYPE {
		return this._charts
	}

	/**
	 * @depricated use `SchemeColor`
	 */
	private readonly _colors = SCHEME_COLOR_NAMES
	public get colors(): typeof SCHEME_COLOR_NAMES {
		return this._colors
	}

	/**
	 * @depricated use `ShapeType`
	 */
	private readonly _shapes = SHAPE_TYPE
	public get shapes(): typeof SHAPE_TYPE {
		return this._shapes
	}

	constructor() {
		const layout4x3: PresLayout = { name: 'screen4x3', width: 9144000, height: 6858000 }
		const layout16x9: PresLayout = { name: 'screen16x9', width: 9144000, height: 5143500 }
		const layout16x10: PresLayout = { name: 'screen16x10', width: 9144000, height: 5715000 }
		const layoutWide: PresLayout = { name: 'custom', width: 12192000, height: 6858000 }
		// Set available layouts
		this.LAYOUTS = {
			LAYOUT_4x3: layout4x3,
			LAYOUT_16x9: layout16x9,
			LAYOUT_16x10: layout16x10,
			LAYOUT_WIDE: layoutWide,
		}

		// Core
		this._author = 'PptxGenJS'
		this._company = 'PptxGenJS'
		this._revision = '1' // Note: Must be a whole number
		this._subject = 'PptxGenJS Presentation'
		this._title = 'PptxGenJS Presentation'
		// PptxGenJS props
		this._presLayout = {
			name: this.LAYOUTS[DEF_PRES_LAYOUT].name,
			_sizeW: this.LAYOUTS[DEF_PRES_LAYOUT].width,
			_sizeH: this.LAYOUTS[DEF_PRES_LAYOUT].height,
			width: this.LAYOUTS[DEF_PRES_LAYOUT].width,
			height: this.LAYOUTS[DEF_PRES_LAYOUT].height,
		}
		this._rtlMode = false
		//
		this._slideLayouts = [
			{
				_margin: DEF_SLIDE_MARGIN_IN,
				_name: DEF_PRES_LAYOUT_NAME,
				_presLayout: this._presLayout,
				_rels: [],
				_relsChart: [],
				_relsMedia: [],
				_slide: null,
				_slideNum: 1000,
				_slideNumberProps: null,
				_slideObjects: [],
			},
		]
		this._slides = []
		this._sections = []
		this._customShows = []
		this._embeddedFonts = []
		this._masterSlide = {
			addChart: null,
			addImage: null,
			addMedia: null,
			addNotes: null,
			addComment: null,
			addCard: null,
			addShape: null,
			addTable: null,
			addText: null,
			//
			_name: null,
			_presLayout: this._presLayout,
			_rId: null,
			_rels: [],
			_relsChart: [],
			_relsMedia: [],
			_slideId: null,
			_slideLayout: null,
			_slideNum: null,
			_slideNumberProps: null,
			_slideObjects: [],
		}
	}

	/**
	 * Provides an API for `addTableDefinition` to create slides as needed for auto-paging
	 * @param {AddSlideProps} options - slide masterName and/or sectionTitle
	 * @return {PresSlide} new Slide
	 */
	private readonly addNewSlide = (options?: AddSlideProps): PresSlide => {
		// Continue using sections if the first slide using auto-paging has a Section
		const sectAlreadyInUse =
			this.sections.length > 0 &&
			this.sections[this.sections.length - 1]._slides.filter(slide => slide._slideNum === this.slides[this.slides.length - 1]._slideNum).length > 0

		options.sectionTitle = sectAlreadyInUse ? this.sections[this.sections.length - 1].title : null

		return this.addSlide(options)
	}

	/**
	 * Provides an API for `addTableDefinition` to get slide reference by number
	 * @param {number} slideNum - slide number
	 * @return {PresSlide} Slide
	 * @since 3.0.0
	 */
	private readonly getSlide = (slideNum: number): PresSlide => this.slides.filter(slide => slide._slideNum === slideNum)[0]

	/**
	 * Enables the `Slide` class to set PptxGenJS [Presentation] master/layout slidenumbers
	 * @param {SlideNumberProps} slideNum - slide number config
	 */
	private readonly setSlideNumber = (slideNum: SlideNumberProps): void => {
		// 1: Add slideNumber to slideMaster1.xml
		this.masterSlide._slideNumberProps = slideNum

		// 2: Add slideNumber to DEF_PRES_LAYOUT_NAME layout
		this.slideLayouts.filter(layout => layout._name === DEF_PRES_LAYOUT_NAME)[0]._slideNumberProps = slideNum
	}

	/**
	 * Create all chart and media rels for this Presentation
	 * @param {PresSlide | SlideLayout} slide - slide with rels
	 * @param {JSZip} zip - JSZip instance
	 * @param {Promise<string>[]} chartPromises - promise array
	 */
	private readonly createChartMediaRels = (slide: PresSlide | SlideLayout, zip: JSZip, chartPromises: Promise<string>[]): void => {
		slide._relsChart.forEach(rel => chartPromises.push(genCharts.createExcelWorksheet(rel, zip)))
		slide._relsMedia.forEach(rel => {
			if (rel.type !== 'online' && rel.type !== 'hyperlink') {
				// A: Loop vars
				let data: string = rel.data && typeof rel.data === 'string' ? rel.data : ''

				// B: Users will undoubtedly pass various string formats, so correct prefixes as needed
				if (!data.includes(',') && !data.includes(';')) data = 'image/png;base64,' + data
				else if (!data.includes(',')) data = 'image/png;base64,' + data
				else if (!data.includes(';')) data = 'image/png;' + data

				// C: Add media
				zip.file(rel.Target.replace('..', 'ppt'), data.split(',').pop(), { base64: true })
			}
		})
	}

	/**
	 * Create and export the .pptx file
	 * @param {string} exportName - output file type
	 * @param {Blob} blobContent - Blob content
	 * @return {Promise<string>} Promise with file name
	 */
	private readonly writeFileToBrowser = async (exportName: string, blobContent: Blob): Promise<string> => {
		// STEP 1: Create element
		const eleLink = document.createElement('a')
		eleLink.setAttribute('style', 'display:none;')
		eleLink.dataset.interception = 'off' // @see https://docs.microsoft.com/en-us/sharepoint/dev/spfx/hyperlinking
		document.body.appendChild(eleLink)

		// STEP 2: Download file to browser
		// DESIGN: Use `createObjectURL()` to D/L files in client browsers (FYI: synchronously executed)
		if (window.URL.createObjectURL) {
			const url = window.URL.createObjectURL(new Blob([blobContent], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }))
			eleLink.href = url
			eleLink.download = exportName
			eleLink.click()

			// Clean-up (NOTE: Add a slight delay before removing to avoid 'blob:null' error in Firefox Issue#81)
			setTimeout(() => {
				window.URL.revokeObjectURL(url)
				document.body.removeChild(eleLink)
			}, 100)

			// Done
			return await Promise.resolve(exportName)
		}
	}

	/**
	 * Create and export the .pptx file
	 * @param {WRITE_OUTPUT_TYPE} outputType - output file type
	 * @return {Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array>} Promise with data or stream (node) or filename (browser)
	 */
	/**
	 * Resolve each embedded-font face to base64, writing the result into `fontData[face.index]`.
	 * Node: reads filesystem paths via `fs.readFileSync`. All runtimes: accepts `data:` URIs and
	 * raw base64 strings directly. On read failure the face is left empty (clamp, don't crash).
	 * @param {Array} faces - flattened font faces (from `flattenEmbeddedFontFaces`)
	 * @param {string[]} fontData - output array (indexed by `face.index`) to populate with base64
	 * @return {Array<Promise<string>>} per-face resolution promises
	 */
	private readonly encodeEmbeddedFonts = (
		faces: Array<{ index: number, value: string }>,
		fontData: string[]
	): Array<Promise<string>> => {
		const toBase64 = (value: string): string => {
			// data:font/ttf;base64,XXXX  → take the payload after the comma
			if (value.startsWith('data:')) {
				const comma = value.indexOf(',')
				return comma >= 0 ? value.slice(comma + 1) : ''
			}
			// already-base64 string (no path separators / extension) → pass through
			return value
		}

		return faces.map(async face => {
			try {
				if (!face.value.startsWith('data:') && /\.(ttf|otf)$/i.test(face.value)) {
					const fs = await import('fs')
					fontData[face.index] = Buffer.from(fs.readFileSync(face.value)).toString('base64')
				} else {
					fontData[face.index] = toBase64(face.value)
				}
				return 'done'
			} catch (ex) {
				console.warn(`embedFont: unable to read font face: "${face.value}"\n${String(ex)}`)
				fontData[face.index] = ''
				return 'error'
			}
		})
	}

	private readonly exportPresentation = async (props: WriteProps): Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array> => {
		const arrChartPromises: Promise<string>[] = []
		let arrMediaPromises: Promise<string>[] = []
		const zip = new JSZip()

		// STEP 1: Read/Encode all Media before zip as base64 content, etc. is required
		this.slides.forEach(slide => {
			arrMediaPromises = arrMediaPromises.concat(genMedia.encodeSlideMediaRels(slide))
		})
		this.slideLayouts.forEach(layout => {
			arrMediaPromises = arrMediaPromises.concat(genMedia.encodeSlideMediaRels(layout))
		})
		arrMediaPromises = arrMediaPromises.concat(genMedia.encodeSlideMediaRels(this.masterSlide))

		// STEP 1b: Encode embedded fonts (default-off). Resolve each face to base64 into `fontData`
		// (indexed by the flattened face order shared with gen-xml emitters).
		const fontFaces = genXml.flattenEmbeddedFontFaces(this.embeddedFonts)
		const fontData: string[] = new Array(fontFaces.length).fill('')
		if (fontFaces.length > 0) {
			arrMediaPromises = arrMediaPromises.concat(this.encodeEmbeddedFonts(fontFaces, fontData))
		}

		// STEP 2: Wait for Promises (if any) then generate the PPTX file
		return await Promise.all(arrMediaPromises).then(async () => {
			// A: Add empty placeholder objects to slides that don't already have them
			this.slides.forEach(slide => {
				if (slide._slideLayout) genObj.addPlaceholdersToSlideLayouts(slide)
			})

			// B: Add all required folders and files
			zip.folder('_rels')
			zip.folder('docProps')
			zip.folder('ppt').folder('_rels')
			// only scaffold ppt/charts and ppt/embeddings when at least one
			// target actually has a chart. Otherwise JSZip emits stray empty
			// directory entries into the archive on every minimal deck.
			const hasCharts =
				this.slides.some(s => (s._relsChart || []).length > 0) ||
				this.slideLayouts.some(l => (l._relsChart || []).length > 0) ||
				((this.masterSlide && this.masterSlide._relsChart) || []).length > 0
			if (hasCharts) {
				zip.folder('ppt/charts').folder('_rels')
				zip.folder('ppt/embeddings')
			}
			zip.folder('ppt/media')
			zip.folder('ppt/slideLayouts').folder('_rels')
			zip.folder('ppt/slideMasters').folder('_rels')
			zip.folder('ppt/slides').folder('_rels')
			zip.folder('ppt/theme')
			zip.folder('ppt/notesMasters').folder('_rels')
			zip.folder('ppt/notesSlides').folder('_rels')
			// Only scaffold ppt/fonts when at least one embedded font face is present.
			if (fontFaces.length > 0) zip.folder('ppt/fonts')
			// Only scaffold ppt/comments when at least one slide has review comments.
			const hasComments = this.slides.some(s => (s._comments || []).length > 0)
			if (hasComments) zip.folder('ppt/comments')
			// Only scaffold ppt/diagrams when at least one slide has a SmartArt diagram.
			const hasDiagrams = this.slides.some(s => (s._diagram || []).length > 0)
			if (hasDiagrams) zip.folder('ppt/diagrams')
			zip.file('[Content_Types].xml', genXml.makeXmlContTypes(this.slides, this.slideLayouts, this.masterSlide, this.embeddedFonts, !!this._handoutMaster)) // TODO: pass only `this` like below! 20200206
			zip.file('_rels/.rels', genXml.makeXmlRootRels())
			zip.file('docProps/app.xml', genXml.makeXmlApp(this.slides, this.company)) // TODO: pass only `this` like below! 20200206
			zip.file('docProps/core.xml', genXml.makeXmlCore(this.title, this.subject, this.author, this.revision)) // TODO: pass only `this` like below! 20200206
			zip.file('ppt/_rels/presentation.xml.rels', genXml.makeXmlPresentationRels(this.slides, this.embeddedFonts, !!this._handoutMaster))
			// Write embedded-font binary parts (`font${i+1}.fntdata`) referenced by the font rels above.
			fontFaces.forEach(face => {
				if (fontData[face.index]) {
					zip.file(`ppt/fonts/font${face.index + 1}.fntdata`, fontData[face.index], { base64: true })
				}
			})
			// Write the shared commentAuthors part when any slide has comments (default-off).
			if (hasComments) zip.file('ppt/commentAuthors.xml', genXml.makeXmlCommentAuthors(this.slides))
			zip.file('ppt/theme/theme1.xml', genXml.makeXmlTheme(this))
			// emit a separate theme2.xml part so notesMaster1.xml.rels resolves
			zip.file('ppt/theme/theme2.xml', genXml.makeXmlTheme(this))
			zip.file('ppt/presentation.xml', genXml.makeXmlPresentation(this))
			zip.file('ppt/presProps.xml', genXml.makeXmlPresProps())
			zip.file('ppt/tableStyles.xml', genXml.makeXmlTableStyles())
			zip.file('ppt/viewProps.xml', genXml.makeXmlViewProps())

			// C: Create a Layout/Master/Rel/Slide file for each SlideLayout and Slide
			this.slideLayouts.forEach((layout, idx) => {
				zip.file(`ppt/slideLayouts/slideLayout${idx + 1}.xml`, genXml.makeXmlLayout(layout))
				zip.file(`ppt/slideLayouts/_rels/slideLayout${idx + 1}.xml.rels`, genXml.makeXmlSlideLayoutRel(idx + 1, this.slideLayouts))
			})
			this.slides.forEach((slide, idx) => {
				zip.file(`ppt/slides/slide${idx + 1}.xml`, genXml.makeXmlSlide(slide))
				zip.file(`ppt/slides/_rels/slide${idx + 1}.xml.rels`, genXml.makeXmlSlideRel(this.slides, this.slideLayouts, idx + 1))
				// Create all slide notes related items. Notes of empty strings are created for slides which do not have notes specified, to keep track of _rels.
				zip.file(`ppt/notesSlides/notesSlide${idx + 1}.xml`, genXml.makeXmlNotesSlide(slide))
				zip.file(`ppt/notesSlides/_rels/notesSlide${idx + 1}.xml.rels`, genXml.makeXmlNotesSlideRel(idx + 1))
				// Comments (default-off): write the per-slide comment part only when present.
				if ((slide._comments || []).length > 0) {
					zip.file(`ppt/comments/comment${idx + 1}.xml`, genXml.makeXmlComments(slide, this.slides))
				}
				// Ink (default-off): write each ink annotation's InkML part to its stashed filename.
				;((slide._ink) || []).forEach(ink => {
					zip.file(`ppt/ink/${ink._target}`, genXml.makeXmlInk(ink))
				})
				// SmartArt (default-off): write the five linked diagram parts + the data part's sub-rels
				// (which point at the drawing cache via local rId1).
				;((slide._diagram) || []).forEach(dgm => {
					const k = dgm._id
					zip.file(`ppt/diagrams/data${k}.xml`, genSmartArt.makeXmlDiagramData(dgm, dgm._drawingRid))
					zip.file(`ppt/diagrams/layout${k}.xml`, genSmartArt.makeXmlDiagramLayout(dgm))
					zip.file(`ppt/diagrams/quickStyle${k}.xml`, genSmartArt.makeXmlDiagramQuickStyle())
					zip.file(`ppt/diagrams/colors${k}.xml`, genSmartArt.makeXmlDiagramColors())
					zip.file(`ppt/diagrams/drawing${k}.xml`, genSmartArt.makeXmlDiagramDrawing(dgm, dgm.w, dgm.h))
				})
			})
			zip.file('ppt/slideMasters/slideMaster1.xml', genXml.makeXmlMaster(this.masterSlide, this.slideLayouts))
			zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', genXml.makeXmlMasterRel(this.masterSlide, this.slideLayouts))
			zip.file('ppt/notesMasters/notesMaster1.xml', genXml.makeXmlNotesMaster(this._notesMaster))
			zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels', genXml.makeXmlNotesMasterRel())
			// Handout master (default-off): write the part + its theme rels only when defined.
			if (this._handoutMaster) {
				zip.file('ppt/handoutMasters/handoutMaster1.xml', genXml.makeXmlHandoutMaster(this._handoutMaster))
				zip.file('ppt/handoutMasters/_rels/handoutMaster1.xml.rels', genXml.makeXmlHandoutMasterRel())
			}

			// D: Create all Rels (images, media, chart data)
			this.slideLayouts.forEach(layout => {
				this.createChartMediaRels(layout, zip, arrChartPromises)
			})
			this.slides.forEach(slide => {
				this.createChartMediaRels(slide, zip, arrChartPromises)
			})
			this.createChartMediaRels(this.masterSlide, zip, arrChartPromises)

			// E: Wait for Promises (if any) then generate the PPTX file
			return await Promise.all(arrChartPromises).then(async () => {
				// Ensure a `setImmediate` global exists for JSZip's DEFLATE path so compressed
				// output works in hardened runtimes (e.g. Node `vm` sandbox) that omit it.
				ensureSetImmediate()
				if (props.outputType === 'STREAM') {
					// A: stream file
					return await zip.generateAsync({ type: 'nodebuffer', compression: props.compression ? 'DEFLATE' : 'STORE' })
				} else if (props.outputType) {
					// B: Node [fs]: Output type user option or default
					return await zip.generateAsync({ type: props.outputType })
				} else {
					// C: Browser: Output blob as app/ms-pptx
					return await zip.generateAsync({ type: 'blob', compression: props.compression ? 'DEFLATE' : 'STORE' })
				}
			})
		})
	}

	// EXPORT METHODS

	/**
	 * Export the current Presentation to stream
	 * @param {WriteBaseProps} props - output properties
	 * @returns {Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array>} file stream
	 */
	async stream(props?: WriteBaseProps): Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array> {
		return await this.exportPresentation({
			compression: props?.compression,
			outputType: 'STREAM',
		})
	}

	/**
	 * Export the current Presentation as JSZip content with the selected type
	 * @param {WriteProps} props output properties
	 * @returns {Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array>} file content in selected type
	 */
	async write(props?: WriteProps | WRITE_OUTPUT_TYPE): Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array> {
		// DEPRECATED: @deprecated v3.5.0 - outputType - [[remove in v4.0.0]]
		const propsOutpType = typeof props === 'object' && props?.outputType ? props.outputType : props ? (props as WRITE_OUTPUT_TYPE) : null
		const propsCompress = typeof props === 'object' && props?.compression ? props.compression : false

		return await this.exportPresentation({
			compression: propsCompress,
			outputType: propsOutpType,
		})
	}

	/**
	 * Export the current Presentation.
	 * Write the generated presentation to disk (Node) or trigger a download (browser).
	 * @param {WriteFileProps} props - output file properties
	 * @returns {Promise<string>} the presentation name
	 */
	async writeFile(props?: WriteFileProps | string): Promise<string> {
		// STEP 1: Figure out where we are running
		const isNode = typeof process !== 'undefined' && !!process.versions?.node && process.release?.name === 'node'

		// STEP 2: Normalise the user arguments
		if (typeof props === 'string') {
			// DEPRECATED: @deprecated v3.5.0 - fileName - [[remove in v4.0.0]]
			console.warn('[WARNING] writeFile(string) is deprecated - pass { fileName } instead.')
			props = { fileName: props }
		}
		const { fileName: rawName = 'Presentation.pptx', compression = false } = props as WriteFileProps
		const fileName = rawName.toLowerCase().endsWith('.pptx') ? rawName : `${rawName}.pptx`

		// STEP 3: Get the binary/Blob from exportPresentation()
		const outputType = isNode ? ('nodebuffer' as const) : null
		const data = await this.exportPresentation({ compression, outputType })

		// STEP 4: Write the file out
		if (isNode) {
			// Dynamically import to avoid bundling fs in the browser build
			const { promises: fs } = await import('node:fs')
			const { writeFile } = fs
			await writeFile(fileName, data as Buffer)
			return fileName
		}

		// Browser branch - push a download
		await this.writeFileToBrowser(fileName, data as Blob)
		return fileName
	}

	// PRESENTATION METHODS

	/**
	 * Add a new Section to Presentation
	 * @param {ISectionProps} section - section properties
	 * @example pptx.addSection({ title:'Charts' });
	 */
	addSection(section: SectionProps): void {
		if (!section) console.warn('addSection requires an argument')
		else if (!section.title) console.warn('addSection requires a title')

		const newSection: SectionProps = {
			_type: 'user',
			_slides: [],
			title: section.title,
		}

		if (section.order) this.sections.splice(section.order, 0, newSection)
		else this._sections.push(newSection)
	}

	/**
	 * Add a new Custom Show (named subset/ordering of slides) to Presentation
	 * @param {CustomShowProps} show - custom show properties
	 * @example pptx.addCustomShow({ name:'Exec Summary', slides:[slide1, slide3] });
	 */
	addCustomShow(show: CustomShowProps): void {
		if (!show) {
			console.warn('addCustomShow requires an argument')
			return
		}
		if (!show.name) {
			console.warn('addCustomShow requires a `name`')
			return
		}
		if (!show.slides || !Array.isArray(show.slides) || show.slides.length === 0) {
			console.warn('addCustomShow requires a non-empty `slides` array')
			return
		}

		this._customShows.push({ name: show.name, slides: show.slides })
	}

	/**
	 * Define a handout master — the layout PowerPoint uses when printing multiple slides per page.
	 * Lets a deck carry branded handout headers/footers. When set, a
	 * `/ppt/handoutMasters/handoutMaster1.xml` part is packaged and a `<p:handoutMasterIdLst>` is
	 * emitted into `presentation.xml` (plus the matching presentation rel + Content_Types Override).
	 * Default-off: decks that never call this are byte-identical to before.
	 *
	 * @param {HandoutMasterProps} props - handout master config (background + header/footer)
	 * @example pptx.defineHandoutMaster({ background:'FFFFFF', headerFooter:{ footer:'Confidential', slideNumber:true } });
	 */
	defineHandoutMaster(props: HandoutMasterProps): void {
		if (!props || typeof props !== 'object') {
			console.warn('defineHandoutMaster requires a props object')
			return
		}
		this._handoutMaster = props
	}

	/**
	 * Embed a TrueType/OpenType font family in the presentation so decks render with the
	 * intended typeface on machines that lack it. The font binaries are packaged into
	 * `/ppt/fonts/*.fntdata` and referenced from `<p:embeddedFontLst>` in `presentation.xml`.
	 *
	 * Each face value is a filesystem path (Node), a base64 string, or a `data:` URI.
	 * Only `.ttf`/`.otf` faces are supported — others are warned and skipped (clamp, don't crash).
	 * Subsetting is out of scope: the full font file is embedded (mind the size implication).
	 *
	 * @param {EmbedFontProps} font - font family + faces to embed
	 * @example pptx.embedFont({ family:'Inter', regular:'./Inter-Regular.ttf', bold:'./Inter-Bold.ttf' });
	 */
	embedFont(font: EmbedFontProps): void {
		if (!font) {
			console.warn('embedFont requires an argument')
			return
		}
		if (!font.family || typeof font.family !== 'string') {
			console.warn('embedFont requires a `family` name')
			return
		}

		// Accept only `.ttf`/`.otf` for path-like inputs; pass through base64/`data:` strings.
		const isValidFace = (value?: string): boolean => {
			if (typeof value !== 'string' || value.length === 0) return false
			// base64 / data-URI inputs carry no path extension to validate
			if (value.startsWith('data:')) return true
			if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 256 && !value.includes('.')) return true
			return /\.(ttf|otf)$/i.test(value)
		}

		const cleaned: EmbedFontProps = { family: font.family, regular: '' }
		let hasValidFace = false
		;(['regular', 'bold', 'italic', 'boldItalic'] as Array<keyof EmbedFontProps>).forEach(key => {
			const value = font[key]
			if (value === undefined) return
			if (isValidFace(value as string)) {
				;(cleaned as unknown as Record<string, string>)[key as string] = value as string
				hasValidFace = true
			} else {
				console.warn(`embedFont: skipping unsupported font face "${key}" (only .ttf/.otf are supported): ${String(value)}`)
			}
		})

		if (!cleaned.regular) {
			console.warn(`embedFont: font "${font.family}" has no valid \`regular\` face — skipping (a regular face is required)`)
			return
		}
		if (!hasValidFace) return

		this._embeddedFonts.push(cleaned)
	}

	/**
	 * Add a new Slide to Presentation
	 * @param {AddSlideProps} options - slide options
	 * @returns {PresSlide} the new Slide
	 */
	addSlide(options?: AddSlideProps): PresSlide {
		// TODO: DEPRECATED: arg0 string "masterSlideName" dep as of 3.2.0
		const masterSlideName = typeof options === 'string' ? options : options?.masterName ? options.masterName : ''
		let slideLayout: SlideLayout = {
			_name: this.LAYOUTS[DEF_PRES_LAYOUT].name,
			_presLayout: this.presLayout,
			_rels: [],
			_relsChart: [],
			_relsMedia: [],
			_slideNum: this.slides.length + 1,
		}

		if (masterSlideName) {
			const tmpLayout = this.slideLayouts.filter(layout => layout._name === masterSlideName)[0]
			if (tmpLayout) slideLayout = tmpLayout
		}

		const newSlide = new Slide({
			addSlide: this.addNewSlide,
			getSlide: this.getSlide,
			presLayout: this.presLayout,
			setSlideNum: this.setSlideNumber,
			slideId: this.slides.length + 256,
			slideRId: this.slides.length + 2,
			slideNumber: this.slides.length + 1,
			slideLayout,
		})

		// A: Add slide to pres
		this._slides.push(newSlide)

		// B: Sections
		// B-1: Add slide to section (if any provided)
		// B-2: Handle slides without a section when sections are already is use ("loose" slides arent allowed, they all need a section)
		if (options?.sectionTitle) {
			const sect = this.sections.filter(section => section.title === options.sectionTitle)[0]
			if (!sect) console.warn(`addSlide: unable to find section with title: "${options.sectionTitle}"`)
			else sect._slides.push(newSlide)
		} else if (this.sections && this.sections.length > 0 && (!options?.sectionTitle)) {
			const lastSect = this._sections[this.sections.length - 1]

			// CASE 1: The latest section is a default type - just add this one
			if (lastSect._type === 'default') lastSect._slides.push(newSlide)
			// CASE 2: There latest section is NOT a default type - create the defualt, add this slide
			else {
				this._sections.push({
					title: `Default-${this.sections.filter(sect => sect._type === 'default').length + 1}`,
					_type: 'default',
					_slides: [newSlide],
				})
			}
		}

		return newSlide
	}

	/**
	 * Compute evenly-spaced grid cell positions within a bounding area.
	 * - Pure layout helper: returns one `{ x, y, w, h }` (inches) per item; emits no slide content.
	 * @param {LayoutGridProps} props - grid options
	 * @returns {LayoutGridResult} array of `{ x, y, w, h }` cells (inches), one per item
	 * @example const grid = pptx.layoutGrid({ items: 6, columns: 3, area: { x: 0.5, y: 2, w: 12, h: 4 }, gap: 0.2 })
	 */
	layoutGrid(props: LayoutGridProps): LayoutGridResult {
		return layoutGridUtil(props)
	}

	/**
	 * Stack variable-height blocks down a region (the vertical companion to `layoutGrid()`).
	 * - Pure layout helper: returns one `{ x, y, w, h }` (inches) per block; emits no slide content.
	 * @param {LayoutStackProps} props - stack options
	 * @returns {LayoutStackResult} array of `{ x, y, w, h }` boxes (inches), one per block
	 * @example const boxes = pptx.layoutStack({ area: { x: 0.7, y: 0.85, w: 12, h: 6 }, blocks: [{ height: 0.7 }, { flex: 1 }], gap: 0.2 })
	 */
	layoutStack(props: LayoutStackProps): LayoutStackResult {
		return layoutStackUtil(props)
	}

	/**
	 * Create a custom Slide Layout in any size
	 * @param {PresLayout} layout - layout properties
	 * @example pptx.defineLayout({ name:'A3', width:16.5, height:11.7 });
	 */
	defineLayout(layout: PresLayout): void {
		// @see https://support.office.com/en-us/article/Change-the-size-of-your-slides-040a811c-be43-40b9-8d04-0de5ed79987e
		if (!layout) console.warn('defineLayout requires `{name, width, height}`')
		else if (!layout.name) console.warn('defineLayout requires `name`')
		else if (!layout.width) console.warn('defineLayout requires `width`')
		else if (!layout.height) console.warn('defineLayout requires `height`')
		else if (typeof layout.height !== 'number') console.warn('defineLayout `height` should be a number (inches)')
		else if (typeof layout.width !== 'number') console.warn('defineLayout `width` should be a number (inches)')

		this.LAYOUTS[layout.name] = {
			name: layout.name,
			_sizeW: Math.round(Number(layout.width) * EMU),
			_sizeH: Math.round(Number(layout.height) * EMU),
			width: Math.round(Number(layout.width) * EMU),
			height: Math.round(Number(layout.height) * EMU),
		}
	}

	/**
	 * Create a new slide master [layout] for the Presentation
	 * @param {SlideMasterProps} props - layout properties
	 */
	defineSlideMaster(props: SlideMasterProps): void {
		// (ISSUE#406;PULL#1176) deep clone the props object to avoid mutating the original object
		const propsClone = JSON.parse(JSON.stringify(props))
		if (!propsClone.title) throw new Error('defineSlideMaster() object argument requires a `title` value. (https://gitbrent.github.io/PptxGenJS/docs/masters.html)')

		const newLayout: SlideLayout = {
			_margin: propsClone.margin || DEF_SLIDE_MARGIN_IN,
			_name: propsClone.title,
			_presLayout: this.presLayout,
			_rels: [],
			_relsChart: [],
			_relsMedia: [],
			_slide: null,
			_slideNum: 1000 + this.slideLayouts.length + 1,
			_slideNumberProps: propsClone.slideNumber || null,
			_slideObjects: [],
			background: propsClone.background || null,
			bkgd: propsClone.bkgd || null,
		}

		// STEP 1: Create the Slide Master/Layout
		genObj.createSlideMaster(propsClone, newLayout)

		// STEP 2: Add it to layout defs
		this.slideLayouts.push(newLayout)

		// STEP 3: Add background (image data/path must be captured before `exportPresentation()` is called)
		if (propsClone.background || propsClone.bkgd) genObj.addBackgroundDefinition(propsClone.background, newLayout)

		// STEP 4: Add slideNumber to master slide (if any)
		if (newLayout._slideNumberProps && !this.masterSlide._slideNumberProps) this.masterSlide._slideNumberProps = newLayout._slideNumberProps
	}

	// HTML-TO-SLIDES METHODS

	/**
	 * Reproduces an HTML table as a PowerPoint table - including column widths, style, etc. - creates 1 or more slides as needed
	 * @param {string} eleId - table HTML element ID
	 * @param {TableToSlidesProps} options - generation options
	 */
	tableToSlides(eleId: string, options: TableToSlidesProps = {}): void {
		// @note `verbose` option is undocumented; used for verbose output of layout process
		genTable.genTableToSlides(
			this,
			eleId,
			options,
			options?.masterSlideName ? this.slideLayouts.filter(layout => layout._name === options.masterSlideName)[0] : null
		)
	}
}
