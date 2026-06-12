'use strict'

// Slide comments (docs/features/feature-comments.md) — slide.addComment(...) packages a shared
// ppt/commentAuthors.xml + per-slide ppt/comments/comment{N}.xml, the slide→comments and
// presentation→commentAuthors rels, and both Content_Types overrides. Default-off otherwise.
// Asserts emitted OOXML, author dedup/ids, per-author idx, rId wiring, and the regression-catch.

const { build, readEntry, listEntries, assert } = require('./helpers')

module.exports = [
	{
		name: 'comments: addComment → commentAuthors.xml + comments/comment1.xml + rels + Content_Types',
		fn: async () => {
			const { zip } = await build(p => {
				p.addSlide().addComment({ author: 'Reviewer One', text: 'Confirm the Q3 number', x: 1, y: 2 })
			})
			const entries = listEntries(zip)
			assert(entries.includes('ppt/commentAuthors.xml'), 'expected ppt/commentAuthors.xml part')
			assert(entries.includes('ppt/comments/comment1.xml'), 'expected ppt/comments/comment1.xml part')

			const authorsXml = await readEntry(zip, 'ppt/commentAuthors.xml')
			assert(
				authorsXml.includes('<p:cmAuthor id="0" name="Reviewer One" initials="RO" lastIdx="1" clrIdx="0"/>'),
				'expected single cmAuthor id=0 initials=RO lastIdx=1; got: ' + authorsXml
			)

			const cmXml = await readEntry(zip, 'ppt/comments/comment1.xml')
			// authorId=0, idx=1, EMU pos (1in=914400, 2in=1828800), text
			assert(
				cmXml.includes('<p:cm authorId="0" dt="') && cmXml.includes('idx="1"><p:pos x="914400" y="1828800"/><p:text>Confirm the Q3 number</p:text></p:cm>'),
				'expected <p:cm authorId=0 idx=1 pos 914400/1828800 text>; got: ' + cmXml
			)

			// slide rel → comments part
			const slideRels = await readEntry(zip, 'ppt/slides/_rels/slide1.xml.rels')
			assert(/relationships\/comments" Target="\.\.\/comments\/comment1\.xml"/.test(slideRels), 'expected slide→comments rel; got: ' + slideRels)

			// presentation rel → commentAuthors part
			const presRels = await readEntry(zip, 'ppt/_rels/presentation.xml.rels')
			assert(/relationships\/commentAuthors" Target="commentAuthors\.xml"/.test(presRels), 'expected presentation→commentAuthors rel; got: ' + presRels)

			// Content_Types overrides
			const ctXml = await readEntry(zip, '[Content_Types].xml')
			assert(ctXml.includes('PartName="/ppt/commentAuthors.xml"'), 'expected commentAuthors Content_Types override')
			assert(ctXml.includes('PartName="/ppt/comments/comment1.xml"'), 'expected comment1 Content_Types override')
		}
	},
	{
		name: 'comments: two comments by the same author share one cmAuthor (lastIdx=2, idx 1 & 2)',
		fn: async () => {
			const { zip } = await build(p => {
				const s = p.addSlide()
				s.addComment({ author: 'Alice Smith', text: 'first' })
				s.addComment({ author: 'Alice Smith', text: 'second' })
			})
			const authorsXml = await readEntry(zip, 'ppt/commentAuthors.xml')
			assert((authorsXml.match(/<p:cmAuthor /g) || []).length === 1, 'expected exactly one cmAuthor for same author')
			assert(authorsXml.includes('id="0" name="Alice Smith" initials="AS" lastIdx="2" clrIdx="0"'), 'expected lastIdx=2; got: ' + authorsXml)
			const cmXml = await readEntry(zip, 'ppt/comments/comment1.xml')
			assert(/authorId="0"[^>]*idx="1"><p:pos[^>]*\/><p:text>first<\/p:text>/.test(cmXml), 'expected idx=1 for first; got: ' + cmXml)
			assert(/authorId="0"[^>]*idx="2"><p:pos[^>]*\/><p:text>second<\/p:text>/.test(cmXml), 'expected idx=2 for second; got: ' + cmXml)
		}
	},
	{
		name: 'comments: two different authors get distinct ids (0 and 1)',
		fn: async () => {
			const { zip } = await build(p => {
				const s = p.addSlide()
				s.addComment({ author: 'Alice', text: 'a' })
				s.addComment({ author: 'Bob', text: 'b' })
			})
			const authorsXml = await readEntry(zip, 'ppt/commentAuthors.xml')
			assert(authorsXml.includes('<p:cmAuthor id="0" name="Alice"'), 'expected Alice id=0')
			assert(authorsXml.includes('<p:cmAuthor id="1" name="Bob"'), 'expected Bob id=1')
			const cmXml = await readEntry(zip, 'ppt/comments/comment1.xml')
			assert(/authorId="0"[^>]*><p:pos[^>]*\/><p:text>a<\/p:text>/.test(cmXml), 'Alice comment authorId=0')
			assert(/authorId="1"[^>]*><p:pos[^>]*\/><p:text>b<\/p:text>/.test(cmXml), 'Bob comment authorId=1')
		}
	},
	{
		name: 'comments: authors deduped across slides; per-slide parts numbered by slide index',
		fn: async () => {
			const { zip } = await build(p => {
				p.addSlide().addComment({ author: 'Sam', text: 's1' })
				p.addSlide() // slide 2: no comments → no part
				p.addSlide().addComment({ author: 'Sam', text: 's3' })
			})
			const entries = listEntries(zip)
			assert(entries.includes('ppt/comments/comment1.xml'), 'expected comment1.xml (slide 1)')
			assert(!entries.includes('ppt/comments/comment2.xml'), 'slide 2 has no comments → no comment2.xml')
			assert(entries.includes('ppt/comments/comment3.xml'), 'expected comment3.xml (slide 3)')
			const authorsXml = await readEntry(zip, 'ppt/commentAuthors.xml')
			assert((authorsXml.match(/<p:cmAuthor /g) || []).length === 1, 'Sam deduped across slides → one cmAuthor')
			assert(authorsXml.includes('lastIdx="2"'), 'Sam lastIdx counts both comments across slides')
			// slide 2 rels must NOT have a comments rel
			const slide2Rels = await readEntry(zip, 'ppt/slides/_rels/slide2.xml.rels')
			assert(!/relationships\/comments/.test(slide2Rels), 'slide 2 (no comments) must NOT have a comments rel')
		}
	},
	{
		// Regression-catch for the per-slide idx-reset defect (critic iter 7): `p:cm/@idx` must be
		// UNIQUE per author across the whole presentation and `lastIdx` must equal the max idx used.
		name: 'comments: per-author idx is unique across slides (slide1 idx=1, slide3 idx=2); lastIdx == max idx',
		fn: async () => {
			const { zip } = await build(p => {
				p.addSlide().addComment({ author: 'Reviewer One', text: 's1' })
				p.addSlide() // slide 2: no comments
				p.addSlide().addComment({ author: 'Reviewer One', text: 's3' })
			})
			const cm1 = await readEntry(zip, 'ppt/comments/comment1.xml')
			const cm3 = await readEntry(zip, 'ppt/comments/comment3.xml')
			assert(/authorId="0"[^>]*idx="1"><p:pos[^>]*\/><p:text>s1<\/p:text>/.test(cm1), 'slide 1 comment must be idx=1; got: ' + cm1)
			// The defect produced idx=1 again on slide 3 — it MUST be idx=2 (unique per author across the presentation).
			assert(/authorId="0"[^>]*idx="2"><p:pos[^>]*\/><p:text>s3<\/p:text>/.test(cm3), 'slide 3 comment must be idx=2 (unique across slides); got: ' + cm3)
			assert(!/idx="1"/.test(cm3), 'slide 3 must NOT reuse idx=1 for the same author; got: ' + cm3)
			// lastIdx must equal the max idx used (2), not just the count
			const authorsXml = await readEntry(zip, 'ppt/commentAuthors.xml')
			const m = authorsXml.match(/id="0"[^>]*lastIdx="(\d+)"/)
			assert(m && m[1] === '2', 'lastIdx must equal max idx (2); got: ' + authorsXml)
		}
	},
	{
		name: 'comments: default anchor 0.5in,0.5in; negative coords clamped to 0',
		fn: async () => {
			const { zip } = await build(p => {
				const s = p.addSlide()
				s.addComment({ author: 'A', text: 'default-pos' })
				s.addComment({ author: 'A', text: 'neg-pos', x: -3, y: -1 })
			})
			const cmXml = await readEntry(zip, 'ppt/comments/comment1.xml')
			// 0.5in = 457200 EMU
			assert(/<p:text>default-pos<\/p:text>/.test(cmXml) && cmXml.includes('<p:pos x="457200" y="457200"/>'), 'expected default 0.5in anchor (457200); got: ' + cmXml)
			assert(/<p:pos x="0" y="0"\/><p:text>neg-pos<\/p:text>/.test(cmXml), 'expected negative coords clamped to 0; got: ' + cmXml)
		}
	},
	{
		name: 'comments: invalid input (missing author/text) is skipped (clamp, dont crash)',
		fn: async () => {
			const { zip } = await build(p => {
				const s = p.addSlide()
				s.addComment({ author: '', text: 'no author' })
				s.addComment({ author: 'X', text: '' })
				s.addComment({ author: 'Valid', text: 'kept' })
			})
			const authorsXml = await readEntry(zip, 'ppt/commentAuthors.xml')
			assert((authorsXml.match(/<p:cmAuthor /g) || []).length === 1, 'only the valid comment author should be emitted')
			assert(authorsXml.includes('name="Valid"'), 'expected the valid author')
			const cmXml = await readEntry(zip, 'ppt/comments/comment1.xml')
			assert((cmXml.match(/<p:cm /g) || []).length === 1, 'only one valid comment kept')
		}
	},
	{
		name: 'comments: XML-special chars in author/text are escaped',
		fn: async () => {
			const { zip } = await build(p => {
				p.addSlide().addComment({ author: 'R&D <team>', text: 'a < b & c > d' })
			})
			const authorsXml = await readEntry(zip, 'ppt/commentAuthors.xml')
			const cmXml = await readEntry(zip, 'ppt/comments/comment1.xml')
			assert(!/name="R&D <team>"/.test(authorsXml), 'raw & / < must NOT appear unescaped in author name')
			assert(authorsXml.includes('name="R&amp;D &lt;team&gt;"'), 'expected escaped author name; got: ' + authorsXml)
			assert(cmXml.includes('<p:text>a &lt; b &amp; c &gt; d</p:text>'), 'expected escaped comment text; got: ' + cmXml)
		}
	},
	{
		name: 'comments: DEFAULT-OFF — no addComment() → no commentAuthors/comments/rels/overrides (regression-catch)',
		fn: async () => {
			const { zip } = await build(p => {
				p.addSlide().addText('hi', { x: 1, y: 1, w: 4, h: 1 })
			})
			const entries = listEntries(zip)
			assert(!entries.includes('ppt/commentAuthors.xml'), 'default: no commentAuthors.xml')
			assert(!entries.some(e => e.startsWith('ppt/comments/')), 'default: no ppt/comments/* parts')
			const presRels = await readEntry(zip, 'ppt/_rels/presentation.xml.rels')
			assert(!/relationships\/commentAuthors/.test(presRels), 'default: no commentAuthors rel')
			const slideRels = await readEntry(zip, 'ppt/slides/_rels/slide1.xml.rels')
			assert(!/relationships\/comments/.test(slideRels), 'default: no comments rel on slide')
			const ctXml = await readEntry(zip, '[Content_Types].xml')
			assert(!/commentAuthors/.test(ctXml), 'default: no commentAuthors Content_Types override')
			assert(!/presentationml\.comments\+xml/.test(ctXml), 'default: no comments Content_Types override')
		}
	}
]
