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
  const file = { data: { astro: { frontmatter: { chartTitle: 'Example' } } } }
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
      data: { astro: { frontmatter: { chartTitle: 'Sätteri example' } } },
      fileURL: undefined,
    }
  )

  assert.equal(result.type, 'html')
  assert.match(result.value, /data-title="Sätteri example"/)
  assert.match(result.value, /data-height="500"/)
  assert.match(result.value, /<template data-chart-code data-encoding="base64">/)
})

test('leaves a fence untouched when it has no chart-editor marker', () => {
  const codeNode = {
    lang: 'js',
    meta: null,
    type: 'code',
    value: 'const config = {}',
  }
  const tree = { children: [codeNode], type: 'root' }
  const file = { data: {} }
  remarkChartEditor()(tree, file)
  assert.equal(tree.children[0], codeNode)
  assert.equal(tree.children[0].type, 'code')
})

test('leaves a fence untouched when the language is not js/javascript', () => {
  const codeNode = {
    lang: 'python',
    meta: 'chart-editor',
    type: 'code',
    value: 'config = {}',
  }
  const tree = { children: [codeNode], type: 'root' }
  const file = { data: {} }
  remarkChartEditor()(tree, file)
  assert.equal(tree.children[0], codeNode)
})

test('ignores non-code nodes while walking the tree', () => {
  const tree = {
    children: [
      {
        children: [
          {
            lang: 'js',
            meta: 'chart-editor',
            type: 'code',
            value: 'module.exports = {config: {}}',
          },
        ],
        type: 'paragraph',
      },
    ],
    type: 'root',
  }
  const file = { data: {} }
  remarkChartEditor()(tree, file)
  assert.equal(tree.children[0].children[0].type, 'html')
})

test('defaults the height to 420 and the title to empty when neither meta nor frontmatter set them', () => {
  const tree = {
    children: [
      {
        lang: 'js',
        meta: 'chart-editor',
        type: 'code',
        value: 'module.exports = {config: {}}',
      },
    ],
    type: 'root',
  }
  const file = { data: {} }
  remarkChartEditor()(tree, file)
  assert.match(tree.children[0].value, /data-title=""/)
  assert.match(tree.children[0].value, /data-height="420"/)
})

test('titles the demo from the fence meta when title= is set', () => {
  const tree = {
    children: [
      {
        lang: 'js',
        meta: 'chart-editor title="Auto (default)"',
        type: 'code',
        value: 'module.exports = {config: {}}',
      },
    ],
    type: 'root',
  }
  const file = {
    data: { astro: { frontmatter: { chartTitle: 'Ignored', title: 'Also ignored' } } },
  }
  remarkChartEditor()(tree, file)
  assert.match(tree.children[0].value, /data-title="Auto \(default\)"/)
})

test('falls back to frontmatter.chartTitle when the fence has no title= meta', () => {
  const tree = {
    children: [
      {
        lang: 'js',
        meta: 'chart-editor',
        type: 'code',
        value: 'module.exports = {config: {}}',
      },
    ],
    type: 'root',
  }
  const file = { data: { astro: { frontmatter: { chartTitle: 'Node Padding demo' } } } }
  remarkChartEditor()(tree, file)
  assert.match(tree.children[0].value, /data-title="Node Padding demo"/)
})

test('does not fall back to the page frontmatter.title -- that would repeat the page heading', () => {
  const tree = {
    children: [
      {
        lang: 'js',
        meta: 'chart-editor',
        type: 'code',
        value: 'module.exports = {config: {}}',
      },
    ],
    type: 'root',
  }
  // Only the page's own title is set (the common case: a sample page with
  // frontmatter `title: 'Node Padding'` and a fence that sets neither
  // `title=` nor `chartTitle`). Before the fix this leaked into the demo's
  // own header, repeating the page's <h1> text inside the box right below
  // it. It must now come out empty, which hides the header entirely (see
  // `header.hidden = !title` in client.js).
  const file = { data: { astro: { frontmatter: { title: 'Node Padding' } } } }
  remarkChartEditor()(tree, file)
  assert.match(tree.children[0].value, /data-title=""/)
})

test('is empty when neither the fence nor the frontmatter set a title', () => {
  const tree = {
    children: [
      {
        lang: 'js',
        meta: 'chart-editor',
        type: 'code',
        value: 'module.exports = {config: {}}',
      },
    ],
    type: 'root',
  }
  const file = { data: { astro: { frontmatter: {} } } }
  remarkChartEditor()(tree, file)
  assert.match(tree.children[0].value, /data-title=""/)
})

test('omits the source link when sourceBaseUrl is not configured', () => {
  const tree = {
    children: [
      {
        lang: 'js',
        meta: 'chart-editor',
        type: 'code',
        value: 'module.exports = {config: {}}',
      },
    ],
    type: 'root',
  }
  const file = { data: {}, path: '/project/docs/sample.md' }
  remarkChartEditor()(tree, file)
  assert.match(tree.children[0].value, /data-source-url=""/)
})

test('builds a source link relative to sourceRoot when sourceBaseUrl is configured', () => {
  const tree = {
    children: [
      {
        lang: 'js',
        meta: 'chart-editor',
        type: 'code',
        value: 'module.exports = {config: {}}',
      },
    ],
    type: 'root',
  }
  const file = { data: {}, path: '/project/docs/sample.md' }
  remarkChartEditor({
    sourceBaseUrl: 'https://github.com/example/project/blob/main/',
    sourceRoot: '/project',
  })(tree, file)
  assert.match(
    tree.children[0].value,
    /data-source-url="https:\/\/github\.com\/example\/project\/blob\/main\/docs\/sample\.md"/
  )
})
