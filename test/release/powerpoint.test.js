'use strict'

// Real-render verification via Microsoft PowerPoint (macOS).
// Spec: docs/features/feature-powerpoint-render-verification.md
//
// Generates a showcase deck (one slide per major feature) with the freshly
// built library, opens it in installed Microsoft PowerPoint via AppleScript,
// asserts the open succeeds (repair prompt ⇒ AppleEvent timeout ⇒ failure),
// asserts PowerPoint's live slide count matches what was authored, exports a
// PDF (PowerPoint 26.x's `save as PNG` is a silent no-op — see _pdf2png.jxa.js),
// rasterises one PNG per page and asserts each is non-trivial, then closes the
// presentation (never quitting the app — a developer may be using it).
//
// Gate semantics (loud skips, never silent):
//   * CI / GITHUB_ACTIONS set (without RUNNER_HAS_POWERPOINT=1) → SKIP
//   * non-macOS → SKIP
//   * macOS without PowerPoint installed → SKIP; REQUIRE_POWERPOINT=1 → FAIL
//   * AppleEvent timeout (-1712) with the process running → FAIL with the
//     "modal dialog is blocking PowerPoint" diagnostic
//   * Automation permission denied (-1743) → FAIL with the System Settings steps
//
// Runs two ways:
//   * `npm run test:ppt` — standalone (builds first so src/bld is current)
//   * as part of `node test/release/_runner.js` (npm run release-test)

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const PPT_APP = '/Applications/Microsoft PowerPoint.app'
const TIER = 'powerpoint-render'
const MIN_PNG_BYTES = 10 * 1024

function skipError (reason) {
	return Object.assign(new Error(reason), { skip: true })
}

// Returns null (run the tier) or throws a skip/failure per the gate semantics.
function gateCheck () {
	const onCI = !!(process.env.CI || process.env.GITHUB_ACTIONS)
	if (onCI && !process.env.RUNNER_HAS_POWERPOINT) {
		throw skipError('SKIP (CI): real-render tier requires Microsoft PowerPoint on a macOS runner (self-hosted runners opt in via RUNNER_HAS_POWERPOINT=1)')
	}
	if (process.platform !== 'darwin') {
		throw skipError('SKIP (platform): real-render tier requires macOS with Microsoft PowerPoint (platform=' + process.platform + ')')
	}
	if (!fs.existsSync(PPT_APP)) {
		const msg = 'Microsoft PowerPoint is not installed at ' + PPT_APP
		if (process.env.REQUIRE_POWERPOINT) throw new Error('FAIL (REQUIRE_POWERPOINT=1): ' + msg)
		throw skipError('SKIP (no PowerPoint): ' + msg)
	}
}

// 1×1 px PNG for the picture-fill slide (same fixture the schema suite uses).
const PX_PNG = 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// One slide per major feature. Every slide gets a solid background and real
// content so a successful render compresses to a non-trivial PNG (>10 KB) —
// a blank/failed render produces tiny files.
async function buildShowcaseDeck (outPath) {
	const PptxGenJS = require(path.join(REPO_ROOT, 'src', 'bld', 'pptxgen.cjs.js'))
	const { codeRuns } = require(path.join(REPO_ROOT, 'src', 'bld', 'utils.cjs.js'))
	const pres = new PptxGenJS()
	let authored = 0
	const slide = (bg) => { authored++; const s = pres.addSlide(); s.background = { color: bg }; return s }

	// 1. Text + fit
	let s = slide('1A1A24')
	s.addText('Render Verification — text & fit', { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 28, bold: true, color: 'FFFFFF' })
	s.addText('fit:shrink — this long sentence must scale down to stay inside its fixed box without overflowing the shape bounds.', { x: 0.5, y: 1.5, w: 4, h: 1, fit: 'shrink', color: 'E4E4ED', fill: '26263A' })
	s.addText('fit:resize box', { x: 5.5, y: 1.5, w: 3.5, h: 0.6, fit: 'resize', color: 'E4E4ED', fill: '26263A' })

	// 2. Fills: gradient + pattern + picture
	s = slide('F4F4F8')
	s.addText('Fills: gradient / pattern / picture', { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, color: '1A1A24' })
	s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.4, w: 2.8, h: 2.4, fill: { type: 'gradient', direction: 'horizontal', stops: [{ position: 0, color: '7C3AED' }, { position: 100, color: '38BDF8' }] } })
	s.addShape(pres.shapes.RECTANGLE, { x: 3.6, y: 1.4, w: 2.8, h: 2.4, fill: { type: 'pattern', preset: 'ltUpDiag', foreColor: '7C3AED', backColor: '1A1A24' } })
	s.addShape(pres.shapes.RECTANGLE, { x: 6.7, y: 1.4, w: 2.8, h: 2.4, fill: { type: 'image', data: PX_PNG, sizing: 'tile' } })

	// 3. Effects: shadow + glow
	s = slide('10101A')
	s.addText('Effects: shadow / glow', { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, color: 'FFFFFF' })
	s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 1, y: 1.6, w: 3.4, h: 2, fill: '26263A', shadow: { type: 'outer', blur: 10, offset: 3, angle: 270, color: '000000', opacity: 0.5 } })
	s.addShape(pres.shapes.OVAL, { x: 5.4, y: 1.6, w: 3.2, h: 2, fill: '7C3AED', glow: { size: 8, color: '38BDF8', opacity: 0.6 } })

	// 4. Table
	s = slide('FFFFFF')
	s.addText('Table', { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, color: '1A1A24' })
	s.addTable([
		[{ text: 'Feature', options: { bold: true, fill: '7C3AED', color: 'FFFFFF' } }, { text: 'Status', options: { bold: true, fill: '7C3AED', color: 'FFFFFF' } }],
		['gradient fill', 'rendered'],
		['pattern fill', 'rendered'],
		['picture fill', 'rendered'],
	], { x: 0.5, y: 1.3, w: 9, colW: [6, 3], border: { type: 'solid', pt: 1, color: 'CBCBD6' } })

	// 5. Chart
	s = slide('F4F4F8')
	s.addText('Chart', { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, color: '1A1A24' })
	s.addChart(pres.ChartType.bar, [
		{ name: 'Series A', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [4.3, 2.5, 3.5, 4.5] },
		{ name: 'Series B', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [2.4, 4.4, 1.8, 2.8] },
	], { x: 0.5, y: 1.2, w: 9, h: 3.8, showLegend: true })

	// 6. Card
	s = slide('1A1A24')
	s.addText('Card', { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, color: 'FFFFFF' })
	s.addCard({ x: 0.7, y: 1.3, w: 4, h: 2.6, title: 'Render check', description: 'addCard() with icon, accent bar and badge.', icon: '✓', fill: '26263A', accentBar: { color: '7C3AED' }, badge: { text: 'PASS' } })
	s.addCard({ x: 5.2, y: 1.3, w: 4, h: 2.6, title: 'Second card', description: 'Sibling card for layout sanity.', icon: '★', fill: '26263A' })

	// 7. Code block
	s = slide('10101A')
	s.addText('Code block', { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, color: 'FFFFFF' })
	const runs = codeRuns('function greet(name) {\n  return `hello ${name}`\n}\nconsole.log(greet("pptx"))', { lineNumbers: true, highlightLines: [2] })
	s.addText(runs, { x: 0.5, y: 1.3, w: 9, h: 3, fill: '16161F', fontFace: 'Courier New', fontSize: 12, valign: 'top' })

	// 8. Transition + animation markers
	s = slide('F4F4F8')
	s.transition = { type: 'fade' }
	s.addText('Transition (fade) + animations', { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, color: '1A1A24' })
	s.addText('appear', { x: 0.5, y: 1.5, w: 2.5, h: 0.8, fill: '7C3AED', color: 'FFFFFF', align: 'center', animation: { type: 'appear' } })
	s.addText('fadeIn', { x: 3.5, y: 1.5, w: 2.5, h: 0.8, fill: '38BDF8', color: 'FFFFFF', align: 'center', animation: { type: 'fadeIn' } })
	s.addText('flyIn', { x: 6.5, y: 1.5, w: 2.5, h: 0.8, fill: '1A1A24', color: 'FFFFFF', align: 'center', animation: { type: 'flyIn', direction: 'left' } })

	await pres.writeFile({ fileName: outPath })
	return authored
}

// Open → count → export PDF → close.
// NOTE: the spec's `save … as save as PNG` is a silent no-op on PowerPoint
// 26.x (returns success, writes nothing — verified against /tmp and $HOME
// targets and the app's sandbox container). `save as PDF` works, so the tier
// exports PDF here and rasterises per-slide PNGs with _pdf2png.jxa.js.
function ask (script, timeoutMs) {
	const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8', timeout: timeoutMs })
	return { ok: r.status === 0, out: String(r.stdout || '').trim(), err: String(r.stderr || '') }
}

function sleepSec (s) { spawnSync('sleep', [String(s)]) }

function modalError (pptxName) {
	const running = spawnSync('pgrep', ['-x', 'Microsoft PowerPoint']).status === 0
	if (running) {
		return new Error('PowerPoint is not answering AppleEvents (-1712) while the process is running — something modal is blocking: a PENDING macOS Automation consent prompt (a pending prompt hangs AppleEvents without returning -1743 — check for a permission dialog and grant it), a first-run welcome / sign-in dialog, or a REPAIR PROMPT for ' + pptxName + '. Open PowerPoint manually, dismiss all dialogs, and re-run. A repair prompt means this tier caught a real corruption.')
	}
	return new Error('AppleEvent timeout and PowerPoint is not running — launch failed.')
}

// The open is handed to LaunchServices (`open -a`) rather than an AppleScript
// `open` — the AppleEvent variant intermittently stalls past its timeout or
// gets dropped outright on a busy PowerPoint (observed). The presentation is
// then polled for by name; a real repair/modal dialog blocks ALL AppleEvents,
// so the polls distinguish a slow open (presentation appears, polls answer)
// from corruption (polls hang or the presentation never appears).
function drivePowerPoint (pptxPath, pdfPath) {
	const presName = path.basename(pptxPath)
	const o = spawnSync('open', ['-a', 'Microsoft PowerPoint', pptxPath], { encoding: 'utf8', timeout: 60 * 1000 })
	if (o.status !== 0) throw new Error('`open -a "Microsoft PowerPoint"` failed: ' + String(o.stderr || '').slice(0, 300))
	let appeared = false
	let pollsAnswered = false
	const deadline = Date.now() + 120 * 1000
	while (Date.now() < deadline) {
		const q = ask('tell application "Microsoft PowerPoint" to return name of every presentation', 15 * 1000)
		if (q.ok) {
			pollsAnswered = true
			if (q.out.split(', ').includes(presName)) { appeared = true; break }
		} else if (q.err.includes('-1743')) {
			throw new Error('macOS Automation permission denied (-1743). Grant it once: System Settings → Privacy & Security → Automation → enable "Microsoft PowerPoint" under your terminal app, then re-run.')
		}
		sleepSec(3)
	}
	if (!appeared) {
		if (!pollsAnswered) throw modalError(presName)
		throw new Error('PowerPoint is answering AppleEvents but never opened ' + presName + ' within 120s — possible silent rejection of the file (deck: ' + pptxPath + ')')
	}
	const work = ask([
		'with timeout of 240 seconds',
		'  tell application "Microsoft PowerPoint"',
		'    set pres to presentation "' + presName + '"',
		'    set n to count of slides of pres',
		'    save pres in (POSIX file "' + pdfPath + '") as save as PDF',
		'    close pres saving no',
		'    return n',
		'  end tell',
		'end timeout',
	].join('\n'), 270 * 1000)
	if (!work.ok) {
		if (work.err.includes('-1712')) throw modalError(presName)
		throw new Error('osascript failed during count/export/close: ' + work.err.slice(0, 600))
	}
	const n = parseInt(work.out, 10)
	if (!Number.isFinite(n)) throw new Error('osascript succeeded but returned a non-numeric slide count: ' + JSON.stringify(work.out))
	return n
}

function listPngs (dir) {
	const out = []
	if (!fs.existsSync(dir)) return out
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) out.push(...listPngs(full))
		else if (/\.png$/i.test(entry.name)) out.push({ name: entry.name, path: full, size: fs.statSync(full).size })
	}
	return out
}

// Rasterise the exported PDF to one PNG per page (stock PDFKit via JXA).
// Returns the PDF's page count as reported by PDFKit.
function rasterisePdf (pdfPath, pngDir) {
	const renderer = path.join(__dirname, '_pdf2png.jxa.js')
	const r = spawnSync('osascript', ['-l', 'JavaScript', renderer, pdfPath, pngDir, '2'], { encoding: 'utf8', timeout: 120 * 1000 })
	const out = String(r.stdout || '').trim()
	if (r.status !== 0 || out.startsWith('ERROR')) {
		throw new Error('PDF rasterisation failed (status=' + r.status + '): ' + (out || String(r.stderr || '').slice(0, 400)))
	}
	const n = parseInt(out, 10)
	if (!Number.isFinite(n)) throw new Error('rasteriser returned a non-numeric page count: ' + JSON.stringify(out))
	return n
}

// The expensive work runs at most once; both cases share the result.
let renderPromise = null
function renderOnce () {
	if (!renderPromise) {
		renderPromise = (async () => {
			gateCheck()
			const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pptxgenjs-ppt-render-'))
			const pptxPath = path.join(workDir, 'showcase.pptx')
			const pdfPath = path.join(workDir, 'showcase.pdf')
			const pngDir = path.join(workDir, 'png-out')
			const authored = await buildShowcaseDeck(pptxPath)
			console.log('    showcase deck: ' + authored + ' slides → ' + pptxPath)
			const counted = drivePowerPoint(pptxPath, pdfPath)
			if (!fs.existsSync(pdfPath)) throw new Error('PowerPoint reported success but wrote no PDF at ' + pdfPath)
			const pdfPages = rasterisePdf(pdfPath, pngDir)
			const pngs = listPngs(pngDir)
			return { workDir, authored, counted, pdfPages, pngs }
		})()
	}
	return renderPromise
}

const cases = [
	{
		name: TIER + ': deck opens in PowerPoint without repair; live slide count matches authored',
		fn: async () => {
			const r = await renderOnce()
			if (r.counted !== r.authored) {
				throw new Error('PowerPoint reports ' + r.counted + ' slides but ' + r.authored + ' were authored (deck: ' + r.workDir + ')')
			}
		},
	},
	{
		name: TIER + ': PDF export + rasterisation yield one non-trivial image per slide (>' + (MIN_PNG_BYTES / 1024) + 'KB)',
		fn: async () => {
			const r = await renderOnce()
			if (r.pdfPages !== r.authored) {
				throw new Error('exported PDF has ' + r.pdfPages + ' pages but ' + r.authored + ' slides were authored (deck: ' + r.workDir + ')')
			}
			if (r.pngs.length !== r.authored) {
				throw new Error('expected ' + r.authored + ' rasterised PNGs, found ' + r.pngs.length + ' in ' + r.workDir + '/png-out')
			}
			const tiny = r.pngs.filter(p => p.size < MIN_PNG_BYTES)
			if (tiny.length > 0) {
				throw new Error('blank/failed render suspected — PNGs under ' + MIN_PNG_BYTES + ' bytes: ' + tiny.map(p => p.name + '=' + p.size + 'B').join(', ') + ' (dir: ' + r.workDir + '/png-out)')
			}
		},
	},
]

async function teardown () {
	// Remove the temp dir only when everything rendered; keep it for debugging
	// when a case failed (the error messages embed the path).
	if (!renderPromise) return
	try {
		const r = await renderPromise
		if (r && r.workDir) fs.rmSync(r.workDir, { recursive: true, force: true })
	} catch (_) { /* failed runs keep their artifacts */ }
}

module.exports = { cases, teardown }

// Standalone mode: `npm run test:ppt` → node test/release/powerpoint.test.js
if (require.main === module) {
	;(async () => {
		console.log('Running PowerPoint real-render tier')
		let failed = 0
		const skipped = []
		for (const c of cases) {
			try {
				await c.fn()
				console.log('  ok ' + c.name)
			} catch (e) {
				if (e && e.skip) {
					skipped.push(c.name)
					console.log('  SKIP ' + c.name + ' — ' + e.message)
				} else {
					failed++
					console.log('  FAIL ' + c.name + ': ' + e.message)
				}
			}
		}
		await teardown()
		const total = cases.length
		console.log('\nPassed: ' + (total - failed - skipped.length) + '  Failed: ' + failed + '  Skipped: ' + skipped.length)
		if (skipped.length > 0) console.log('(' + skipped.length + ' case(s) skipped in tier: ' + TIER + ')')
		process.exit(failed > 0 ? 1 : 0)
	})().catch(e => {
		console.error('PowerPoint tier crashed: ' + (e.stack || e))
		process.exit(1)
	})
}
