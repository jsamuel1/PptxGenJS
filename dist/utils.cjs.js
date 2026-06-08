/* PptxGenJS 4.1.7 @ 2026-06-08T17:56:42.070Z */
'use strict';

/**
 * PptxGenJS — Theme Extraction utility (docs/feature-theme-extraction.md)
 *
 * Parses CSS `:root { --var: value; }` custom properties and maps known variable-name
 * patterns to a theme palette (background/accent/text/font + an extended colour set).
 * Pure, dependency-free, regex-based parsing — no DOM and no browser required, so it runs
 * in Node.js. This is an OPTIONAL utility (imported from `@jsamuel1/pptxgenjs/utils`), not
 * part of the main `PptxGenJS` class, keeping the core library focused on OOXML generation.
 *
 * v2 (converter-equivalence, docs/feature-enhancements-converter-gaps.md §3): adds
 * `rgb()`/`rgba()` parsing, `var()` resolution, derived colours (`cardLine`/`cardFill`/
 * `barStops`), an extended palette (`bgMid`/`bgLight`/`bgDeep`/`coral`/`gray100/300/500`),
 * a `forcePreset` override, and `presetName`/`vars` metadata. All additions are ADDITIVE and
 * default-on; the core slot mapping is unchanged.
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
    // Extended (converter-equivalence)
    bgMid: '1E1E2A',
    bgLight: '2A2A38',
    bgDeep: '0C0C12',
    coral: 'FB7185',
    gray100: 'E4E4ED',
    gray300: 'A0A0B0',
    gray500: '64646E',
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
    // Extended (converter-equivalence)
    bgMid: 'F0F0F4',
    bgLight: 'FAFAFC',
    bgDeep: 'E8E8EE',
    coral: 'F43F5E',
    gray100: '2A2A32',
    gray300: '5A5A6A',
    gray500: '8A8A9A',
};
/**
 * Exact CSS-variable-name → theme-slot map. Names are matched exactly (NOT by substring) so
 * `--bg` and `--bg-card` resolve to different slots. Mirrors the table in the feature spec.
 */
const VAR_TO_SLOT = {
    // bg
    bg: 'bg', 'color-bg': 'bg', background: 'bg',
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
    // extended (converter-equivalence)
    'bg-mid': 'bgMid',
    'bg-light': 'bgLight', 'bg-hover': 'bgLight',
    'bg-deep': 'bgDeep',
    coral: 'coral', 'secondary-accent': 'coral',
    'gray-100': 'gray100', 'gray-300': 'gray300', 'gray-500': 'gray500',
};
/** Slots whose value is a colour (vs. a font family) — used to decide value normalisation. */
const COLOR_SLOTS = new Set([
    'bg', 'bgSecondary', 'accent', 'accentSoft', 'text', 'textSecondary', 'sky', 'green', 'orange', 'red',
    'bgMid', 'bgLight', 'bgDeep', 'coral', 'gray100', 'gray300', 'gray500',
]);
/** Parse an `rgb()`/`rgba()` value to a 6-digit hex (upper-case, no `#`). Returns null on non-match. */
function rgbToHex(value) {
    const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m)
        return null;
    return [m[1], m[2], m[3]]
        .map(n => Math.min(255, Math.max(0, parseInt(n, 10))).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}
/** Resolve `var(--name)` references against the parsed vars map (bare-name keyed). Recursive with a depth cap (clamp-don't-crash on cyclic refs). */
function resolveVar(value, vars, depth = 0) {
    if (typeof value !== 'string' || depth > 16 || value.indexOf('var(') === -1)
        return value;
    const replaced = value.replace(/var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)/g, (_match, name) => {
        const v = vars[String(name).trim().toLowerCase()];
        return v !== undefined && v !== null ? v : '';
    });
    if (replaced === value)
        return replaced;
    return resolveVar(replaced, vars, depth + 1);
}
/** Normalise a colour value to a 6-digit hex (no `#`). 3-digit hex expanded; `rgb()/rgba()` parsed when enabled; otherwise returned trimmed. */
function normalizeColor$1(raw, parseRgb = true) {
    let v = raw.trim().replace(/^#/, '');
    // Expand 3-digit shorthand (#abc -> AABBCC)
    if (/^[0-9a-fA-F]{3}$/.test(v))
        v = v.split('').map(c => c + c).join('');
    // Uppercase 6/8-digit hex for consistency with the rest of the library
    if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v))
        return v.toUpperCase();
    // rgb()/rgba() → hex (converter-equivalence)
    if (parseRgb) {
        const hex = rgbToHex(raw);
        if (hex)
            return hex;
    }
    // hsl()/named colours are returned trimmed but unconverted (documented limitation)
    return v;
}
/** Mix two hex colours per channel: `round(a*(1-weight) + b*weight)` (weight is the SECOND colour's weight). Mirrors the converter's `mix`. */
function mixColors(a, b, weight) {
    const norm = (h) => {
        const x = normalizeColor$1(h);
        return /^[0-9A-F]{6}$/.test(x) ? x.match(/.{2}/g).map(p => parseInt(p, 16)) : null;
    };
    const pa = norm(a);
    const pb = norm(b);
    if (!pa || !pb) {
        const fallback = pa ? a : pb ? b : '000000';
        return normalizeColor$1(fallback);
    }
    return pa
        .map((v, i) => Math.round(v * (1 - weight) + pb[i] * weight).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}
/** Derive gradient-bar stops from the `--bar-gradient` var (≥2 `var()` refs → resolved colours), else `[accent, accentSoft, sky]`. */
function deriveBarStops(vars, palette, barVarName, resolveVarRefs, parseRgb) {
    const barKey = String(barVarName).replace(/^--/, '').toLowerCase();
    const barVal = vars[barKey] || '';
    const refs = [...barVal.matchAll(/var\(\s*--([\w-]+)\s*\)/g)].map(m => m[1]);
    if (refs.length >= 2) {
        const stops = refs
            .map(name => {
            let val = vars[String(name).trim().toLowerCase()] || '';
            if (resolveVarRefs)
                val = resolveVar(val, vars);
            return val ? normalizeColor$1(val, parseRgb) : '';
        })
            .filter(Boolean);
        if (stops.length >= 2)
            return stops;
    }
    return [palette.accent, palette.accentSoft, palette.sky];
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
 * slot not present in the CSS. v2 additionally resolves `var()` references, parses `rgb()/rgba()`,
 * computes derived colours (`cardLine`/`cardFill`/`barStops`), and attaches `presetName`/`vars`.
 * @param {string} css - CSS text (or any text containing `--name: value;` declarations)
 * @param {ExtractThemeOptions} [options] - presets, fallback, and the v2 converter-equivalence flags
 * @returns {ThemePalette} the resolved palette (always complete — preset fills the gaps)
 * @example
 * const theme = extractThemeFromCSS(':root{ --bg:#121218; --purple:#7C3AED; }')
 * // => { bg: '121218', accent: '7C3AED', cardLine: '301D54', barStops: [...], presetName: 'extracted', ... }
 */
function extractThemeFromCSS(css, options = {}) {
    const presets = Object.assign({ dark: DARK_PRESET, light: LIGHT_PRESET }, (options.presets || {}));
    const fallbackName = options.defaultPreset && presets[options.defaultPreset] ? options.defaultPreset : 'dark';
    const derivedColors = options.derivedColors !== false;
    const resolveVarRefs = options.resolveVarRefs !== false;
    const parseRgb = options.parseRgb !== false;
    const barGradientVar = options.barGradientVar || '--bar-gradient';
    const vars = (typeof css === 'string' && css.length > 0) ? parseCssVars(css) : {};
    let theme;
    let presetName;
    const forced = options.forcePreset;
    if (forced && presets[forced]) {
        // forcePreset: bypass CSS extraction, use the named preset only
        theme = Object.assign(Object.assign({}, DARK_PRESET), presets[forced]);
        presetName = forced;
    }
    else {
        // Start from a complete palette (dark) then layer the chosen fallback preset so the result is always whole
        const base = presets[fallbackName] || DARK_PRESET;
        theme = Object.assign(Object.assign({}, DARK_PRESET), base);
        let matched = 0;
        Object.keys(vars).forEach(name => {
            const slot = VAR_TO_SLOT[name];
            if (!slot)
                return;
            matched++;
            let value = vars[name];
            if (resolveVarRefs)
                value = resolveVar(value, vars);
            theme[slot] = slot === 'font' || !COLOR_SLOTS.has(slot) ? normalizeFont(value) : normalizeColor$1(value, parseRgb);
        });
        presetName = matched > 0 ? 'extracted' : fallbackName;
    }
    if (derivedColors) {
        theme.cardLine = mixColors(theme.accent, theme.bg, 0.72);
        theme.cardFill = mixColors(theme.bgMid, theme.bg, 0.4);
        theme.barStops = deriveBarStops(vars, theme, barGradientVar, resolveVarRefs, parseRgb);
    }
    theme.presetName = presetName;
    theme.vars = vars;
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
function parseAttrs$1(attrStr) {
    const out = {};
    const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(attrStr)) !== null)
        out[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : m[4];
    return out;
}
/** Read a CSS-like `style="a:b;c:d"` attribute into a property map. */
function parseStyle$1(style) {
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
        const attrs = parseAttrs$1(m[2]);
        const id = attrs.id;
        if (!id)
            continue;
        const body = m[3];
        const stopRe = /<stop\b([^>]*?)\/?>/gi;
        const stops = [];
        let s;
        const rawStops = [];
        while ((s = stopRe.exec(body)) !== null) {
            const sa = parseAttrs$1(s[1]);
            const style = parseStyle$1(sa.style || '');
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
    const rootAttrs = svgTagM ? parseAttrs$1(svgTagM[1]) : {};
    const rootStyle = parseStyle$1(rootAttrs.style || '');
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
        const attrs = parseAttrs$1(em[2]);
        const style = parseStyle$1(attrs.style || '');
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

/**
 * PptxGenJS — Generic Card-Structure parser (docs/feature-parse-card-structure.md)
 *
 * `parseCards()` turns an HTML card-grid (the kind every HTML-to-deck converter has to detect by
 * hand) into a list of `CardData` objects that spread directly into `slide.addCard()` v2. Detection
 * is STRUCTURE-driven, not class-name driven, so it works across framework naming conventions
 * (`cap-item`, `wf-card`, `feature-tile`, …): cards are found by a (configurable) class pattern, or
 * by a grid/flex container, then each card's icon / title / description / badge / colours are read
 * from its internal structure. An inline `<svg>` icon is handed to {@link parseSvg} so a multi-colour
 * logo survives as per-path `SvgPart`s.
 *
 * Pure, DEPENDENCY-FREE parsing — a tiny stack-based HTML tree-builder (no cheerio, no DOM, no
 * third-party library), mirroring `src/utils/parse-svg.ts` / `src/utils/extract-theme.ts`. This is an
 * OPTIONAL utility imported from `@jsamuel1/pptxgenjs/utils`; it emits NO OOXML and touches no core
 * code path.
 *
 * COLOUR SCOPE (this release): colours are read from INLINE `style="…"` only. The deeper CSS cascade
 * (class rules, `var()` against `:root`, browser computed styles) described in the spec is a
 * documented limitation tracked as a converter-gaps follow-up — it is NOT silently dropped.
 */
// ──────────────────────────────────────────────────────────────────────────────────────────
// Pattern defaults — tested against EACH class token, so a bare `card`/`grid` matches as well as
// `feature-card`/`cap-grid` (the `(?:^|-)` prefix). These cover every framework naming style in
// the spec's test cases.
// ──────────────────────────────────────────────────────────────────────────────────────────
const DEFAULT_CARD = /(?:^|-)(card|item|tile|cell)\b/;
const DEFAULT_CONTAINER = /(?:^|-)grid\b/;
const DEFAULT_EXCLUDE = /(?:^|-)(anim-right|product-anim|flow|feed-item)\b/;
const TITLE_PAT = /(?:^|-)(title|name|heading|head|label)\b/;
const DESC_PAT = /(?:^|-)(desc|text|body|caption|subtitle|sub|detail|blurb)\b/;
const BADGE_PAT = /(?:^|-)(badge|pill|tag|count|chip)\b/;
/** Void (self-terminating) HTML elements that never push onto the open-element stack. */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/** Extract `name="value"` attributes from an element's opening-tag inner string. */
function parseAttrs(attrStr) {
    const out = {};
    const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let m;
    while ((m = re.exec(attrStr)) !== null) {
        out[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : (m[5] || ''));
    }
    return out;
}
/** Read a CSS-like `style="a:b;c:d"` attribute into a property map (keys lowercased). */
function parseStyle(style) {
    const out = {};
    for (const decl of (style || '').split(';')) {
        const ix = decl.indexOf(':');
        if (ix > 0)
            out[decl.slice(0, ix).trim().toLowerCase()] = decl.slice(ix + 1).trim();
    }
    return out;
}
/** Make an element node from a tag name + opening-tag attribute string. */
function makeEl(tag, attrStr) {
    const attrs = parseAttrs(attrStr);
    const classes = (attrs.class || '').split(/\s+/).filter(Boolean);
    const style = parseStyle(attrs.style || '');
    return { tag: tag.toLowerCase(), attrs, classes, style, children: [], parent: null };
}
/** Find the index of the `>` that closes the tag starting at `lt`, respecting quoted attributes. */
function findTagEnd(html, lt) {
    let i = lt + 1;
    let q = null;
    const n = html.length;
    while (i < n) {
        const c = html[i];
        if (q) {
            if (c === q)
                q = null;
        }
        else if (c === '"' || c === "'")
            q = c;
        else if (c === '>')
            return i;
        i++;
    }
    return n;
}
/** Capture a full `<svg>…</svg>` subtree as a raw string. Returns `[raw, endIndexExclusive]`. */
function captureSvg(html, start) {
    const n = html.length;
    let depth = 0;
    let i = start;
    while (i < n) {
        const lower = html.slice(i, i + 6).toLowerCase();
        if (lower.startsWith('</svg')) {
            const gt = html.indexOf('>', i);
            const end = gt === -1 ? n : gt + 1;
            depth--;
            if (depth <= 0)
                return [html.slice(start, end), end];
            i = end;
        }
        else if (/^<svg[\s>/]/i.test(html.slice(i, i + 5))) {
            const gt = findTagEnd(html, i);
            const selfClose = html[gt - 1] === '/';
            if (selfClose) {
                if (depth === 0)
                    return [html.slice(start, gt + 1), gt + 1];
            }
            else
                depth++;
            i = (gt === -1 ? n : gt + 1);
        }
        else {
            i++;
        }
    }
    return [html.slice(start), n];
}
/** Parse an HTML string into a lightweight element tree (stack-based, error-tolerant). */
function buildTree(html) {
    const root = { tag: '', attrs: {}, classes: [], style: {}, children: [], parent: null };
    const stack = [root];
    const top = () => stack[stack.length - 1];
    const addChild = (node) => { node.parent = top(); top().children.push(node); };
    const addText = (raw) => {
        if (raw.length === 0)
            return;
        addChild({ tag: '#text', attrs: {}, classes: [], style: {}, children: [], parent: null, text: raw });
    };
    let i = 0;
    const n = html.length;
    while (i < n) {
        const lt = html.indexOf('<', i);
        if (lt === -1) {
            addText(html.slice(i));
            break;
        }
        if (lt > i)
            addText(html.slice(i, lt));
        // comment
        if (html.startsWith('<!--', lt)) {
            const e = html.indexOf('-->', lt + 4);
            i = e === -1 ? n : e + 3;
            continue;
        }
        // doctype / declaration / processing instruction
        if (html[lt + 1] === '!' || html[lt + 1] === '?') {
            const e = html.indexOf('>', lt);
            i = e === -1 ? n : e + 1;
            continue;
        }
        // inline <svg> — captured opaque and handed to parseSvg later
        if (/^<svg[\s>/]/i.test(html.slice(lt, lt + 5))) {
            const [raw, end] = captureSvg(html, lt);
            const svgTagM = raw.match(/^<svg\b([^>]*)>/i);
            const svg = makeEl('svg', svgTagM ? svgTagM[1] : '');
            svg.raw = raw;
            addChild(svg);
            i = end;
            continue;
        }
        // end tag
        if (html[lt + 1] === '/') {
            const e = html.indexOf('>', lt);
            const name = html.slice(lt + 2, e === -1 ? n : e).trim().toLowerCase();
            // pop until the matching open tag (tolerant of unclosed elements)
            for (let s = stack.length - 1; s >= 1; s--) {
                if (stack[s].tag === name) {
                    stack.length = s;
                    break;
                }
            }
            i = e === -1 ? n : e + 1;
            continue;
        }
        // start tag
        const e = findTagEnd(html, lt);
        const inner = html.slice(lt + 1, e);
        const mName = inner.match(/^([\w:-]+)/);
        if (!mName) {
            i = e + 1;
            continue;
        }
        const name = mName[1].toLowerCase();
        const attrStr = inner.slice(mName[1].length);
        const selfClose = inner.trimEnd().endsWith('/');
        const node = makeEl(name, attrStr);
        addChild(node);
        if (!selfClose && !VOID_TAGS.has(name))
            stack.push(node);
        i = e + 1;
    }
    return root;
}
// ──────────────────────────────────────────────────────────────────────────────────────────
// Tree helpers
// ──────────────────────────────────────────────────────────────────────────────────────────
/** All element (non-text) descendants of `node`, preorder. */
function elements(node, out = []) {
    for (const c of node.children) {
        if (c.tag === '#text')
            continue;
        out.push(c);
        elements(c, out);
    }
    return out;
}
/** Concatenated text of an element and its descendants (`<svg>` contributes nothing). */
function textOf(node) {
    if (node.tag === '#text')
        return node.text || '';
    if (node.tag === 'svg')
        return '';
    let s = '';
    for (const c of node.children)
        s += textOf(c);
    return s;
}
/** True when any class token of `el` matches `pat`. */
function classMatch(el, pat) {
    return el.classes.some(c => pat.test(c));
}
/** True when `a` is an ancestor of (or equal to) `b`. */
function isAncestorOrSelf(a, b) {
    let cur = b;
    while (cur) {
        if (cur === a)
            return true;
        cur = cur.parent;
    }
    return false;
}
/** True when `el` (or an ancestor) matches the exclude pattern. */
function isExcluded(el, pat) {
    let cur = el;
    while (cur) {
        if (cur.classes.length && classMatch(cur, pat))
            return true;
        cur = cur.parent;
    }
    return false;
}
/** First descendant element of `root` matching `pred`, preorder, skipping `skip` subtrees. */
function findFirst(root, pred, skip) {
    const stack = [...root.children].reverse().filter(c => c.tag !== '#text');
    while (stack.length) {
        const el = stack.pop();
        if (skip && skip.has(el))
            continue;
        if (pred(el))
            return el;
        const kids = el.children.filter(c => c.tag !== '#text');
        for (let k = kids.length - 1; k >= 0; k--)
            stack.push(kids[k]);
    }
    return null;
}
/** Is this class token a Font-Awesome marker (`fa`, `fas`, `far`, `fab`, … or `fa-*`)? */
function isFaClass(tok) {
    return /^fa[srlbdt]?$/.test(tok) || /^fa-/.test(tok);
}
/** Extract the first colour in a CSS value as 6-digit hex (no `#`); handles `#rgb`/`#rrggbb`/`rgb()`. */
function extractHex(v) {
    if (!v)
        return undefined;
    const hm = v.match(/#([0-9a-fA-F]{3,8})\b/);
    if (hm) {
        let h = hm[1];
        if (h.length === 3)
            h = h.split('').map(c => c + c).join('');
        return h.slice(0, 6).toUpperCase();
    }
    const rgb = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb) {
        const to2 = (s) => Math.max(0, Math.min(255, parseInt(s, 10))).toString(16).padStart(2, '0');
        return (to2(rgb[1]) + to2(rgb[2]) + to2(rgb[3])).toUpperCase();
    }
    return undefined;
}
/** Background colour of an element from its inline style. */
function bgOf(el) {
    return extractHex(el.style.background) || extractHex(el.style['background-color']);
}
/** Leading emoji (pictographic) cluster at the start of a string, if any. */
function leadingEmoji(text) {
    const t = text.trim();
    if (!t)
        return undefined;
    // Match a leading emoji / pictographic / symbol code point (incl. surrogate pairs + VS16/ZWJ runs).
    const m = t.match(/^(?:\p{Extended_Pictographic}(?:\u200D|\uFE0F)?)+/u);
    return m ? m[0] : undefined;
}
// ──────────────────────────────────────────────────────────────────────────────────────────
// Per-card structure analysis
// ──────────────────────────────────────────────────────────────────────────────────────────
/** Ordered "text blocks" of a card: leaf-most text-bearing elements, skipping `skip` subtrees + `<svg>`. */
function textBlocks(card, skip) {
    const out = [];
    const walk = (el) => {
        if (skip.has(el) || el.tag === 'svg')
            return;
        const childEls = el.children.filter(c => c.tag !== '#text' && !skip.has(c) && c.tag !== 'svg');
        const childWithText = childEls.filter(c => textOf(c).trim().length > 0);
        if (childWithText.length === 0) {
            const t = textOf(el).trim();
            if (t)
                out.push({ el, text: t });
        }
        else {
            for (const c of childWithText)
                walk(c);
        }
    };
    for (const c of card.children) {
        if (c.tag !== '#text')
            walk(c);
    }
    return out;
}
/** Build a `CardData` from a single card element. */
function analyzeCard(card, opts) {
    const skip = new Set();
    // ── icon ──────────────────────────────────────────────────────────────────────────────
    let icon;
    let iconEl = null;
    const svgEl = findFirst(card, e => e.tag === 'svg');
    if (svgEl) {
        iconEl = svgEl;
        skip.add(svgEl);
        const parts = parseSvg(svgEl.raw || '', opts.defaultFill ? { defaultFill: opts.defaultFill } : {});
        icon = { type: 'svg', parts };
    }
    else {
        const faEl = findFirst(card, e => (e.tag === 'i' || e.tag === 'span') && e.classes.some(isFaClass));
        if (faEl) {
            iconEl = faEl;
            skip.add(faEl);
            icon = { type: 'fontIcon', char: '', fontFace: 'Font Awesome 6 Free' };
        }
    }
    // ── badge ─────────────────────────────────────────────────────────────────────────────
    let badge;
    const badgeEl = findFirst(card, e => classMatch(e, BADGE_PAT) && textOf(e).trim().length > 0 && textOf(e).trim().length <= 24, skip);
    if (badgeEl) {
        skip.add(badgeEl);
        const bt = textOf(badgeEl).trim();
        const bc = bgOf(badgeEl);
        badge = { text: bt, color: bc || '' };
    }
    // ── title ─────────────────────────────────────────────────────────────────────────────
    const titleEl = findByTitle(card, skip);
    let title = '';
    if (titleEl)
        title = textOf(titleEl).trim();
    else {
        const heading = findFirst(card, e => /^(h[1-4]|strong|b)$/.test(e.tag), skip);
        if (heading)
            title = textOf(heading).trim();
    }
    // ── description ───────────────────────────────────────────────────────────────────────
    let description;
    let descEl = findFirst(card, e => classMatch(e, DESC_PAT) && textOf(e).trim().length > 0, skip);
    const blocks = textBlocks(card, skip);
    if (!title && blocks.length) {
        title = blocks[0].text;
    }
    if (descEl) {
        description = textOf(descEl).trim() || undefined;
    }
    else {
        const cand = blocks.find(b => b.text !== title && !(titleEl && isAncestorOrSelf(titleEl, b.el)));
        if (cand) {
            description = cand.text;
            descEl = cand.el;
        }
    }
    // ── emoji icon fallback (no svg/fontIcon) ───────────────────────────────────────────────
    if (!icon) {
        const lead = leadingEmoji(title);
        if (lead) {
            icon = { type: 'emoji', text: lead };
        }
        else {
            const firstBlock = blocks[0];
            const le = firstBlock ? leadingEmoji(firstBlock.text) : undefined;
            if (le)
                icon = { type: 'emoji', text: le };
        }
    }
    // ── colours (inline styles only) ────────────────────────────────────────────────────────
    const colors = {};
    const cardFill = bgOf(card);
    if (cardFill)
        colors.cardFill = cardFill;
    const borderColor = extractHex(card.style.border) || extractHex(card.style['border-color']);
    if (borderColor)
        colors.borderColor = borderColor;
    if (titleEl) {
        const c = extractHex(titleEl.style.color);
        if (c)
            colors.titleColor = c;
    }
    if (descEl) {
        const c = extractHex(descEl.style.color);
        if (c)
            colors.descColor = c;
    }
    if (iconEl) {
        const ic = extractHex(iconEl.style.color) || extractHex(iconEl.attrs.color) || extractHex(iconEl.attrs.stroke) || extractHex(iconEl.attrs.fill);
        if (ic)
            colors.iconColor = ic;
        if (iconEl.parent && iconEl.parent !== card) {
            const tf = bgOf(iconEl.parent);
            if (tf)
                colors.tileFill = tf;
        }
    }
    // ── accent bar (border-left rule) ───────────────────────────────────────────────────────
    let accentBar;
    const bl = card.style['border-left'];
    if (bl) {
        const c = extractHex(bl);
        const w = parseFloat(bl);
        if (c)
            accentBar = { color: c, width: isFinite(w) ? w : 4 };
    }
    const out = { title, colors };
    if (icon)
        out.icon = icon;
    if (description !== undefined)
        out.description = description;
    if (badge)
        out.badge = badge;
    if (accentBar)
        out.accentBar = accentBar;
    out._el = card;
    return out;
}
/** Title element: a `*-title|name|heading|head|label` class, skipping `skip` subtrees. */
function findByTitle(card, skip) {
    return findFirst(card, e => classMatch(e, TITLE_PAT) && textOf(e).trim().length > 0, skip);
}
// ──────────────────────────────────────────────────────────────────────────────────────────
// parseCards — the public entry
// ──────────────────────────────────────────────────────────────────────────────────────────
/** Locate a grid/flex container whose repeated children are the cards. */
function findContainer(allEls, contPat, exclPat) {
    for (const e of allEls) {
        if (isExcluded(e, exclPat))
            continue;
        const childEls = e.children.filter(c => c.tag !== '#text');
        if (childEls.length < 2)
            continue;
        if (classMatch(e, contPat))
            return e;
        const disp = e.style.display;
        if ((disp === 'grid' || e.style['grid-template-columns'] !== undefined) && childEls.length >= 2)
            return e;
        if (disp === 'flex' && childEls.length >= 3)
            return e;
    }
    return null;
}
/**
 * Parse an HTML card-grid into `CardData[]` ready to spread into `slide.addCard()`.
 *
 * @param input - a raw HTML string (Node). A live DOM node is not handled in this release.
 * @param opts - detection patterns + `defaultFill`
 * @returns one `CardData` per detected card (empty array when no grid of ≥2 cards is found)
 */
function parseCards(input, opts = {}) {
    if (typeof input !== 'string' || input.length === 0)
        return [];
    const cardPat = opts.cardPattern || DEFAULT_CARD;
    const contPat = opts.containerPattern || DEFAULT_CONTAINER;
    const exclPat = opts.excludeWithin || DEFAULT_EXCLUDE;
    const root = buildTree(input);
    const allEls = elements(root);
    // 1) cards by class pattern → keep only outermost matches
    const matched = allEls.filter(e => classMatch(e, cardPat) && !isExcluded(e, exclPat));
    const outer = matched.filter(e => !matched.some(o => o !== e && isAncestorOrSelf(o, e.parent)));
    let cards = [];
    if (outer.length >= 2) {
        cards = outer;
    }
    else {
        // 2) else a grid/flex container's repeated children are the cards
        const cont = findContainer(allEls, contPat, exclPat);
        if (cont)
            cards = cont.children.filter(c => c.tag !== '#text');
    }
    // clamp-don't-crash: a lone card (or none) is not a grid → empty result
    if (cards.length < 2)
        return [];
    return cards.map(c => analyzeCard(c, opts));
}

exports.extractThemeFromCSS = extractThemeFromCSS;
exports.parseCards = parseCards;
exports.parseSvg = parseSvg;
