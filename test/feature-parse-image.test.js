'use strict'

// Feature: `<img>` / `<picture>` image extractor for /utils (SAU-74).
//
// `/utils` had NO image extraction path — `parseHtml` kept <img> attrs but no extractor surfaced an
// image as content, so source images (brand marks, banners/diagrams, content photos) were dropped.
// `parseImages` surfaces each <img>/<picture> as a neutral { kind:'image', src, alt, width?, height? }
// node the converter can fetch + embed. NEUTRAL & dependency-free — represents the HTML, never fetches.

const { assert } = require('./helpers')
const { parseImages } = require('../src/bld/utils.cjs.js')

module.exports = [
	{
		name: 'parseImages: standalone <img> → { kind, src, alt, width, height } (SAU-74 DoD)',
		fn: async () => {
			const html = '<img src="https://cdn.example.com/banner.png" alt="Quarterly banner" width="640" height="200">'
			const imgs = parseImages(html)
			assert(imgs.length === 1, 'expected 1 image; got: ' + imgs.length)
			const im = imgs[0]
			assert(im.kind === 'image', 'kind should be image; got: ' + im.kind)
			assert(im.src === 'https://cdn.example.com/banner.png', 'src; got: ' + im.src)
			assert(im.alt === 'Quarterly banner', 'alt; got: ' + JSON.stringify(im.alt))
			assert(im.width === 640, 'width; got: ' + im.width)
			assert(im.height === 200, 'height; got: ' + im.height)
		},
	},
	{
		name: 'parseImages: data URI src passes through verbatim; no baseUrl mangling',
		fn: async () => {
			const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
			const imgs = parseImages('<img src="' + dataUri + '" alt="dot">', { baseUrl: 'https://host/page/' })
			assert(imgs.length === 1, 'one image expected')
			assert(imgs[0].src === dataUri, 'data URI must pass through verbatim; got: ' + imgs[0].src)
		},
	},
	{
		name: 'parseImages: relative src is preserved verbatim WITHOUT baseUrl',
		fn: async () => {
			const imgs = parseImages('<img src="img/logo.svg" alt="Logo">')
			assert(imgs.length === 1, 'one image expected')
			assert(imgs[0].src === 'img/logo.svg', 'relative src preserved verbatim; got: ' + imgs[0].src)
		},
	},
	{
		name: 'parseImages: relative src resolved against baseUrl when supplied',
		fn: async () => {
			const imgs = parseImages('<img src="assets/logo.svg" alt="Logo">', { baseUrl: 'https://host.example/deck/index.html' })
			assert(imgs.length === 1, 'one image expected')
			assert(imgs[0].src === 'https://host.example/deck/assets/logo.svg', 'resolved src; got: ' + imgs[0].src)
		},
	},
	{
		name: 'parseImages: absolute src is NOT re-resolved against baseUrl',
		fn: async () => {
			const imgs = parseImages('<img src="https://other.cdn/x.png" alt="">', { baseUrl: 'https://host/page/' })
			assert(imgs[0].src === 'https://other.cdn/x.png', 'absolute src untouched; got: ' + imgs[0].src)
		},
	},
	{
		name: 'parseImages: missing alt → empty string; alt="" preserved',
		fn: async () => {
			const noAlt = parseImages('<img src="a.png">')[0]
			assert(noAlt.alt === '', 'missing alt → ""; got: ' + JSON.stringify(noAlt.alt))
			const emptyAlt = parseImages('<img src="a.png" alt="">')[0]
			assert(emptyAlt.alt === '', 'alt="" → ""; got: ' + JSON.stringify(emptyAlt.alt))
		},
	},
	{
		name: 'parseImages: intrinsic size from inline style px when no width/height attr',
		fn: async () => {
			const im = parseImages('<img src="a.png" style="width: 320px; height: 180px">')[0]
			assert(im.width === 320, 'style width; got: ' + im.width)
			assert(im.height === 180, 'style height; got: ' + im.height)
		},
	},
	{
		name: 'parseImages: width/height ATTR takes precedence over inline style',
		fn: async () => {
			const im = parseImages('<img src="a.png" width="100" height="50" style="width: 999px; height: 999px">')[0]
			assert(im.width === 100, 'attr width wins; got: ' + im.width)
			assert(im.height === 50, 'attr height wins; got: ' + im.height)
		},
	},
	{
		name: 'parseImages: non-px / percentage / auto sizes are OMITTED (not expressible as px)',
		fn: async () => {
			const im = parseImages('<img src="a.png" style="width: 50%; height: auto">')[0]
			assert(im.width === undefined, 'percent width omitted; got: ' + im.width)
			assert(im.height === undefined, 'auto height omitted; got: ' + im.height)
			const em = parseImages('<img src="a.png" style="width: 10em">')[0]
			assert(em.width === undefined, 'em width omitted; got: ' + em.width)
		},
	},
	{
		name: 'parseImages: zero / negative sizes are clamped out (ADR-0005)',
		fn: async () => {
			const im = parseImages('<img src="a.png" width="0" height="-40">')[0]
			assert(im.width === undefined, 'width 0 omitted; got: ' + im.width)
			assert(im.height === undefined, 'negative height omitted; got: ' + im.height)
		},
	},
	{
		name: 'parseImages: card/tile <img> is extractable (nested in a card)',
		fn: async () => {
			const html =
				'<div class="card"><div class="card-body">' +
				'<img src="https://cdn/icon.png" alt="Service icon" width="48" height="48">' +
				'<h3>Service</h3></div></div>'
			const imgs = parseImages(html)
			assert(imgs.length === 1, 'nested card image expected; got: ' + imgs.length)
			assert(imgs[0].src === 'https://cdn/icon.png' && imgs[0].alt === 'Service icon', 'card img fields')
		},
	},
	{
		name: 'parseImages: multiple images returned in document order',
		fn: async () => {
			const html = '<img src="1.png" alt="one"><div><img src="2.png" alt="two"></div><img src="3.png" alt="three">'
			const imgs = parseImages(html, { baseUrl: 'https://h/' })
			assert(imgs.length === 3, 'three images expected; got: ' + imgs.length)
			assert(imgs[0].alt === 'one' && imgs[1].alt === 'two' && imgs[2].alt === 'three', 'document order')
		},
	},
	{
		name: 'parseImages: <picture> represented once via inner <img> (not double-counted)',
		fn: async () => {
			const html =
				'<picture>' +
				'<source srcset="hero.avif" type="image/avif">' +
				'<source srcset="hero.webp" type="image/webp">' +
				'<img src="hero.png" alt="Hero" width="800" height="400">' +
				'</picture>'
			const imgs = parseImages(html)
			assert(imgs.length === 1, '<picture> should yield exactly ONE node; got: ' + imgs.length)
			assert(imgs[0].src === 'hero.png', 'picture uses inner <img> src; got: ' + imgs[0].src)
			assert(imgs[0].alt === 'Hero', 'picture alt from inner img; got: ' + imgs[0].alt)
			assert(imgs[0].width === 800 && imgs[0].height === 400, 'picture size from inner img')
		},
	},
	{
		name: 'parseImages: <picture> with no usable <img> src falls back to first <source> srcset',
		fn: async () => {
			const html =
				'<picture>' +
				'<source srcset="hero.webp 1x, hero@2x.webp 2x" type="image/webp">' +
				'<img alt="Hero only alt">' +
				'</picture>'
			const imgs = parseImages(html)
			assert(imgs.length === 1, 'one node expected; got: ' + imgs.length)
			assert(imgs[0].src === 'hero.webp', 'srcset first URL token; got: ' + imgs[0].src)
			assert(imgs[0].alt === 'Hero only alt', 'alt inherited from inner img; got: ' + imgs[0].alt)
		},
	},
	{
		name: 'parseImages: bare <img> srcset (no src) → first srcset URL',
		fn: async () => {
			const im = parseImages('<img srcset="small.png 480w, large.png 1024w" alt="resp">')[0]
			assert(im.src === 'small.png', 'first srcset URL, descriptor stripped; got: ' + im.src)
		},
	},
	{
		name: 'parseImages: no image → [] (never null)',
		fn: async () => {
			const imgs = parseImages('<div><p>No images here</p></div>')
			assert(Array.isArray(imgs) && imgs.length === 0, 'empty array expected; got: ' + JSON.stringify(imgs))
		},
	},
	{
		name: 'parseImages: <img> with no src and no srcset is skipped',
		fn: async () => {
			const imgs = parseImages('<img alt="broken">')
			assert(imgs.length === 0, 'no usable source → skipped; got: ' + imgs.length)
		},
	},
	{
		name: 'parseImages: excludeWithin skips images inside a matching region',
		fn: async () => {
			const html =
				'<div class="mockup"><img src="ui.png" alt="ui"></div>' +
				'<img src="real.png" alt="real">'
			const imgs = parseImages(html, { excludeWithin: /mockup/ })
			assert(imgs.length === 1, 'mockup image excluded; got: ' + imgs.length)
			assert(imgs[0].src === 'real.png', 'kept the non-excluded image; got: ' + imgs[0].src)
		},
	},
	{
		name: 'parseImages: accepts an HNode (parse once, query many)',
		fn: async () => {
			const { parseHtml } = require('../src/bld/utils.cjs.js')
			const root = parseHtml('<img src="node.png" alt="from node" width="12">')
			const imgs = parseImages(root)
			assert(imgs.length === 1 && imgs[0].src === 'node.png' && imgs[0].width === 12, 'HNode input works')
		},
	},
]
