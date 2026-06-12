const { resolveIconFonts } = require('../src/bld/utils.cjs.js')

module.exports = [
  {
    name: 'pack option resolves icon from injected pack',
    fn: async () => {
      const pack = { 'fa-anchor': { w: 512, h: 512, d: 'M256 0L0 512h512z' } }
      const html = '<i class="fas fa-anchor"></i>'
      const result = await resolveIconFonts(html, { pack, useCdn: false })
      const parts = result.get('fas fa-anchor')
      if (!parts || parts.length === 0) throw new Error('pack icon not resolved')
      if (parts[0].source !== 'pack') throw new Error('expected source pack, got ' + parts[0].source)
      if (parts[0].d !== 'M256 0L0 512h512z') throw new Error('wrong path data')
    }
  },
  {
    name: 'pack option falls through to bundled when icon not in pack',
    fn: async () => {
      const pack = { 'fa-anchor': { w: 512, h: 512, d: 'M0 0z' } }
      const html = '<i class="fas fa-star"></i>'
      const result = await resolveIconFonts(html, { pack, useCdn: false })
      const parts = result.get('fas fa-star')
      // star is in bundled set, should resolve from bundled
      if (!parts || parts.length === 0) throw new Error('star not resolved from bundled')
      if (parts[0].source !== 'bundled') throw new Error('expected source bundled, got ' + parts[0].source)
    }
  },
  {
    name: 'pack option takes priority over bundled',
    fn: async () => {
      const pack = { 'fa-star': { w: 100, h: 100, d: 'M50 0z' } }
      const html = '<i class="fas fa-star"></i>'
      const result = await resolveIconFonts(html, { pack, useCdn: false })
      const parts = result.get('fas fa-star')
      if (!parts || parts.length === 0) throw new Error('pack icon not resolved')
      if (parts[0].source !== 'pack') throw new Error('pack should win over bundled, got ' + parts[0].source)
      if (parts[0].d !== 'M50 0z') throw new Error('wrong path data from pack')
    }
  }
]
