import chartEditor from '../src/integration.js'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const { version: packageVersion } = createRequire(import.meta.url)('../package.json')

function createHookArgs(configOverrides = {}) {
  const config = {
    markdown: {},
    root: new URL('file:///project/'),
    ...configOverrides,
  }
  const injectScriptCalls = []
  const updateConfigCalls = []
  return {
    args: {
      config,
      injectScript(...callArgs) {
        injectScriptCalls.push(callArgs)
      },
      updateConfig(...callArgs) {
        updateConfigCalls.push(callArgs)
        return callArgs[0]
      },
    },
    injectScriptCalls,
    updateConfigCalls,
  }
}

test('throws when no runtime module is configured', () => {
  assert.throws(() => chartEditor(), /requires a runtime module/)
  assert.throws(() => chartEditor({}), /requires a runtime module/)
})

test('injects the client script and registers the vite runtime plugin', () => {
  const integration = chartEditor({ runtime: './docs/chart-runtime.js' })
  assert.equal(integration.name, '@kurkle/astro-chartjs-editor')
  const { args, injectScriptCalls, updateConfigCalls } = createHookArgs()

  integration.hooks['astro:config:setup'](args)

  assert.deepEqual(injectScriptCalls, [['page', "import '@kurkle/astro-chartjs-editor/client'"]])
  assert.equal(updateConfigCalls.length, 1)
  const [update] = updateConfigCalls[0]
  assert.equal(update.vite.plugins.length, 1)
  assert.equal(update.vite.plugins[0].name, '@kurkle/astro-chartjs-editor/runtime')
})

test('resolves the virtual runtime module against the project root', () => {
  const integration = chartEditor({ runtime: './docs/chart-runtime.js' })
  const { args, updateConfigCalls } = createHookArgs()

  integration.hooks['astro:config:setup'](args)

  const plugin = updateConfigCalls[0][0].vite.plugins[0]
  assert.equal(
    plugin.resolveId('virtual:astro-chartjs-editor/runtime'),
    '\0virtual:astro-chartjs-editor/runtime'
  )
  assert.equal(plugin.resolveId('something-else'), undefined)
  assert.equal(
    plugin.load('\0virtual:astro-chartjs-editor/runtime'),
    `export * from "/project/docs/chart-runtime.js"`
  )
  assert.equal(plugin.load('something-else'), undefined)
})

test('falls back to markdown.remarkPlugins when no processor is configured', () => {
  const integration = chartEditor({ runtime: './docs/chart-runtime.js' })
  const { args, updateConfigCalls } = createHookArgs()

  integration.hooks['astro:config:setup'](args)

  const [update] = updateConfigCalls[0]
  assert.equal(update.markdown.remarkPlugins.length, 1)
  const [plugin, options] = update.markdown.remarkPlugins[0]
  assert.equal(typeof plugin, 'function')
  assert.equal(options.sourceRoot, '/project/')
})

test('stamps the package version onto the remarkPlugins options so Astro re-renders on upgrade', () => {
  const integration = chartEditor({ runtime: './docs/chart-runtime.js' })
  const { args, updateConfigCalls } = createHookArgs()

  integration.hooks['astro:config:setup'](args)

  const [update] = updateConfigCalls[0]
  const [, options] = update.markdown.remarkPlugins[0]
  assert.equal(options.version, packageVersion)
})

test('pushes into an existing satteri mdastPlugins array instead of updating markdown config', () => {
  const integration = chartEditor({ runtime: './docs/chart-runtime.js' })
  const mdastPlugins = []
  const { args, updateConfigCalls } = createHookArgs({
    markdown: {
      processor: {
        name: 'satteri',
        options: { mdastPlugins },
      },
    },
  })

  integration.hooks['astro:config:setup'](args)

  assert.equal(mdastPlugins.length, 1)
  assert.equal(mdastPlugins[0].name, '@kurkle/astro-chartjs-editor')
  assert.equal(mdastPlugins[0].version, packageVersion)
  const [update] = updateConfigCalls[0]
  assert.equal('markdown' in update, false)
})

test('pushes into an existing remarkPlugins array instead of updating markdown config', () => {
  const integration = chartEditor({ runtime: './docs/chart-runtime.js' })
  const remarkPlugins = []
  const { args, updateConfigCalls } = createHookArgs({
    markdown: {
      processor: {
        options: { remarkPlugins },
      },
    },
  })

  integration.hooks['astro:config:setup'](args)

  assert.equal(remarkPlugins.length, 1)
  const [plugin, options] = remarkPlugins[0]
  assert.equal(typeof plugin, 'function')
  assert.equal(options.version, packageVersion)
  const [update] = updateConfigCalls[0]
  assert.equal('markdown' in update, false)
})

test('resolves a custom sourceRoot relative to the project root and passes sourceBaseUrl through', () => {
  const integration = chartEditor({
    runtime: './docs/chart-runtime.js',
    sourceBaseUrl: 'https://github.com/example/project/blob/main/',
    sourceRoot: './docs',
  })
  const { args, updateConfigCalls } = createHookArgs()

  integration.hooks['astro:config:setup'](args)

  const [update] = updateConfigCalls[0]
  const [, options] = update.markdown.remarkPlugins[0]
  assert.equal(options.sourceBaseUrl, 'https://github.com/example/project/blob/main/')
  assert.equal(options.sourceRoot, '/project/docs')
})
