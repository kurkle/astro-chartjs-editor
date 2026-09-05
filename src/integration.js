import { remarkChartEditor, satteriChartEditor } from './remark.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
