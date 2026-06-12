// Rasterise every page of a PDF to PNG using stock macOS frameworks (PDFKit +
// AppKit via the JXA ObjC bridge — no third-party dependencies).
//
//   osascript -l JavaScript _pdf2png.jxa.js <pdf> <outDir> [scale]
//
// Prints the page count on success. Used by powerpoint.test.js: PowerPoint
// 26.x's AppleScript `save as save as PNG` is a silent no-op (verified — it
// returns success and writes nothing, while `save as PDF` works), so the tier
// exports PDF from PowerPoint and rasterises per-slide PNGs here.
ObjC.import('Quartz')
ObjC.import('AppKit')
ObjC.import('Foundation')
function run(argv) {
	const pdfPath = argv[0], outDir = argv[1], scale = parseFloat(argv[2] || '2')
	const doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath($(pdfPath)))
	if (doc.isNil()) { return 'ERROR: cannot open ' + pdfPath }
	const n = doc.pageCount
	$.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(outDir), true, $(), $())
	for (let i = 0; i < n; i++) {
		const page = doc.pageAtIndex(i)
		const bounds = page.boundsForBox($.kPDFDisplayBoxMediaBox)
		const w = Math.ceil(bounds.size.width * scale), h = Math.ceil(bounds.size.height * scale)
		const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
			$(), w, h, 8, 4, true, false, $.NSCalibratedRGBColorSpace, 0, 0)
		$.NSGraphicsContext.saveGraphicsState
		const ctx = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep)
		$.NSGraphicsContext.setCurrentContext(ctx)
		const cg = ctx.CGContext
		$.CGContextSetRGBFillColor(cg, 1, 1, 1, 1)
		$.CGContextFillRect(cg, $.CGRectMake(0, 0, w, h))
		$.CGContextScaleCTM(cg, scale, scale)
		page.drawWithBoxToContext($.kPDFDisplayBoxMediaBox, cg)
		$.NSGraphicsContext.restoreGraphicsState
		const png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $())
		png.writeToFileAtomically($(outDir + '/slide' + (i + 1) + '.png'), true)
	}
	return String(n)
}
