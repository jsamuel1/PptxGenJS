/* PptxGenJS 4.1.7 @ 2026-06-08T16:40:13.958Z */
/**
 * PptxGenJS — Theme Extraction utility (docs/feature-theme-extraction.md)
 *
 * Parses CSS `:root { --var: value; }` custom properties and maps known variable-name
 * patterns to a theme palette (background/accent/text/font + an extended colour set).
 * Pure, dependency-free, regex-based parsing — no DOM and no browser required, so it runs
 * in Node.js. This is an OPTIONAL utility (imported from `@jsamuel1/pptxgenjs/utils`), not
 * part of the main `PptxGenJS` class, keeping the core library focused on OOXML generation.
 */
/** Built-in dark preset (matches docs/feature-theme-extraction.md). */
const DARK_PRESET = {
    bg: '121218',
    bgSecondary: '1A1A24',
    accent: '7C3AED',
    accentSoft: 'A78BFA',
    text: 'E4E4ED',
    textSecondary: '8A8A9A',
    font: 'Inter',
    sky: '38BDF8',
    green: '10B981',
    orange: 'FF9900',
    red: 'EF4444',
};
/** Built-in light preset. */
const LIGHT_PRESET = {
    bg: 'FFFFFF',
    bgSecondary: 'F4F4F7',
    accent: '7C3AED',
    accentSoft: 'A78BFA',
    text: '121218',
    textSecondary: '5A5A6A',
    font: 'Inter',
    sky: '0EA5E9',
    green: '059669',
    orange: 'EA580C',
    red: 'DC2626',
};
/**
 * Exact CSS-variable-name → theme-slot map. Names are matched exactly (NOT by substring) so
 * `--bg` and `--bg-card` resolve to different slots. Mirrors the table in the feature spec.
 */
const VAR_TO_SLOT = {
    // bg
    bg: 'bg', 'color-bg': 'bg', background: 'bg', 'bg-deep': 'bg',
    // bgSecondary
    'bg-card': 'bgSecondary', card: 'bgSecondary', 'color-bg-secondary': 'bgSecondary', 'bg-surface': 'bgSecondary',
    // accent
    purple: 'accent', accent: 'accent', 'color-primary': 'accent', primary: 'accent',
    // accentSoft
    'purple-soft': 'accentSoft', 'accent-soft': 'accentSoft', 'color-primary-light': 'accentSoft',
    // text
    white: 'text', text: 'text', 'color-text': 'text', foreground: 'text',
    // textSecondary
    gray: 'textSecondary', muted: 'textSecondary', 'color-text-secondary': 'textSecondary',
    // sky
    sky: 'sky', blue: 'sky', info: 'sky',
    // green
    green: 'green', success: 'green',
    // orange
    orange: 'orange', warning: 'orange',
    // red
    red: 'red', error: 'red', danger: 'red',
    // font
    font: 'font', 'font-family': 'font',
};
/** Slots whose value is a colour (vs. a font family) — used to decide value normalisation. */
const COLOR_SLOTS = new Set(['bg', 'bgSecondary', 'accent', 'accentSoft', 'text', 'textSecondary', 'sky', 'green', 'orange', 'red']);
/** Normalise a colour value to a 6-digit hex (no `#`). 3-digit hex is expanded; non-hex returned as-is. */
function normalizeColor$1(raw) {
    let v = raw.trim().replace(/^#/, '');
    // Expand 3-digit shorthand (#abc -> AABBCC)
    if (/^[0-9a-fA-F]{3}$/.test(v))
        v = v.split('').map(c => c + c).join('');
    // Uppercase 6/8-digit hex for consistency with the rest of the library
    if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v))
        return v.toUpperCase();
    // rgb()/hsl()/named colours are returned trimmed but unconverted (documented limitation)
    return v;
}
/** Normalise a font-family value: strip surrounding quotes and take the first family. */
function normalizeFont(raw) {
    const first = raw.split(',')[0].trim();
    return first.replace(/^['"]/, '').replace(/['"]$/, '').trim();
}
/**
 * Extract `--name: value;` custom-property declarations from CSS text.
 * Prefers declarations inside `:root { … }` blocks; if none are found, falls back to scanning
 * the entire string (covers inline/style-block custom props without a `:root` selector).
 * @returns map of bare variable name (no leading `--`) -> value
 */
function parseCssVars(css) {
    const out = {};
    const declRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
    const collect = (text) => {
        let m;
        while ((m = declRegex.exec(text)) !== null) {
            out[m[1].trim().toLowerCase()] = m[2].trim();
        }
    };
    // 1) :root blocks (there can be more than one)
    const rootRegex = /:root\s*\{([^}]*)\}/g;
    let rootMatch;
    let foundRoot = false;
    while ((rootMatch = rootRegex.exec(css)) !== null) {
        foundRoot = true;
        declRegex.lastIndex = 0;
        collect(rootMatch[1]);
    }
    // 2) Fallback: no :root vars — scan the whole CSS for custom-prop declarations
    if (!foundRoot) {
        declRegex.lastIndex = 0;
        collect(css);
    }
    return out;
}
/**
 * Parse CSS `:root` custom properties into a theme palette, falling back to a preset for any
 * slot not present in the CSS.
 * @param {string} css - CSS text (or any text containing `--name: value;` declarations)
 * @param {ExtractThemeOptions} [options] - presets + which preset to fall back to
 * @returns {ThemePalette} the resolved palette (always complete — preset fills the gaps)
 * @example
 * const theme = extractThemeFromCSS(':root{ --bg:#121218; --purple:#7C3AED; }')
 * // => { bg: '121218', accent: '7C3AED', ... }
 */
function extractThemeFromCSS(css, options = {}) {
    const presets = Object.assign({ dark: DARK_PRESET, light: LIGHT_PRESET }, (options.presets || {}));
    const presetName = options.defaultPreset || 'dark';
    const base = presets[presetName] || DARK_PRESET;
    // Start from a complete palette (dark) then layer the chosen preset so the result is always whole
    const theme = Object.assign(Object.assign({}, DARK_PRESET), base);
    if (typeof css === 'string' && css.length > 0) {
        const vars = parseCssVars(css);
        Object.keys(vars).forEach(name => {
            const slot = VAR_TO_SLOT[name];
            if (!slot)
                return;
            const value = vars[name];
            theme[slot] = slot === 'font' || !COLOR_SLOTS.has(slot) ? normalizeFont(value) : normalizeColor$1(value);
        });
    }
    return theme;
}

/** Bézier circle/quarter-arc constant. */
const KAPPA = 0.5522847498307936;
// ──────────────────────────────────────────────────────────────────────────────────────────
// Colour helpers
// ──────────────────────────────────────────────────────────────────────────────────────────
/** Normalise a colour value to 6-digit hex (no `#`). 3-digit hex expanded; non-hex returned trimmed. */
function normalizeColor(raw) {
    let v = (raw || '').trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(v))
        v = v.split('').map(c => c + c).join('');
    if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v))
        return v.slice(0, 6).toUpperCase();
    // rgb()/hsl()/named colours: pass through trimmed (documented limitation)
    return v;
}
/**
 * Lex a path `d` string into `{ cmd, args }` segments. Arc (`A`/`a`) flag arguments
 * (large-arc / sweep) are read as single `0`/`1` digits so compact forms like `a25 25 0 016 6`
 * parse correctly; all other numbers are read with a full float scanner (exponents, leading
 * sign, `.5.5` runs).
 */
function tokenizeSvgPath(d) {
    const segs = [];
    const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
    let m;
    while ((m = re.exec(d)) !== null) {
        const cmd = m[1];
        const args = cmd === 'Z' || cmd === 'z' ? [] : scanNumbers(m[2], cmd);
        segs.push({ cmd, args });
    }
    return segs;
}
/** Scan a numeric argument string into a flat number list (arc-flag aware when `cmd` is A/a). */
function scanNumbers(str, cmd) {
    const isArc = cmd === 'A' || cmd === 'a';
    const nums = [];
    let i = 0;
    const n = str.length;
    const skipSep = () => { while (i < n && /[\s,]/.test(str[i]))
        i++; };
    const readNumber = () => {
        skipSep();
        const start = i;
        if (str[i] === '+' || str[i] === '-')
            i++;
        let sawDigit = false;
        while (i < n && str[i] >= '0' && str[i] <= '9') {
            i++;
            sawDigit = true;
        }
        if (str[i] === '.') {
            i++;
            while (i < n && str[i] >= '0' && str[i] <= '9') {
                i++;
                sawDigit = true;
            }
        }
        if (sawDigit && (str[i] === 'e' || str[i] === 'E')) {
            i++;
            if (str[i] === '+' || str[i] === '-')
                i++;
            while (i < n && str[i] >= '0' && str[i] <= '9')
                i++;
        }
        return sawDigit ? parseFloat(str.slice(start, i)) : NaN;
    };
    const readFlag = () => {
        skipSep();
        if (str[i] === '0' || str[i] === '1') {
            const f = str[i] === '1' ? 1 : 0;
            i++;
            return f;
        }
        return readNumber();
    };
    if (isArc) {
        for (;;) {
            skipSep();
            if (i >= n)
                break;
            const before = i;
            const rx = readNumber();
            const ry = readNumber();
            const rot = readNumber();
            const laf = readFlag();
            const sf = readFlag();
            const x = readNumber();
            const y = readNumber();
            if (i === before || [rx, ry, rot, x, y].some(v => isNaN(v)))
                break;
            nums.push(rx, ry, rot, laf, sf, x, y);
        }
    }
    else {
        for (;;) {
            skipSep();
            if (i >= n)
                break;
            const before = i;
            const v = readNumber();
            if (i === before || isNaN(v))
                break;
            nums.push(v);
        }
    }
    return nums;
}
// ──────────────────────────────────────────────────────────────────────────────────────────
// Arc → cubic conversion (endpoint → centre parameterisation, per the SVG 1.1 implementation notes)
// ──────────────────────────────────────────────────────────────────────────────────────────
/** Convert one elliptical arc to ≤4 cubic-bézier segments. Returns an array of `[c1x,c1y,c2x,c2y,x,y]`. */
function arcToCubics(x1, y1, rx, ry, xAxisRotDeg, largeArc, sweep, x2, y2) {
    // Degenerate radius → straight line
    if (rx === 0 || ry === 0)
        return [[x1, y1, x2, y2, x2, y2]];
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const phi = (xAxisRotDeg * Math.PI) / 180;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    // Step 1: compute (x1', y1')
    const dx2 = (x1 - x2) / 2;
    const dy2 = (y1 - y2) / 2;
    const x1p = cosPhi * dx2 + sinPhi * dy2;
    const y1p = -sinPhi * dx2 + cosPhi * dy2;
    // Correct out-of-range radii
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
        const s = Math.sqrt(lambda);
        rx *= s;
        ry *= s;
    }
    // Step 2: compute (cx', cy')
    const rx2 = rx * rx;
    const ry2 = ry * ry;
    const x1p2 = x1p * x1p;
    const y1p2 = y1p * y1p;
    let num = rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2;
    const den = rx2 * y1p2 + ry2 * x1p2;
    if (num < 0)
        num = 0;
    let co = Math.sqrt(num / den);
    if (largeArc === sweep)
        co = -co;
    const cxp = (co * rx * y1p) / ry;
    const cyp = (-co * ry * x1p) / rx;
    // Step 3: compute (cx, cy)
    const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
    // Step 4: compute start angle + sweep angle
    const angle = (ux, uy, vx, vy) => {
        const dot = ux * vx + uy * vy;
        const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
        let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
        if (ux * vy - uy * vx < 0)
            a = -a;
        return a;
    };
    const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dTheta > 0)
        dTheta -= 2 * Math.PI;
    else if (sweep && dTheta < 0)
        dTheta += 2 * Math.PI;
    // Split into ≤4 segments (≤90° each) and emit a cubic per segment
    const segCount = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
    const delta = dTheta / segCount;
    const t = (4 / 3) * Math.tan(delta / 4);
    const out = [];
    let th = theta1;
    for (let s = 0; s < segCount; s++) {
        const th2 = th + delta;
        const cosTh = Math.cos(th);
        const sinTh = Math.sin(th);
        const cosTh2 = Math.cos(th2);
        const sinTh2 = Math.sin(th2);
        // Ellipse point + derivative, mapped through rotation
        const map = (ct, st) => [
            cx + cosPhi * rx * ct - sinPhi * ry * st,
            cy + sinPhi * rx * ct + cosPhi * ry * st,
        ];
        const e1 = map(cosTh, sinTh);
        const e2 = map(cosTh2, sinTh2);
        const d1x = -rx * cosPhi * sinTh - ry * sinPhi * cosTh;
        const d1y = -rx * sinPhi * sinTh + ry * cosPhi * cosTh;
        const d2x = -rx * cosPhi * sinTh2 - ry * sinPhi * cosTh2;
        const d2y = -rx * sinPhi * sinTh2 + ry * cosPhi * cosTh2;
        out.push([
            e1[0] + t * d1x, e1[1] + t * d1y,
            e2[0] - t * d2x, e2[1] - t * d2y,
            e2[0], e2[1],
        ]);
        th = th2;
    }
    return out;
}
// ──────────────────────────────────────────────────────────────────────────────────────────
// Path normalisation → absolute M/L/C/Q/Z
// ──────────────────────────────────────────────────────────────────────────────────────────
/** Round to 3 dp and stringify (drops trailing zeros). */
function fmt(n) {
    if (!isFinite(n))
        n = 0;
    return String(Math.round(n * 1000) / 1000);
}
/**
 * Fold any SVG path `d` into absolute `M`/`L`/`C`/`Q`/`Z` only:
 * `H`/`V`→`L`, `S`→`C`, `T`→`Q` (reflecting the previous control point), `A`→cubics,
 * and relative (lowercase) commands → absolute (tracked against the pen position).
 */
function normalizeSvgPath(d) {
    const segs = tokenizeSvgPath(d);
    let cx = 0, cy = 0; // current pen
    let sx = 0, sy = 0; // subpath start (for Z)
    let pcx = 0, pcy = 0; // previous control point (for S/T reflection)
    let prevCmd = '';
    const out = [];
    const emitM = (x, y) => { out.push('M' + fmt(x) + ' ' + fmt(y)); cx = x; cy = y; sx = x; sy = y; };
    const emitL = (x, y) => { out.push('L' + fmt(x) + ' ' + fmt(y)); cx = x; cy = y; };
    const emitC = (x1, y1, x2, y2, x, y) => {
        out.push('C' + fmt(x1) + ' ' + fmt(y1) + ' ' + fmt(x2) + ' ' + fmt(y2) + ' ' + fmt(x) + ' ' + fmt(y));
        pcx = x2;
        pcy = y2;
        cx = x;
        cy = y;
    };
    const emitQ = (x1, y1, x, y) => {
        out.push('Q' + fmt(x1) + ' ' + fmt(y1) + ' ' + fmt(x) + ' ' + fmt(y));
        pcx = x1;
        pcy = y1;
        cx = x;
        cy = y;
    };
    for (const seg of segs) {
        const rel = seg.cmd === seg.cmd.toLowerCase();
        const C = seg.cmd.toUpperCase();
        const a = seg.args;
        const ox = () => (rel ? cx : 0);
        const oy = () => (rel ? cy : 0);
        if (C === 'M') {
            for (let i = 0; i + 1 < a.length; i += 2) {
                const x = a[i] + ox();
                const y = a[i + 1] + oy();
                if (i === 0)
                    emitM(x, y);
                else
                    emitL(x, y); // implicit lineto for extra pairs
            }
        }
        else if (C === 'L') {
            for (let i = 0; i + 1 < a.length; i += 2)
                emitL(a[i] + ox(), a[i + 1] + oy());
        }
        else if (C === 'H') {
            for (let i = 0; i < a.length; i++)
                emitL(a[i] + (rel ? cx : 0), cy);
        }
        else if (C === 'V') {
            for (let i = 0; i < a.length; i++)
                emitL(cx, a[i] + (rel ? cy : 0));
        }
        else if (C === 'C') {
            for (let i = 0; i + 5 < a.length; i += 6) {
                emitC(a[i] + ox(), a[i + 1] + oy(), a[i + 2] + ox(), a[i + 3] + oy(), a[i + 4] + ox(), a[i + 5] + oy());
            }
        }
        else if (C === 'S') {
            for (let i = 0; i + 3 < a.length; i += 4) {
                const reflect = prevCmd === 'C' || prevCmd === 'S';
                const x1 = reflect ? 2 * cx - pcx : cx;
                const y1 = reflect ? 2 * cy - pcy : cy;
                emitC(x1, y1, a[i] + ox(), a[i + 1] + oy(), a[i + 2] + ox(), a[i + 3] + oy());
                prevCmd = 'S';
            }
            continue;
        }
        else if (C === 'Q') {
            for (let i = 0; i + 3 < a.length; i += 4)
                emitQ(a[i] + ox(), a[i + 1] + oy(), a[i + 2] + ox(), a[i + 3] + oy());
        }
        else if (C === 'T') {
            for (let i = 0; i + 1 < a.length; i += 2) {
                const reflect = prevCmd === 'Q' || prevCmd === 'T';
                const x1 = reflect ? 2 * cx - pcx : cx;
                const y1 = reflect ? 2 * cy - pcy : cy;
                emitQ(x1, y1, a[i] + ox(), a[i + 1] + oy());
                prevCmd = 'T';
            }
            continue;
        }
        else if (C === 'A') {
            for (let i = 0; i + 6 < a.length; i += 7) {
                const ex = a[i + 5] + ox();
                const ey = a[i + 6] + oy();
                const cubics = arcToCubics(cx, cy, a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], ex, ey);
                for (const cb of cubics)
                    emitC(cb[0], cb[1], cb[2], cb[3], cb[4], cb[5]);
            }
        }
        else if (C === 'Z') {
            out.push('Z');
            cx = sx;
            cy = sy;
        }
        prevCmd = C;
    }
    return out.join('');
}
// ──────────────────────────────────────────────────────────────────────────────────────────
// Primitives → path
// ──────────────────────────────────────────────────────────────────────────────────────────
/** Build an absolute `M/L/C/Z` path for an SVG primitive element. Returns '' for unsupported tags. */
function primitiveToPath(tag, attrs) {
    const num = (k, dflt = 0) => {
        const v = parseFloat(attrs[k]);
        return isFinite(v) ? v : dflt;
    };
    const t = tag.toLowerCase();
    if (t === 'circle' || t === 'ellipse') {
        const cx = num('cx');
        const cy = num('cy');
        const rx = t === 'circle' ? num('r') : num('rx');
        const ry = t === 'circle' ? num('r') : num('ry');
        if (rx <= 0 || ry <= 0)
            return '';
        const kx = rx * KAPPA;
        const ky = ry * KAPPA;
        return ('M' + fmt(cx + rx) + ' ' + fmt(cy) +
            'C' + fmt(cx + rx) + ' ' + fmt(cy + ky) + ' ' + fmt(cx + kx) + ' ' + fmt(cy + ry) + ' ' + fmt(cx) + ' ' + fmt(cy + ry) +
            'C' + fmt(cx - kx) + ' ' + fmt(cy + ry) + ' ' + fmt(cx - rx) + ' ' + fmt(cy + ky) + ' ' + fmt(cx - rx) + ' ' + fmt(cy) +
            'C' + fmt(cx - rx) + ' ' + fmt(cy - ky) + ' ' + fmt(cx - kx) + ' ' + fmt(cy - ry) + ' ' + fmt(cx) + ' ' + fmt(cy - ry) +
            'C' + fmt(cx + kx) + ' ' + fmt(cy - ry) + ' ' + fmt(cx + rx) + ' ' + fmt(cy - ky) + ' ' + fmt(cx + rx) + ' ' + fmt(cy) +
            'Z');
    }
    if (t === 'rect') {
        const x = num('x');
        const y = num('y');
        const w = num('width');
        const h = num('height');
        if (w <= 0 || h <= 0)
            return '';
        let rx = attrs.rx !== undefined ? num('rx') : NaN;
        let ry = attrs.ry !== undefined ? num('ry') : NaN;
        if (isNaN(rx) && !isNaN(ry))
            rx = ry;
        if (isNaN(ry) && !isNaN(rx))
            ry = rx;
        if (isNaN(rx))
            rx = 0;
        if (isNaN(ry))
            ry = 0;
        rx = Math.min(rx, w / 2);
        ry = Math.min(ry, h / 2);
        if (rx <= 0 || ry <= 0) {
            return 'M' + fmt(x) + ' ' + fmt(y) + 'L' + fmt(x + w) + ' ' + fmt(y) + 'L' + fmt(x + w) + ' ' + fmt(y + h) + 'L' + fmt(x) + ' ' + fmt(y + h) + 'Z';
        }
        const kx = rx * KAPPA;
        const ky = ry * KAPPA;
        return ('M' + fmt(x + rx) + ' ' + fmt(y) +
            'L' + fmt(x + w - rx) + ' ' + fmt(y) +
            'C' + fmt(x + w - rx + kx) + ' ' + fmt(y) + ' ' + fmt(x + w) + ' ' + fmt(y + ry - ky) + ' ' + fmt(x + w) + ' ' + fmt(y + ry) +
            'L' + fmt(x + w) + ' ' + fmt(y + h - ry) +
            'C' + fmt(x + w) + ' ' + fmt(y + h - ry + ky) + ' ' + fmt(x + w - rx + kx) + ' ' + fmt(y + h) + ' ' + fmt(x + w - rx) + ' ' + fmt(y + h) +
            'L' + fmt(x + rx) + ' ' + fmt(y + h) +
            'C' + fmt(x + rx - kx) + ' ' + fmt(y + h) + ' ' + fmt(x) + ' ' + fmt(y + h - ry + ky) + ' ' + fmt(x) + ' ' + fmt(y + h - ry) +
            'L' + fmt(x) + ' ' + fmt(y + ry) +
            'C' + fmt(x) + ' ' + fmt(y + ry - ky) + ' ' + fmt(x + rx - kx) + ' ' + fmt(y) + ' ' + fmt(x + rx) + ' ' + fmt(y) +
            'Z');
    }
    if (t === 'line') {
        return 'M' + fmt(num('x1')) + ' ' + fmt(num('y1')) + 'L' + fmt(num('x2')) + ' ' + fmt(num('y2'));
    }
    if (t === 'polyline' || t === 'polygon') {
        const pts = parsePoints(attrs.points || '');
        if (pts.length < 2)
            return '';
        let d = 'M' + fmt(pts[0][0]) + ' ' + fmt(pts[0][1]);
        for (let i = 1; i < pts.length; i++)
            d += 'L' + fmt(pts[i][0]) + ' ' + fmt(pts[i][1]);
        if (t === 'polygon')
            d += 'Z';
        return d;
    }
    return '';
}
/** Parse an SVG `points` attribute into `[x,y]` pairs. */
function parsePoints(raw) {
    const nums = (raw.match(/-?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?/g) || []).map(parseFloat);
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2)
        pts.push([nums[i], nums[i + 1]]);
    return pts;
}
// ──────────────────────────────────────────────────────────────────────────────────────────
// SVG element / attribute / gradient extraction
// ──────────────────────────────────────────────────────────────────────────────────────────
/** Extract attributes from an element's opening-tag attribute string. */
function parseAttrs(attrStr) {
    const out = {};
    const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(attrStr)) !== null)
        out[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : m[4];
    return out;
}
/** Read a CSS-like `style="a:b;c:d"` attribute into a property map. */
function parseStyle(style) {
    const out = {};
    for (const decl of (style || '').split(';')) {
        const ix = decl.indexOf(':');
        if (ix > 0)
            out[decl.slice(0, ix).trim().toLowerCase()] = decl.slice(ix + 1).trim();
    }
    return out;
}
/** Collect `<linearGradient>`/`<radialGradient>` defs by `id` (matched by id attr, not tag name). */
function collectGradients(markup) {
    const out = {};
    const re = /<(linearGradient|radialGradient)\b([^>]*)>([\s\S]*?)<\/(?:linearGradient|radialGradient)>/gi;
    let m;
    while ((m = re.exec(markup)) !== null) {
        const attrs = parseAttrs(m[2]);
        const id = attrs.id;
        if (!id)
            continue;
        const body = m[3];
        const stopRe = /<stop\b([^>]*?)\/?>/gi;
        const stops = [];
        let s;
        const rawStops = [];
        while ((s = stopRe.exec(body)) !== null) {
            const sa = parseAttrs(s[1]);
            const style = parseStyle(sa.style || '');
            const color = style['stop-color'] || sa['stop-color'] || '#000000';
            const offRaw = sa.offset;
            let offset;
            if (offRaw !== undefined) {
                offset = offRaw.indexOf('%') !== -1 ? parseFloat(offRaw) / 100 : parseFloat(offRaw);
            }
            const opRaw = style['stop-opacity'] || sa['stop-opacity'];
            const opacity = opRaw !== undefined ? parseFloat(opRaw) : undefined;
            rawStops.push({ offset, color, opacity });
        }
        rawStops.forEach((rs, i) => {
            const off = rs.offset !== undefined && isFinite(rs.offset) ? rs.offset : (rawStops.length > 1 ? i / (rawStops.length - 1) : 0);
            const stop = { position: Math.round(Math.max(0, Math.min(1, off)) * 100), color: normalizeColor(rs.color) };
            if (rs.opacity !== undefined && isFinite(rs.opacity) && rs.opacity < 1)
                stop.transparency = Math.round((1 - rs.opacity) * 100);
            stops.push(stop);
        });
        // Direction from the x1/y1 → x2/y2 vector (default horizontal: 0,0 → 1,0)
        const x1 = attrs.x1 !== undefined ? parseFloat(attrs.x1) : 0;
        const y1 = attrs.y1 !== undefined ? parseFloat(attrs.y1) : 0;
        const x2 = attrs.x2 !== undefined ? parseFloat(attrs.x2) : 1;
        const y2 = attrs.y2 !== undefined ? parseFloat(attrs.y2) : 0;
        let deg = Math.round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
        deg = ((deg % 360) + 360) % 360;
        out[id] = { stops, direction: deg };
    }
    return out;
}
/** Resolve a `fill`/`stroke` value (with inheritance) into a solid hex, a gradient, or `none`. */
function resolvePaint(value, gradients, fallback, currentColor) {
    const v = value !== undefined ? value.trim() : undefined;
    if (v === 'none' || v === 'transparent')
        return { kind: 'none' };
    if (v !== undefined && /^url\(/i.test(v)) {
        const idM = v.match(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/i);
        const id = idM ? idM[1] : undefined;
        if (id && gradients[id]) {
            const g = gradients[id];
            return { kind: 'gradient', gradId: id, grad: { type: 'gradient', direction: g.direction, stops: g.stops } };
        }
        // Unresolvable reference → fall back to a solid colour
        return { kind: 'solid', hex: fallback ? normalizeColor(fallback) : '000000' };
    }
    if (v === 'currentColor')
        return { kind: 'solid', hex: normalizeColor(currentColor || fallback || '000000') };
    if (v !== undefined && v.length > 0)
        return { kind: 'solid', hex: normalizeColor(v) };
    // Not set at this element and not inherited → fallback
    return { kind: 'solid', hex: fallback ? normalizeColor(fallback) : '000000' };
}
// ──────────────────────────────────────────────────────────────────────────────────────────
// parseSvg — the public entry
// ──────────────────────────────────────────────────────────────────────────────────────────
/**
 * Parse an SVG string into normalised, paint-resolved `SvgPart`s ready to drop into
 * `slide.addShape('custGeom', { svgPath: { d, viewBox }, fill, line })`.
 *
 * @param markup - a raw SVG string
 * @param opts - optional `viewBox` override + `defaultFill`
 * @returns one `SvgPart` per consecutive run of equally-painted elements (document order)
 */
function parseSvg(markup, opts = {}) {
    if (typeof markup !== 'string' || markup.length === 0)
        return [];
    // 1) viewBox (opts override wins)
    let vb = { w: 0, h: 0 };
    const vbM = markup.match(/<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i);
    if (vbM) {
        const p = vbM[1].split(/[\s,]+/).map(parseFloat);
        if (p.length >= 4)
            vb = { w: p[2], h: p[3] };
    }
    if (opts.viewBox)
        vb = { w: opts.viewBox.w, h: opts.viewBox.h };
    // 2) root <svg> inherited paint
    const svgTagM = markup.match(/<svg\b([^>]*)>/i);
    const rootAttrs = svgTagM ? parseAttrs(svgTagM[1]) : {};
    const rootStyle = parseStyle(rootAttrs.style || '');
    const rootFill = rootStyle.fill || rootAttrs.fill;
    const rootStroke = rootStyle.stroke || rootAttrs.stroke;
    const rootStrokeW = rootStyle['stroke-width'] || rootAttrs['stroke-width'];
    // 3) gradient defs (collected from the WHOLE markup, including <defs>)
    const gradients = collectGradients(markup);
    // 4) drawable walk in document order — strip <defs> so template/clip shapes aren't rendered
    const drawable = markup.replace(/<defs\b[^>]*>[\s\S]*?<\/defs>/gi, '');
    const elRe = /<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*?)\/?>/gi;
    const fallback = opts.defaultFill;
    const raws = [];
    let em;
    while ((em = elRe.exec(drawable)) !== null) {
        const tag = em[1].toLowerCase();
        const attrs = parseAttrs(em[2]);
        const style = parseStyle(attrs.style || '');
        const get = (k) => style[k] !== undefined ? style[k] : attrs[k];
        // path d, or primitive → d
        const d = tag === 'path'
            ? normalizeSvgPath(attrs.d || '')
            : normalizeSvgPath(primitiveToPath(tag, attrs));
        if (!d)
            continue;
        // inherited fill/stroke
        const fillVal = get('fill') !== undefined ? get('fill') : rootFill;
        const strokeVal = get('stroke') !== undefined ? get('stroke') : rootStroke;
        const strokeWVal = get('stroke-width') !== undefined ? get('stroke-width') : rootStrokeW;
        const currentColor = normalizeColor((fillVal && fillVal !== 'currentColor' ? fillVal : strokeVal) || fallback || '000000');
        const fillPaint = resolvePaint(fillVal, gradients, fallback, currentColor);
        const strokePaint = resolvePaint(strokeVal !== undefined ? strokeVal : 'none', gradients, fallback, currentColor);
        const mode = fillPaint.kind === 'none' && strokePaint.kind !== 'none' ? 'stroke' : 'fill';
        const strokeWidth = strokeWVal !== undefined && isFinite(parseFloat(strokeWVal)) ? parseFloat(strokeWVal) : undefined;
        const opRaw = get('fill-opacity') !== undefined ? get('fill-opacity') : get('opacity');
        const op = opRaw !== undefined && isFinite(parseFloat(opRaw)) ? parseFloat(opRaw) : undefined;
        raws.push({
            d,
            paint: fillPaint,
            stroke: strokePaint.kind === 'solid' ? strokePaint.hex : undefined,
            strokeWidth,
            opacity: op !== undefined && op < 1 ? op : undefined,
            mode,
        });
    }
    // 5) group consecutive equally-painted elements
    const keyOf = (r) => {
        var _a, _b;
        const paintKey = r.paint.kind === 'gradient' ? 'grad:' + r.paint.gradId : r.paint.kind === 'none' ? 'none' : 'solid:' + r.paint.hex;
        return r.mode + '|' + paintKey + '|' + (r.stroke || '') + '|' + ((_a = r.strokeWidth) !== null && _a !== void 0 ? _a : '') + '|' + ((_b = r.opacity) !== null && _b !== void 0 ? _b : '');
    };
    const parts = [];
    let cur = null;
    for (const r of raws) {
        const k = keyOf(r);
        if (cur && cur.key === k) {
            cur.ds.push(r.d);
        }
        else {
            if (cur)
                parts.push(finalizePart(cur.raw, cur.ds.join(' '), vb, fallback));
            cur = { key: k, raw: r, ds: [r.d] };
        }
    }
    if (cur)
        parts.push(finalizePart(cur.raw, cur.ds.join(' '), vb, fallback));
    return parts;
}
/** Build the public `SvgPart` from an accumulated group. */
function finalizePart(raw, d, vb, fallback) {
    let fill;
    if (raw.paint.kind === 'gradient' && raw.paint.grad)
        fill = raw.paint.grad;
    else if (raw.paint.kind === 'solid' && raw.paint.hex)
        fill = raw.paint.hex;
    else
        fill = raw.stroke || (fallback ? normalizeColor(fallback) : '000000'); // 'none' fill → keep a valid hex
    const part = { d, viewBox: { w: vb.w, h: vb.h }, fill, mode: raw.mode };
    if (raw.stroke)
        part.stroke = raw.stroke;
    if (raw.strokeWidth !== undefined)
        part.strokeWidth = raw.strokeWidth;
    if (raw.opacity !== undefined)
        part.opacity = raw.opacity;
    return part;
}

export { extractThemeFromCSS, parseSvg };
