/**
 * Sample source strings used by the browser specs.
 *
 * Every chart config below disables the legend, axis ticks and axis labels
 * (`plugins.legend`, `scales.*.display`) so the rendered canvas carries no
 * text. That keeps the pixel fixtures comparable across platforms: a PNG
 * captured on macOS does not need to match Linux's font antialiasing,
 * because there is no text to antialias.
 */

export const BASIC_SAMPLE = `// <block:data:1>
const data = {
  labels: ['A', 'B', 'C'],
  datasets: [{ label: 'Values', data: [3, 6, 9] }],
}
// </block:data>

// <block:config:0>
const config = {
  type: 'bar',
  data,
  options: {
    animation: false,
    plugins: { legend: false },
    scales: { x: { display: false }, y: { display: false } },
  },
}
// </block:config>

module.exports = { config }`

// A drop-in replacement for the `data` block above: same shape, different
// values, so swapping it in proves editing actually re-renders the chart.
// Kept on one line deliberately: CodeMirror auto-indents after a typed
// newline (part of `basicSetup`), which stacks with any manually-typed
// indentation in the string and makes the exact resulting text depend on
// exactly how the newline was typed. A single line has no newline to
// auto-indent after.
export const EDITED_DATA_CODE = `const data = { labels: ['A', 'B', 'C'], datasets: [{ label: 'Values', data: [9, 3, 6] }] }`

// A drop-in replacement for the `config` block that throws at evaluation
// time (a plain ReferenceError, not a syntax error) to exercise the error
// path without touching the surrounding block markers.
export const BROKEN_CONFIG_CODE = `const config = brokenHelperThatDoesNotExist()`

export const ACTIONS_SAMPLE = `const config = {
  type: 'bar',
  data: { labels: ['A'], datasets: [{ data: [1] }] },
  options: {
    animation: false,
    plugins: { legend: false },
    scales: { x: { display: false }, y: { display: false } },
  },
}

module.exports = {
  config,
  actions: [
    {
      name: 'Bump',
      handler: (chart) => {
        chart.data.datasets[0].data = chart.data.datasets[0].data.map((value) => value + 1)
        chart.update()
      },
    },
  ],
}`

export const OUTPUT_SAMPLE = `console.log('ready')
const config = {
  type: 'bar',
  data: { labels: ['A'], datasets: [{ data: [1] }] },
  options: { animation: false, plugins: { legend: false } },
}
module.exports = { config, output: true }`

const MULTI_BASE = `const base = {
  labels: ['A', 'B', 'C'],
  datasets: [{ label: 'Values', data: [3, 6, 9] }],
}

const commonOptions = {
  animation: false,
  plugins: { legend: false },
  scales: { x: { display: false }, y: { display: false } },
}

const configA = { type: 'bar', data: base, options: commonOptions }
const configB = { type: 'line', data: base, options: commonOptions }`

export const MULTI_SAMPLE = `${MULTI_BASE}

module.exports = {
  charts: [
    { title: 'Bars', config: configA },
    { title: 'Line', config: configB },
  ],
}`

// Same two charts, without per-entry titles: the title renders as a real DOM
// heading (`.chartjs-editor__chart-title`), and its text height varies
// slightly by browser font metrics -- enough to shift the grid's overall
// bounding box a couple of pixels. The pixel fixture screenshots that whole
// box, so it needs the textless version; the titles are only meaningful for
// the behavioral checks in charts.spec.js.
export const MULTI_SAMPLE_TEXTLESS = `${MULTI_BASE}

module.exports = {
  charts: [{ config: configA }, { config: configB }],
}`

export const MULTI_ACTIONS_SAMPLE = `${MULTI_BASE}

module.exports = {
  charts: [
    { title: 'Bars', config: configA },
    { title: 'Line', config: configB },
  ],
  actions: [
    {
      name: 'BumpAll',
      handler: (charts) => {
        for (const chart of charts) {
          chart.data.datasets[0].data = chart.data.datasets[0].data.map((value) => value + 1)
          chart.update()
        }
      },
    },
  ],
}`

export const CONFIG_AND_CHARTS_SAMPLE = `const config = { type: 'bar', data: { labels: [], datasets: [] } }
module.exports = { config, charts: [{ config }] }`

export const CHARTS_MISSING_CONFIG_SAMPLE = `module.exports = { charts: [{ title: 'No config here' }] }`
