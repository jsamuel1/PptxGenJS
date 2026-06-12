#!/usr/bin/env node
/**
 * Generates src/icons-fa.generated.ts from @fortawesome/fontawesome-free SVGs.
 * Run: node scripts/generate-fa-pack.js
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const FA_ROOT = path.resolve(__dirname, '../node_modules/@fortawesome/fontawesome-free');
const OUT_FILE = path.resolve(__dirname, '../src/icons-fa.generated.ts');

// --- Parse SVGs ---
function parseSvg(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const vbMatch = content.match(/viewBox="0 0 (\d+) (\d+)"/);
  const dMatch = content.match(/<path[^>]*\bd="([^"]+)"/);
  if (!vbMatch || !dMatch) return null;
  return { w: parseInt(vbMatch[1]), h: parseInt(vbMatch[2]), d: dMatch[1] };
}

function readStyle(styleName) {
  const dir = path.join(FA_ROOT, 'svgs', styleName);
  const entries = {};
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.svg'))) {
    const name = file.replace('.svg', '');
    const data = parseSvg(path.join(dir, file));
    if (data) entries[name] = data;
  }
  return entries;
}

// --- Load metadata ---
function loadPopularity() {
  const iconsPath = path.join(FA_ROOT, 'metadata/icons.yml');
  const icons = yaml.load(fs.readFileSync(iconsPath, 'utf8'));
  const pop = {};
  let idx = 0;
  for (const [name, meta] of Object.entries(icons)) {
    // No explicit popularity field exists; use reverse position (earlier = higher)
    pop[name] = Object.keys(icons).length - idx;
    idx++;
  }
  return pop;
}

function loadShims() {
  const shimsPath = path.join(FA_ROOT, 'metadata/shims.yml');
  return yaml.load(fs.readFileSync(shimsPath, 'utf8'));
}

// --- Main ---
const solid = readStyle('solid');
const regular = readStyle('regular');
const brands = readStyle('brands');
const popularity = loadPopularity();
const shims = loadShims();

const solidNames = new Set(Object.keys(solid));
const result = {};

// Solid icons: always fa-<name>
for (const [name, data] of Object.entries(solid)) {
  result[`fa-${name}`] = { ...data, popularity: popularity[name] || 0 };
}

// Regular icons: far-<name> if collides with solid, else fa-<name>
let regularCount = 0;
for (const [name, data] of Object.entries(regular)) {
  const key = solidNames.has(name) ? `far-${name}` : `fa-${name}`;
  result[key] = { ...data, popularity: popularity[name] || 0 };
  regularCount++;
}

// Brands icons: fab-<name> if collides with solid, else fa-<name>
let brandsCount = 0;
for (const [name, data] of Object.entries(brands)) {
  const key = solidNames.has(name) ? `fab-${name}` : `fa-${name}`;
  // Don't overwrite if already set by regular (rare edge case)
  if (!result[key]) {
    result[key] = { ...data, popularity: popularity[name] || 0 };
  }
  brandsCount++;
}

// Aliases from shims.yml: old FA5 name → current FA6 icon data
let aliasCount = 0;
for (const [oldName, mapping] of Object.entries(shims)) {
  const targetName = mapping.name;
  const prefix = mapping.prefix || 'fas';
  let sourceKey;
  if (prefix === 'far') {
    sourceKey = solidNames.has(targetName) ? `far-${targetName}` : `fa-${targetName}`;
  } else if (prefix === 'fab') {
    sourceKey = solidNames.has(targetName) ? `fab-${targetName}` : `fa-${targetName}`;
  } else {
    sourceKey = `fa-${targetName}`;
  }
  const sourceData = result[sourceKey];
  if (sourceData) {
    const aliasKey = `fa-${oldName}`;
    if (!result[aliasKey]) {
      result[aliasKey] = { ...sourceData };
      aliasCount++;
    }
  }
}

// Sort keys and generate output
const sortedKeys = Object.keys(result).sort();

const LICENSE = `/**
 * AUTO-GENERATED — do not edit. Run: node scripts/generate-fa-pack.js
 *
 * Font Awesome Free icon data.
 * Font Awesome Free by @fontawesome — https://fontawesome.com
 * License: CC BY 4.0 (icons), SIL OFL 1.1 (fonts), MIT (code)
 * https://fontawesome.com/license/free
 */`;

let ts = `${LICENSE}\n\nexport const FA_ICONS: Record<string, { w: number; h: number; d: string; popularity: number }> = {\n`;

for (const key of sortedKeys) {
  const { w, h, d, popularity: pop } = result[key];
  ts += `  "${key}": { w: ${w}, h: ${h}, d: "${d}", popularity: ${pop} },\n`;
}

ts += `};\n\nexport default FA_ICONS;\n`;

fs.writeFileSync(OUT_FILE, ts, 'utf8');

const solidCount = Object.keys(solid).length;
console.log(`Generated ${sortedKeys.length} icons (${solidCount} solid, ${regularCount} regular, ${brandsCount} brands, ${aliasCount} aliases) → src/icons-fa.generated.ts`);
