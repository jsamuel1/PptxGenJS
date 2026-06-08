/* PptxGenJS 4.1.6 @ 2026-06-08T13:20:32.683Z */
'use strict';

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
function normalizeColor(raw) {
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
            theme[slot] = slot === 'font' || !COLOR_SLOTS.has(slot) ? normalizeFont(value) : normalizeColor(value);
        });
    }
    return theme;
}

exports.extractThemeFromCSS = extractThemeFromCSS;
