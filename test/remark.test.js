import { remarkChartEditor, satteriChartEditor } from '../src/remark.js'
import assert from 'node:assert/strict'
import test from 'node:test'

test('turns a chart-editor fence into an editor element', () => {
  const tree = {
    children: [
      {
        lang: 'js',
        meta: 'chart-editor height=600',
        type: 'code',
        value: 'module.exports = {config: {}}',
      },
    ],
    type: 'root',
  }
  const file = { data: { astro: { frontmatter: { title: 'Example' } } } }
  remarkChartEditor()(tree, file)
  assert.equal(tree.children[0].type, 'html')
  assert.match(tree.children[0].value, /data-title="Example"/)
  assert.match(tree.children[0].value, /data-height="600"/)
  assert.match(tree.children[0].value, /<template data-chart-code data-encoding="base64">/)
  assert.doesNotMatch(tree.children[0].value, /module\.exports/)
})

test('provides the equivalent Sätteri code visitor', () => {
  const plugin = satteriChartEditor()
  const result = plugin.code(
    {
      lang: 'javascript',
      meta: 'chart-editor height=500',
      value: 'module.exports = {config: {}}',
    },
    {
      data: { astro: { frontmatter: { title: 'Sätteri example' } } },
      fileURL: undefined,
    }
  )

  assert.equal(result.type, 'html')
  assert.match(result.value, /data-title="Sätteri example"/)
  assert.match(result.value, /data-height="500"/)
  assert.match(result.value, /<template data-chart-code data-encoding="base64">/)
})
