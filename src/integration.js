import { remarkChartEditor, satteriChartEditor } from './remark.js'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

const VIRTUAL_RUNTIME = 'virtual:astro-chartjs-editor/runtime'
const RESOLVED_RUNTIME = `\0${VIRTUAL_RUNTIME}`

export default function chartEditor(options) {
  if (!options?.runtime) {
    throw new Error('@kurkle/astro-chartjs-editor requires a runtime module')
  }

  return {
    hooks: {
      'astro:config:setup'({ config, injectScript, updateConfig }) {
        const root = fileURLToPath(config.root)
        const runtime = path.resolve(root, options.runtime)
        const runtimePlugin = {
          load(id) {
            if (id === RESOLVED_RUNTIME) return `export * from ${JSON.stringify(runtime)}`
          },
          name: '@kurkle/astro-chartjs-editor/runtime',
          resolveId(id) {
            if (id === VIRTUAL_RUNTIME) return RESOLVED_RUNTIME
          },
        }
        const markdownOptions = {
          sourceBaseUrl: options.sourceBaseUrl,
          sourceRoot: options.sourceRoot ? path.resolve(root, options.sourceRoot) : root,
          // Part of Astro's hashed config (config.markdown): bumping this package
          // changes the content layer's config digest, so Astro clears its cached
          // render output instead of serving markup produced by the previous
          // version. See https://github.com/withastro/astro content-layer.js,
          // where `integrations` is excluded from the digest but `markdown` is not.
          version,
        }
        const processor = config.markdown?.processor
        const markdown = {}

        if (processor?.name === 'satteri' && Array.isArray(processor.options?.mdastPlugins)) {
          processor.options.mdastPlugins.push(satteriChartEditor(markdownOptions))
        } else if (Array.isArray(processor?.options?.remarkPlugins)) {
          processor.options.remarkPlugins.push([remarkChartEditor, markdownOptions])
        } else {
          markdown.remarkPlugins = [[remarkChartEditor, markdownOptions]]
        }

        updateConfig({
          ...(markdown.remarkPlugins ? { markdown } : {}),
          vite: {
            plugins: [runtimePlugin],
          },
        })
        injectScript('page', `import '@kurkle/astro-chartjs-editor/client'`)
      },
    },
    name: '@kurkle/astro-chartjs-editor',
  }
}
