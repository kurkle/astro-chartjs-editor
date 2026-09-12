import { normalizeCharts } from './charts.js'
import { SampleEditor } from './editor.js'
import editorStyles from './styles.css?inline'
import { createChart, globals } from 'virtual:astro-chartjs-editor/runtime'

function evaluateSample(code, sampleConsole) {
  const module = { exports: {} }
  const sampleGlobals = globals ?? {}
  const globalNames = Object.keys(sampleGlobals)
  for (const name of globalNames) {
    if (!/^[$A-Z_a-z][$\w]*$/.test(name)) throw new Error(`Invalid sample global: ${name}`)
  }
  const fn = new Function(
    'module',
    'exports',
    ...globalNames,
    'console',
    `${code}\nreturn module.exports;`
  )
  return fn(
    module,
    module.exports,
    ...globalNames.map((name) => sampleGlobals[name]),
    sampleConsole
  )
}

function formatMessage(values) {
  return values
    .map((value) => {
      if (typeof value === 'string') return value
      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    })
    .join(' ')
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.append(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
}

function appendChartCanvas(chartsGrid, entry, height, fallbackTitle) {
  const chartNode = document.createElement('div')
  chartNode.className = 'chartjs-editor__chart'
  if (entry.title) {
    const chartHeading = document.createElement('strong')
    chartHeading.className = 'chartjs-editor__chart-title'
    chartHeading.textContent = entry.title
    chartNode.append(chartHeading)
  }
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = height
  canvas.setAttribute('aria-label', entry.title || fallbackTitle || 'Chart.js sample')
  canvas.setAttribute('role', 'img')
  chartNode.append(canvas)
  chartsGrid.append(chartNode)
  return canvas
}

function renderCharts(chartsGrid, previousCharts, entries, height, fallbackTitle) {
  for (const previousChart of previousCharts) previousChart?.destroy()
  chartsGrid.replaceChildren()
  return entries.map((entry) => {
    const canvas = appendChartCanvas(chartsGrid, entry, height, fallbackTitle)
    return createChart(canvas, entry.config)
  })
}

function renderActions(actionsNode, actions, charts, isMulti) {
  actionsNode.replaceChildren()
  for (const action of actions) {
    const button = createButton(action.name, 'data-chart-action')
    button.addEventListener('click', () => action.handler(isMulti ? charts : charts[0]))
    actionsNode.append(button)
  }
}

function createButton(label, attribute) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.setAttribute(attribute, '')
  return button
}

function readCode(template) {
  const value = template?.content.textContent ?? ''
  if (template?.dataset.encoding !== 'base64') return value
  const bytes = Uint8Array.from(atob(value.trim()), (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

class ChartEditorElement extends HTMLElement {
  connectedCallback() {
    if (this.dataset.mounted === 'true') return
    this.dataset.mounted = 'true'
    const codeTemplate = this.querySelector('template[data-chart-code]')
    const initialCode = readCode(codeTemplate)
    const height = Number(this.dataset.height || 420)
    const title = this.dataset.title
    const sourceUrl = this.dataset.sourceUrl

    const header = document.createElement('div')
    header.className = 'chartjs-editor__chart-header'
    const heading = document.createElement('strong')
    heading.textContent = title
    header.append(heading)
    header.hidden = !title

    const chartsGrid = document.createElement('div')
    chartsGrid.className = 'chartjs-editor__charts'

    const actionsNode = document.createElement('div')
    actionsNode.className = 'chartjs-editor__actions'
    const editorNode = document.createElement('div')
    editorNode.className = 'chartjs-editor__editor'
    const editorHeader = document.createElement('div')
    editorHeader.className = 'chartjs-editor__editor-header'
    const tabsNode = document.createElement('div')
    tabsNode.className = 'chartjs-editor__tabs'
    tabsNode.setAttribute('aria-label', 'Code sections')
    const toolsNode = document.createElement('div')
    toolsNode.className = 'chartjs-editor__tools'
    const runButton = createButton('Run', 'data-chart-run')
    const copyButton = createButton('Copy', 'data-chart-copy')
    const resetButton = createButton('Reset', 'data-chart-reset')
    toolsNode.append(runButton, copyButton, resetButton)
    if (sourceUrl) {
      const sourceLink = document.createElement('a')
      sourceLink.href = sourceUrl
      sourceLink.rel = 'noopener noreferrer'
      sourceLink.target = '_blank'
      sourceLink.textContent = 'View source'
      toolsNode.append(sourceLink)
    }
    editorHeader.append(tabsNode, toolsNode)

    const codeNode = document.createElement('div')
    codeNode.className = 'chartjs-editor__code'
    codeNode.setAttribute('aria-label', `${title || 'Chart.js sample'} code`)
    const errorNode = document.createElement('output')
    errorNode.className = 'chartjs-editor__error'
    errorNode.setAttribute('aria-live', 'polite')
    const outputNode = document.createElement('div')
    outputNode.className = 'chartjs-editor__output'
    outputNode.hidden = true
    const outputHeading = document.createElement('strong')
    outputHeading.textContent = 'Output'
    const outputContentNode = document.createElement('pre')
    outputNode.append(outputHeading, outputContentNode)
    editorNode.append(editorHeader, codeNode, errorNode, outputNode)
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = editorStyles
    root.replaceChildren(style, header, chartsGrid, actionsNode, editorNode)

    let charts = []
    let editor

    const render = (code) => {
      errorNode.textContent = ''
      const messages = []
      const refreshOutput = (placeholder) => {
        outputContentNode.textContent = messages.join('\n') || placeholder || '...'
      }
      const sampleConsole = {
        ...console,
        log(...values) {
          console.log(...values)
          messages.push(formatMessage(values))
          messages.splice(0, Math.max(0, messages.length - 50))
          refreshOutput()
        },
      }

      try {
        const sampleExports = evaluateSample(code, sampleConsole)
        const entries = normalizeCharts(sampleExports)
        const { actions = [], output = false } = sampleExports
        const isMulti = Array.isArray(sampleExports.charts)

        charts = renderCharts(chartsGrid, charts, entries, height, title)
        renderActions(actionsNode, actions, charts, isMulti)
        outputNode.hidden = !output
        refreshOutput(typeof output === 'string' ? output : undefined)
      } catch (error) {
        errorNode.textContent =
          error instanceof Error ? (error.stack ?? error.message) : String(error)
      }
    }

    editor = new SampleEditor({
      code: initialCode,
      onChange: render,
      parent: codeNode,
      tabs: tabsNode,
    })
    runButton.addEventListener('click', () => render(editor.value))
    copyButton.addEventListener('click', async () => {
      await copyText(editor.value)
      copyButton.textContent = 'Copied'
      setTimeout(() => {
        copyButton.textContent = 'Copy'
      }, 1200)
    })
    resetButton.addEventListener('click', () => {
      editor.setValue(initialCode)
      render(initialCode)
    })
    render(initialCode)
  }
}

if (!customElements.get('astro-chartjs-editor')) {
  customElements.define('astro-chartjs-editor', ChartEditorElement)
}
