import { Buffer } from 'node:buffer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function getMetaValue(meta, name) {
  const match = meta?.match(new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)'|(\\S+))`))
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

function editorMarkup({ code, frontmatter = {}, meta, options = {}, pathname }) {
  const title = getMetaValue(meta, 'title') ?? frontmatter.chartTitle ?? ''
  const height = Number(getMetaValue(meta, 'height') ?? frontmatter.chartHeight ?? 420)
  let sourceUrl = ''

  if (options.sourceBaseUrl && pathname) {
    const relativePath = path.relative(options.sourceRoot ?? process.cwd(), pathname)
    sourceUrl = `${options.sourceBaseUrl}${relativePath.split(path.sep).join('/')}`
  }

  const encodedCode = Buffer.from(code, 'utf8').toString('base64')
  return `<astro-chartjs-editor data-title="${escapeAttribute(title)}" data-height="${height}" data-source-url="${escapeAttribute(sourceUrl)}"><template data-chart-code data-encoding="base64">${encodedCode}</template></astro-chartjs-editor>`
}

function walk(node, visitor) {
  if (!node.children) return
  for (let index = 0; index < node.children.length; index++) {
    const child = node.children[index]
    visitor(child, node, index)
    walk(node.children[index], visitor)
  }
}

export function remarkChartEditor(options = {}) {
  return (tree, file) => {
    walk(tree, (node, parent, index) => {
      if (node.type !== 'code' || !['js', 'javascript'].includes(node.lang)) return
      if (!/(?:^|\s)chart-editor(?:\s|$)/.test(node.meta ?? '')) return

      parent.children[index] = {
        type: 'html',
        value: editorMarkup({
          code: node.value,
          frontmatter: file.data.astro?.frontmatter,
          meta: node.meta,
          options,
          pathname: file.path,
        }),
      }
    })
  }
}

export function satteriChartEditor(options = {}) {
  return {
    code(node, context) {
      if (!['js', 'javascript'].includes(node.lang ?? '')) return
      if (!/(?:^|\s)chart-editor(?:\s|$)/.test(node.meta ?? '')) return

      return {
        type: 'html',
        value: editorMarkup({
          code: node.value,
          frontmatter: context.data.astro?.frontmatter,
          meta: node.meta,
          options,
          pathname: context.fileURL ? fileURLToPath(context.fileURL) : undefined,
        }),
      }
    },
    name: '@kurkle/astro-chartjs-editor',
  }
}
