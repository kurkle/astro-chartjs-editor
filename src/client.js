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
    // The type each chart in `charts` is actually running as, tracked here
    // rather than read back from `entry.config.type`: applyChoices() writes
    // into that same config object in place, so after a rejected selection
    // (see rebuildCharts() below) it can hold a value the chart was never
    // actually updated to show. `chart.config.type` would read that
    // rejected value back on the next attempt and compare against itself.
    let currentTypes = []

    // Applies every choice's current selection to each entry's config, in
    // place -- setValueAtPath() writes the value at its path directly into
    // whatever object is already there, the same as Chart.js's own docs
    // tell readers to do (change an option on the config you have, call
    // update()), rather than swapping in a whole new one. Shared by the
    // from-scratch render below and by rebuildCharts()'s in-place update.
    const buildEntries = () =>
      baseEntries.map((entry) => ({
        ...entry,
        config: applyChoices(entry.config, choiceDescriptors, selections),
      }))

    // The only place that creates Chart instances: the initial render of a
    // sample's charts, and re-running its code (Run/Reset). Either of those
    // can change the chart count, a chart's type, or anything else about the
    // configuration in ways a live instance can't absorb, so this always
    // destroys whatever charts exist and builds fresh ones.
    const renderAllCharts = () => {
      const built = buildEntries()
      charts = renderCharts(chartsGrid, charts, built, height, title)
      currentTypes = built.map((entry) => entry.config.type)
      renderActions(actionsNode, currentActions, charts, currentIsMulti)
    }

    // Applies a choice selection to the charts already on screen by
    // mutating them in place instead of recreating them. A live chart's
    // `chart.config` already wraps the exact same `data`/`options` objects
    // buildEntries() just wrote into (Chart.js's Config keeps the object it
    // was constructed with; see initConfig()/initData() in Chart.js's
    // source, which mutate and return their argument rather than cloning
    // it) -- so by the time buildEntries() returns, the live chart's own
    // config already holds the new values, and all that's left to do is
    // ask it to redraw. `chart.update()` runs `config.update()`, which
    // clears Chart.js's per-instance option caches (`_scopeCache`,
    // `_resolverCache`) before anything is resolved again, so nothing
    // stale from the previous selection survives.
    //
    // A chart's `type` is the one thing that can't be changed this way --
    // Chart.js has no supported path for turning a live instance into a
    // different controller/element/scale trio -- so a choice that would
    // change it throws instead of silently doing nothing or quietly
    // recreating the chart. Compared against `currentTypes`, not against
    // `entry.config.type` freshly read off the chart's own config: that
    // object was just mutated in place by buildEntries(), so it can no
    // longer say what the type was *before* this selection. Every chart is
    // checked before any of them is updated, so a rejected selection never
    // leaves some charts redrawn and others not -- and `currentTypes` is
    // only advanced past the ones actually redrawn, so a rejected
    // selection's stray write to `entry.config.type` doesn't fool the next
    // attempt into comparing a corrupted value against itself.
    const rebuildCharts = () => {
      const built = buildEntries()

      for (const [index, entry] of built.entries()) {
        if (entry.config.type !== currentTypes[index]) {
          throw new TypeError(
            `Sample \`choices\` path 'type' would change this chart's type from '${currentTypes[index]}' to '${entry.config.type}'; changing a chart's type through \`choices\` isn't supported.`
          )
        }
      }

      for (const chart of charts) chart.update()
      currentTypes = built.map((entry) => entry.config.type)

      // No renderActions() call here, deliberately: `charts` keeps the same
      // array holding the same instances (nothing above reassigns it), and
      // each action button's click handler closes over that outer `charts`
      // variable rather than a snapshot of it -- so it already reaches the
      // right, still-live objects without being rebound.
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
        renderAllCharts()
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
