import { normalizeCharts } from './charts.js'
import {
  applyChoices,
  indexOfValue,
  initialValueFor,
  normalizeChoices,
  readoutText,
} from './choices.js'
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

/**
 * Renders an error into `errorNode`: the message on its own line first,
 * then the stack (when there is one) behind a `<details>` disclosure.
 *
 * `client.js` used to show `error.stack ?? error.message` alone. V8 puts
 * the error's name and message at the top of `.stack`, but Firefox's
 * `.stack` is call frames only -- no name, no message -- so the panel
 * showed a bare call stack with no indication of what actually went wrong.
 * Showing `error.message` explicitly fixes that in both engines.
 */
function renderError(errorNode, error) {
  errorNode.replaceChildren()
  if (!(error instanceof Error)) {
    errorNode.textContent = String(error)
    return
  }
  const messageNode = document.createElement('div')
  messageNode.className = 'chartjs-editor__error-message'
  messageNode.textContent = error.message
  errorNode.append(messageNode)
  if (error.stack) {
    const details = document.createElement('details')
    details.className = 'chartjs-editor__error-stack'
    const summary = document.createElement('summary')
    summary.textContent = 'Stack trace'
    const stackNode = document.createElement('pre')
    stackNode.textContent = error.stack
    details.append(summary, stackNode)
    errorNode.append(details)
  }
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
  // The wrapper, not the canvas, carries the block's actual height
  // (data-height): see .chartjs-editor__canvas-wrapper in styles.css for
  // why the canvas can't drive its own container's size here.
  const canvasWrapper = document.createElement('div')
  canvasWrapper.className = 'chartjs-editor__canvas-wrapper'
  canvasWrapper.style.setProperty('--chartjs-editor-chart-height', `${height}px`)
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = height
  canvas.setAttribute('aria-label', entry.title || fallbackTitle || 'Chart.js sample')
  canvas.setAttribute('role', 'img')
  canvasWrapper.append(canvas)
  chartNode.append(canvasWrapper)
  chartsGrid.append(chartNode)
  return canvas
}

// Chart.js sizes a responsive chart (the default) from its canvas's parent
// element, not from the canvas's own width/height attributes -- but only
// once `maintainAspectRatio` is off; otherwise it keeps stretching or
// shrinking the canvas to preserve those attributes' aspect ratio instead
// of filling the wrapper .chartjs-editor__canvas-wrapper actually gives it.
// Defaulted here, not baked into every sample, and only when the sample's
// own config hasn't set it -- an explicit choice a sample makes (to keep an
// aspect ratio deliberately, say) is never overridden.
function withResponsiveDefault(config) {
  const options = config?.options
  if (options && Object.hasOwn(options, 'maintainAspectRatio')) return config
  return { ...config, options: { ...options, maintainAspectRatio: false } }
}

function renderCharts(chartsGrid, previousCharts, entries, height, fallbackTitle) {
  for (const previousChart of previousCharts) previousChart?.destroy()
  chartsGrid.replaceChildren()
  return entries.map((entry) => {
    const canvas = appendChartCanvas(chartsGrid, entry, height, fallbackTitle)
    return createChart(canvas, withResponsiveDefault(entry.config))
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

function uid() {
  return `chartjs-editor-${crypto.randomUUID()}`
}

const ARROW_STEPS = { ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1 }

/**
 * A segmented row acting as a `radiogroup`: arrow keys move the selection
 * (not just focus, matching native radio-group behavior), and only the
 * active segment sits in the tab order.
 */
function buildRadioControl(choice, selections, onSelect) {
  const labelId = uid()
  const label = document.createElement('span')
  label.id = labelId
  label.className = 'chartjs-editor__choice-label'
  label.textContent = choice.label

  const group = document.createElement('div')
  group.className = 'chartjs-editor__segmented'
  group.setAttribute('role', 'radiogroup')
  group.setAttribute('aria-labelledby', labelId)

  const buttons = choice.options.map((option) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'chartjs-editor__segment'
    button.setAttribute('role', 'radio')
    button.textContent = option.label
    return button
  })
  group.append(...buttons)

  const applyIndex = (index, focus) => {
    selections[choice.path] = choice.options[index].value
    for (const [i, button] of buttons.entries()) {
      const active = i === index
      button.classList.toggle('active', active)
      button.setAttribute('aria-checked', String(active))
      button.tabIndex = active ? 0 : -1
      if (active && focus) button.focus()
    }
  }

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => {
      applyIndex(index, false)
      onSelect()
    })
  })
  group.addEventListener('keydown', (event) => {
    const step = ARROW_STEPS[event.key]
    if (!step) return
    event.preventDefault()
    const current = buttons.findIndex((button) => button.classList.contains('active'))
    applyIndex((current + step + buttons.length) % buttons.length, true)
    onSelect()
  })

  applyIndex(Math.max(0, indexOfValue(choice.options, selections[choice.path])), false)
  return { control: group, label }
}

function buildSelectControl(choice, selections, onSelect) {
  const id = uid()
  const label = document.createElement('label')
  label.htmlFor = id
  label.textContent = choice.label

  const select = document.createElement('select')
  select.id = id
  for (const [index, option] of choice.options.entries()) {
    const optionNode = document.createElement('option')
    optionNode.value = String(index)
    optionNode.textContent = option.label
    select.append(optionNode)
  }
  select.value = String(Math.max(0, indexOfValue(choice.options, selections[choice.path])))
  select.addEventListener('change', () => {
    selections[choice.path] = choice.options[Number(select.value)].value
    onSelect()
  })
  return { control: select, label }
}

function buildRangeControl(choice, selections, onSelect) {
  const id = uid()
  const label = document.createElement('label')
  label.htmlFor = id
  label.textContent = choice.label

  const input = document.createElement('input')
  input.type = 'range'
  input.id = id
  input.min = String(choice.min)
  input.max = String(choice.max)
  input.step = String(choice.step)
  const current = selections[choice.path]
  input.value = String(typeof current === 'number' ? current : choice.min)
  input.addEventListener('input', () => {
    selections[choice.path] = input.valueAsNumber
    onSelect()
  })
  return { control: input, label }
}

function buildCheckboxControl(choice, selections, onSelect) {
  const id = uid()
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.id = id
  input.checked = Boolean(selections[choice.path])
  input.addEventListener('change', () => {
    selections[choice.path] = input.checked
    onSelect()
  })

  const label = document.createElement('label')
  label.htmlFor = id
  label.textContent = choice.label
  return { control: input, label }
}

const CONTROL_BUILDERS = {
  checkbox: buildCheckboxControl,
  radio: buildRadioControl,
  range: buildRangeControl,
  select: buildSelectControl,
}

/**
 * One choice's control group: its label, the control itself, and a
 * copy-pasteable `path: value` readout. The readout matters as much as the
 * control -- the code panel it stands in for is collapsed by default (see
 * .chartjs-editor__details), so this is what teaches the syntax to a reader
 * who never opens it.
 */
function buildChoiceControl(choice, selections, onSelect) {
  const wrapper = document.createElement('div')
  wrapper.className = 'chartjs-editor__choice'

  const output = document.createElement('output')
  output.className = 'chartjs-editor__readout'
  output.setAttribute('aria-live', 'polite')
  output.textContent = readoutText(choice, selections[choice.path])

  const notify = () => {
    output.textContent = readoutText(choice, selections[choice.path])
    onSelect()
  }
  const { control, label } = CONTROL_BUILDERS[choice.control](choice, selections, notify)

  wrapper.append(label, control, output)
  return wrapper
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
    // 'open'/'collapsed' (from a fence's code= meta) force the code panel's
    // initial state either way; anything else -- unset, or an unrecognized
    // value -- falls through to the automatic rule below, computed once the
    // sample's choiceDescriptors are known (see the `detailsNode.open =`
    // assignment after the initial render() call).
    const codeOverride = this.dataset.code

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
    const choicesNode = document.createElement('div')
    choicesNode.className = 'chartjs-editor__choices'
    choicesNode.hidden = true
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

    const detailsNode = document.createElement('details')
    detailsNode.className = 'chartjs-editor__details'
    const summaryNode = document.createElement('summary')
    summaryNode.className = 'chartjs-editor__summary'
    summaryNode.textContent = 'Full configuration'
    detailsNode.append(summaryNode, editorNode)

    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = editorStyles
    root.replaceChildren(style, header, chartsGrid, actionsNode, choicesNode, detailsNode)

    let charts = []
    let editor
    let baseEntries = []
    let choiceDescriptors = []
    let selections = {}
    let currentActions = []
    let currentIsMulti = false

    // Applies every choice's current selection to a fresh clone of each
    // entry's config, then recreates every chart from the rebuilt configs
    // (never chart.options + update()). This is what applyChoices() +
    // renderCharts() give for free: the result doesn't depend on the order
    // options happen to resolve in, and holds the same way whether a choice
    // targets `options` or `data`.
    const rebuildCharts = () => {
      const built = baseEntries.map((entry) => ({
        ...entry,
        config: applyChoices(entry.config, choiceDescriptors, selections),
      }))
      charts = renderCharts(chartsGrid, charts, built, height, title)
      renderActions(actionsNode, currentActions, charts, currentIsMulti)
    }

    const applySelectionChange = () => {
      try {
        rebuildCharts()
        errorNode.replaceChildren()
      } catch (error) {
        renderError(errorNode, error)
      }
    }

    const renderChoices = () => {
      choicesNode.replaceChildren()
      choicesNode.hidden = choiceDescriptors.length === 0
      for (const choice of choiceDescriptors) {
        choicesNode.append(buildChoiceControl(choice, selections, applySelectionChange))
      }
    }

    // CodeMirror measures its own layout while building the initial view,
    // which happens while <details> is still closed (offsetWidth/Height 0
    // for anything inside it). Opening the panel doesn't fire a resize
    // event for its now-visible descendants on its own, so ask the view to
    // remeasure explicitly once it becomes visible.
    detailsNode.addEventListener('toggle', () => {
      if (detailsNode.open) editor?.view.requestMeasure()
    })

    const render = (code) => {
      errorNode.replaceChildren()
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
        const descriptors = normalizeChoices(sampleExports)
        const { actions = [], output = false } = sampleExports

        baseEntries = entries
        choiceDescriptors = descriptors
        currentActions = actions
        currentIsMulti = Array.isArray(sampleExports.charts)
        selections = {}
        for (const choice of choiceDescriptors) {
          selections[choice.path] = initialValueFor(choice, entries[0]?.config)
        }

        renderChoices()
        rebuildCharts()
        outputNode.hidden = !output
        refreshOutput(typeof output === 'string' ? output : undefined)
      } catch (error) {
        renderError(errorNode, error)
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

    // The automatic rule: a sample with no `choices` has nothing standing
    // in for the full configuration, so that *is* the thing the sample
    // demonstrates -- open by default. A sample with one or more `choices`
    // already surfaces the setting worth calling out via its control, so
    // the panel starts collapsed (see README's "The code panel"). This
    // runs once, after the initial render() populated choiceDescriptors
    // (or left it at its `[]` default if the initial code threw) -- later
    // edits/Run don't reopen or recollapse a panel the reader may have
    // already toggled themselves.
    if (codeOverride === 'open') {
      detailsNode.open = true
    } else if (codeOverride === 'collapsed') {
      detailsNode.open = false
    } else {
      detailsNode.open = choiceDescriptors.length === 0
    }
  }
}

if (!customElements.get('astro-chartjs-editor')) {
  customElements.define('astro-chartjs-editor', ChartEditorElement)
}
