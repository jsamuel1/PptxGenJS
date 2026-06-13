'use strict'
const path = '/Users/sauhsoj/src/github/html-to-pptx-workspace/PptxGenJS'
let Pptx
try { Pptx = require(path + '/dist/pptxgen.cjs.js') } catch (e) { console.error('dist load fail:', e.message); process.exit(1) }
const pptx = new Pptx()
const slide = pptx.addSlide()

// LIGHT theme: white card on a light deck
slide.addCard({ x: 0.5, y: 0.5, w: 3, h: 2, fill: 'FFFFFF', title: 'Quarterly Goals', description: 'Ship v2 by June.', icon: '★', badge: { text: 'NEW' } })
// Bootstrap-warning-like light callout fill
slide.addCallout('Heads up — trial expires soon', { x: 4, y: 0.5, w: 3, h: 0.6, fill: 'FFF3CD' })
// Defaults only (no fill at all)
slide.addCard({ x: 0.5, y: 3, w: 3, h: 2, title: 'Default Card', description: 'No options given.' })

function describe (obj, depth = 0) {
  const pad = '  '.repeat(depth)
  const t = obj._type
  if (t === 'text') {
    const txt = Array.isArray(obj.text) ? obj.text.map(r => r.text).join('') : obj.text
    console.log(`${pad}text "${String(txt).slice(0, 30)}" color=${obj.options.color} fontSize=${obj.options.fontSize}`)
  } else if (obj.options && obj.options.fill) {
    console.log(`${pad}shape fill=${JSON.stringify(obj.options.fill)} line=${JSON.stringify(obj.options.line || null)}`)
  } else {
    console.log(`${pad}${t}`)
  }
  const kids = obj._grpObjects || []
  for (const k of kids) describe(k, depth + 1)
}
for (const o of slide._slideObjects) describe(o)
