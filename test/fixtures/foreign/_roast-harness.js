'use strict'
const U = require('/Users/sauhsoj/src/github/html-to-pptx-workspace/PptxGenJS/src/bld/utils.cjs.js')
const { parseCards, parseTimeline, parseQuote, parseTable, parseColumns, parseBadges, parseCallout, extractThemeFromCSS } = U

const out = (label, v) => console.log('### ' + label + '\n' + JSON.stringify(v, (k, val) => k === '_el' ? undefined : val, 1))

// ── 1. Bootstrap 5 cards ──────────────────────────────────────────────
const bs5cards = `
<div class="container">
 <div class="row row-cols-1 row-cols-md-3 g-4">
  <div class="col-md-4">
   <div class="card h-100">
    <div class="card-body">
     <h5 class="card-title">Fast Setup</h5>
     <p class="card-text">Get running in minutes with sensible defaults.</p>
     <span class="badge text-bg-primary">New</span>
    </div>
   </div>
  </div>
  <div class="col-md-4">
   <div class="card h-100">
    <div class="card-body">
     <h5 class="card-title">Secure</h5>
     <p class="card-text">Encryption at rest and in transit.</p>
    </div>
   </div>
  </div>
  <div class="col-md-4">
   <div class="card h-100">
    <div class="card-body">
     <h5 class="card-title">Scalable</h5>
     <p class="card-text">From one user to one million.</p>
    </div>
   </div>
  </div>
 </div>
</div>`
out('1a parseCards(bootstrap5)', parseCards(bs5cards))

const bs5listgroup = `
<ul class="list-group">
  <li class="list-group-item d-flex justify-content-between align-items-center">Inbox<span class="badge text-bg-primary rounded-pill">14</span></li>
  <li class="list-group-item d-flex justify-content-between align-items-center">Drafts<span class="badge text-bg-secondary rounded-pill">2</span></li>
</ul>`
out('1b parseCards(bootstrap list-group)', parseCards(bs5listgroup))
out('1b parseBadges(bootstrap list-group)', parseBadges(bs5listgroup))

const bs5quote = `
<figure>
  <blockquote class="blockquote"><p>A well-known quote, contained in a blockquote element.</p></blockquote>
  <figcaption class="blockquote-footer">Someone famous in <cite title="Source Title">Source Title</cite></figcaption>
</figure>`
out('1c parseQuote(bootstrap blockquote+figcaption)', parseQuote(bs5quote))

// ── 2. Tailwind UI-style cards (utility soup only) ────────────────────
// 2a: REAL emitted Tailwind — classes only, CSS in external sheet (not in the HTML)
const twReal = `
<div class="grid grid-cols-3 gap-6">
  <div class="rounded-xl shadow p-6 bg-white">
    <h3 class="text-lg font-semibold text-gray-900">Analytics</h3>
    <p class="mt-2 text-sm text-gray-500">Real-time dashboards for every team.</p>
  </div>
  <div class="rounded-xl shadow p-6 bg-white">
    <h3 class="text-lg font-semibold text-gray-900">Automation</h3>
    <p class="mt-2 text-sm text-gray-500">Trigger workflows without writing code.</p>
  </div>
  <div class="rounded-xl shadow p-6 bg-white">
    <h3 class="text-lg font-semibold text-gray-900">Reports</h3>
    <p class="mt-2 text-sm text-gray-500">Export and schedule weekly summaries.</p>
  </div>
</div>`
out('2a parseCards(tailwind classes-only, no grid class match path = literal "grid" token)', parseCards(twReal))

// 2a-flex: same but flex container (no "grid" token to get lucky on)
const twFlex = twReal.replace('class="grid grid-cols-3 gap-6"', 'class="flex gap-6"')
out('2a-flex parseCards(tailwind flex utility, no stylesheet)', parseCards(twFlex))

// 2b: grid-template-columns path — Tailwind utilities included as a <style> block
const twWithSheet = `<style>
.tw-wrap{display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:1.5rem}
</style>
<div class="tw-wrap">
  <div class="rounded-xl shadow p-6 bg-white">
    <h3 class="text-lg font-semibold">Analytics</h3>
    <p class="mt-2 text-sm">Real-time dashboards for every team.</p>
  </div>
  <div class="rounded-xl shadow p-6 bg-white">
    <h3 class="text-lg font-semibold">Automation</h3>
    <p class="mt-2 text-sm">Trigger workflows without writing code.</p>
  </div>
</div>`
out('2b parseCards(grid-template-columns repeat(3,minmax(0,1fr)) via <style>)', parseCards(twWithSheet))

// 2c: inline-style grid (the only style source the parser claims to fully support)
const twInline = `
<div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:24px">
  <div class="rounded-xl shadow p-6 bg-white"><h3 class="text-lg font-semibold">Analytics</h3><p class="mt-2 text-sm">Real-time dashboards.</p></div>
  <div class="rounded-xl shadow p-6 bg-white"><h3 class="text-lg font-semibold">Automation</h3><p class="mt-2 text-sm">No-code workflows.</p></div>
</div>`
out('2c parseCards(inline grid-template-columns)', parseCards(twInline))

// ── 3. Material/MUI ───────────────────────────────────────────────────
const mui = `
<div class="MuiGrid-root MuiGrid-container css-1d3bbye">
  <div class="MuiGrid-root MuiGrid-item MuiGrid-grid-xs-4 css-15j76c0">
    <div class="MuiPaper-root MuiPaper-elevation1 MuiCard-root css-bhp9pd">
      <div class="MuiCardContent-root css-46bh2p">
        <h5 class="MuiTypography-root MuiTypography-h5 css-ag7rrr">Word of the Day</h5>
        <p class="MuiTypography-root MuiTypography-body2 css-yb0lig">well meaning and kindly. a benevolent smile.</p>
        <div class="MuiChip-root MuiChip-filled MuiChip-colorPrimary css-1u59dh2"><span class="MuiChip-label">adjective</span></div>
      </div>
    </div>
  </div>
  <div class="MuiGrid-root MuiGrid-item MuiGrid-grid-xs-4">
    <div class="MuiPaper-root MuiCard-root">
      <div class="MuiCardContent-root">
        <h5 class="MuiTypography-root MuiTypography-h5">Second Card</h5>
        <p class="MuiTypography-root MuiTypography-body2">Another body of text here.</p>
      </div>
    </div>
  </div>
</div>`
out('3 parseCards(MUI)', parseCards(mui))
out('3 parseBadges(MuiChip)', parseBadges(mui))

// ── 4. Foreign timelines ──────────────────────────────────────────────
const bsTimeline = `
<ul class="timeline">
  <li class="timeline-inverted"><div class="timeline-panel"><div class="timeline-heading"><h4>9:00 Kickoff</h4></div><div class="timeline-body"><p>Team standup and goals.</p></div></div></li>
  <li><div class="timeline-panel"><div class="timeline-heading"><h4>11:30 Review</h4></div><div class="timeline-body"><p>Design review session.</p></div></div></li>
</ul>`
out('4a parseTimeline(bootstrap ul.timeline>li)', parseTimeline(bsTimeline))

const olSteps = `
<ol class="steps">
  <li><time datetime="2024-01-15">Jan 15</time> Project kickoff with stakeholders</li>
  <li><time datetime="2024-03-01">Mar 1</time> Beta release to internal teams</li>
  <li><time datetime="2024-06-30">Jun 30</time> General availability</li>
</ol>`
out('4b parseTimeline(ol + <time datetime>)', parseTimeline(olSteps))

const deTimeline = `
<div class="ablauf">
  <div class="punkt">7:00 Uhr Frühstück im Hotel</div>
  <div class="punkt">9:30 Uhr Abfahrt zum Flughafen</div>
</div>`
out('4c parseTimeline(German "7:00 Uhr")', parseTimeline(deTimeline))

const jaTimeline = `
<div class="schedule">
  <div class="row">午前7時 朝食</div>
  <div class="row">午前9時 出発</div>
  <div class="row">正午 昼食会</div>
</div>`
out('4d parseTimeline(Japanese 午前7時)', parseTimeline(jaTimeline))

// ── 5. Quotes ─────────────────────────────────────────────────────────
const specQuote = `
<figure>
  <blockquote><p>The future is already here — it's just not evenly distributed.</p></blockquote>
  <figcaption>—William Gibson</figcaption>
</figure>`
out('5a parseQuote(HTML-spec figure/blockquote/figcaption)', parseQuote(specQuote))

const qTag = `<p>As she said, <q cite="https://example.com">we choose to go to the moon</q>, and the room went quiet.</p>`
out('5b parseQuote(q tag)', parseQuote(qTag))

const cjkQuote = `
<blockquote>「学びて思わざれば則ち罔し」<footer>― 孔子『論語』</footer></blockquote>`
out('5c parseQuote(CJK 「」 + ― attribution in footer)', parseQuote(cjkQuote))

// ── 6. Tables ─────────────────────────────────────────────────────────
const bsTable = `
<table class="table table-striped">
  <thead><tr><th scope="col">#</th><th scope="col">Product</th><th scope="col" colspan="2">Q1 / Q2</th></tr></thead>
  <tbody>
    <tr><th scope="row">1</th><td>Widgets</td><td>120</td><td>180</td></tr>
    <tr><th scope="row">2</th><td>Gadgets</td><td>95</td><td>110</td></tr>
  </tbody>
</table>`
out('6 parseTable(bootstrap striped + scope + colspan)', parseTable(bsTable))

// ── 7. Theme extraction ───────────────────────────────────────────────
const bsRoot = `:root{
  --bs-blue:#0d6efd; --bs-primary:#0d6efd; --bs-secondary:#6c757d; --bs-success:#198754;
  --bs-danger:#dc3545; --bs-warning:#ffc107; --bs-info:#0dcaf0;
  --bs-body-color:#212529; --bs-body-bg:#fff; --bs-border-color:#dee2e6;
  --bs-body-font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}`
const t1 = extractThemeFromCSS(bsRoot)
out('7a extractTheme(Bootstrap :root --bs-*)', { presetName: t1.presetName, bg: t1.bg, text: t1.text, accent: t1.accent, font: t1.font, matchedVars: Object.keys(t1.vars).length })

const mdTokens = `:root{
  --md-sys-color-primary:#6750a4; --md-sys-color-on-primary:#ffffff;
  --md-sys-color-surface:#fef7ff; --md-sys-color-on-surface:#1d1b20;
  --md-sys-color-error:#b3261e;
}`
const t2 = extractThemeFromCSS(mdTokens)
out('7b extractTheme(Material --md-sys-color-*)', { presetName: t2.presetName, bg: t2.bg, text: t2.text, accent: t2.accent })

const plainCss = `body{background:#fafafa;color:#222;font-family:Georgia,serif} h1{color:#0a58ca}`
const t3 = extractThemeFromCSS(plainCss)
out('7c extractTheme(plain body{} no custom props)', { presetName: t3.presetName, bg: t3.bg, text: t3.text, accent: t3.accent, font: t3.font })

const lightVars = `:root{ --bg:#ffffff; --text:#111111; --primary:#0d6efd; }`
const t4 = extractThemeFromCSS(lightVars)
out('7d extractTheme(partial LIGHT vars, default preset=dark)', { presetName: t4.presetName, bg: t4.bg, text: t4.text, accent: t4.accent, textMuted: t4.textMuted, neutral1: t4.neutral1, surface: t4.surface, surfaceRaised: t4.surfaceRaised, cardFill: t4.cardFill, cardLine: t4.cardLine })

// non-:root scope?
const scopedVars = `.theme-ocean{ --bg:#e0f2fe; --primary:#0369a1; }`
const t5 = extractThemeFromCSS(scopedVars)
out('7e extractTheme(vars under .theme-ocean, not :root)', { presetName: t5.presetName, bg: t5.bg, accent: t5.accent })

// ── 8. parseBadges / parseCallout on Bootstrap alerts + badge variants ─
const bsAlert = `
<div class="alert alert-warning d-flex align-items-center" role="alert">
  <svg class="bi flex-shrink-0 me-2" role="img" aria-label="Warning:"><use xlink:href="#exclamation-triangle-fill"/></svg>
  <div>Heads up — your trial expires in 3 days.</div>
</div>
<span class="badge text-bg-primary">Primary</span>
<span class="badge rounded-pill text-bg-danger">99+</span>`
out('8a parseCallout(bootstrap .alert.alert-warning)', parseCallout(bsAlert))
out('8b parseBadges(bootstrap badge variants)', parseBadges(bsAlert))
// substring false positives
const fp = `<div class="vintage">Vintage wines</div><div class="caterpillar">Caterpillar Inc</div><div class="tag-along">tag-along</div><div class="heritage">Heritage Museum</div>`
out('8c parseBadges(false-positive probe: vintage/caterpillar/heritage)', parseBadges(fp))

// ── 9. Adversarial structure ──────────────────────────────────────────
const titleBelow = `
<div class="features-grid" style="display:grid;grid-template-columns:1fr 1fr">
  <div><p>Encrypted end to end with rotating keys for every session.</p><h3>Security</h3></div>
  <div><p>Sub-millisecond responses from a global edge network.</p><h3>Speed</h3></div>
</div>`
out('9a parseCards(title BELOW description)', parseCards(titleBelow))

const rtl = `
<div dir="rtl" style="display:grid;grid-template-columns:1fr 1fr">
  <div class="card"><h3 class="card-title">الأمان</h3><p class="card-text">تشفير كامل لجميع البيانات أثناء النقل والتخزين.</p></div>
  <div class="card"><h3 class="card-title">السرعة</h3><p class="card-text">استجابة فورية من شبكة عالمية موزعة.</p></div>
</div>`
out('9b parseCards(RTL Arabic)', parseCards(rtl))

const ulCards = `
<ul class="features" style="display:grid;grid-template-columns:repeat(3,1fr);list-style:none">
  <li><h3>Backups</h3><p>Hourly snapshots kept for 30 days.</p></li>
  <li><h3>Monitoring</h3><p>Alerts before users notice.</p></li>
  <li><h3>Support</h3><p>Humans answer in under an hour.</p></li>
</ul>`
out('9c parseCards(ul/li card grid)', parseCards(ulCards))

const ariaHeading = `
<div style="display:grid;grid-template-columns:1fr 1fr">
  <div><div role="heading" aria-level="3">Integrations</div><p>Connect to 200+ tools out of the box and keep your data flowing everywhere it needs to go.</p></div>
  <div><div role="heading" aria-level="3">Permissions</div><p>Granular role-based access for every workspace member with audit trails.</p></div>
</div>`
out('9d parseCards(div[role=heading])', parseCards(ariaHeading))

// ── 10. parseColumns on flexbox two-column, no col classes ────────────
const flexCols = `
<div style="display:flex;gap:32px">
  <div style="flex:1"><h2>Before</h2><p>Manual exports every Friday afternoon.</p></div>
  <div style="flex:1"><h2>After</h2><p>Automated sync every fifteen minutes.</p></div>
</div>`
out('10 parseColumns(flexbox, no col classes)', parseColumns(flexCols))
out('10 parseColumns(bootstrap .row > .col-md-6)', parseColumns(`<div class="row"><div class="col-md-6"><p>Left half</p></div><div class="col-md-6"><p>Right half</p></div></div>`))
