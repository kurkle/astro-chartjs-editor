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

// One radio choice (2 values, targeting `options`) and one range choice
// (targeting `data`), so rebuildCharts() is exercised on both branches of
// the config a choice can reach into.
export const CHOICES_SAMPLE = `const config = {
  type: 'bar',
  data: {
    labels: ['A', 'B', 'C'],
    datasets: [{ borderWidth: 1, data: [3, 6, 9], label: 'Values' }],
  },
  options: {
    animation: false,
    indexAxis: 'x',
    plugins: { legend: false },
    scales: { x: { display: false }, y: { display: false } },
  },
}

module.exports = {
  config,
  choices: [
    { path: 'options.indexAxis', values: ['x', 'y'] },
    { max: 10, min: 0, path: 'data.datasets.0.borderWidth', step: 1 },
  ],
}`

// Same base config, with a select (5+ values) and a checkbox (values:
// [true, false]) choice, to exercise the two control kinds CHOICES_SAMPLE
// doesn't cover.
export const CHOICES_SELECT_CHECKBOX_SAMPLE = `const config = {
  type: 'bar',
  data: {
    labels: ['A', 'B', 'C'],
    datasets: [{ data: [3, 6, 9], label: 'Values' }],
  },
  options: {
    animation: false,
    plugins: { legend: false },
    scales: { x: { display: false }, y: { display: false } },
  },
}

module.exports = {
  config,
  choices: [
    { path: 'options.custom.mode', values: ['a', 'b', 'c', 'd', 'e'] },
    { path: 'options.custom.enabled', values: [true, false] },
  ],
}`

// A choices declaration missing both `values` and `min`/`max` -- invalid
// per the contract, and thrown from normalizeChoices() before any chart is
// ever created.
export const CHOICES_INVALID_SAMPLE = `const config = { type: 'bar', data: { labels: [], datasets: [] } }
module.exports = { choices: [{ path: 'options.x' }], config }`

// A valid declaration whose second option makes Chart.js itself throw once
// applied (an unregistered controller type), to exercise the failure path
// inside a choice's own click handler -- as opposed to CHOICES_INVALID_SAMPLE,
// which fails during the sample's initial evaluation.
export const CHOICES_BREAKS_ON_APPLY_SAMPLE = `const config = {
  type: 'bar',
  data: { labels: ['A'], datasets: [{ data: [1] }] },
  options: { animation: false, plugins: { legend: false } },
}
module.exports = { choices: [{ path: 'type', values: ['bar', 'not-a-real-chart-type'] }], config }`

// Animation left on (200ms, linear easing) specifically to prove a choice
// selection no longer restarts it -- the test reads the live chart's own
// geometry across frames (via Chart.getChart() and getDatasetMeta()), so
// this sample needs nothing beyond an ordinary animated config. Every other
// sample above disables animation for pixel-fixture determinism; this is
// the one place that needs it on.
export const CHOICES_ANIMATED_SAMPLE = `const config = {
  type: 'bar',
  data: { labels: ['A'], datasets: [{ data: [10], label: 'Value' }] },
  options: {
    animation: { duration: 200, easing: 'linear' },
    plugins: { legend: false },
    // A fixed y-axis range, not auto-scaled: with a single data point, an
    // auto-scaled axis rescales its max to match every new value, so the
    // bar would render at nearly the same height regardless of the value
    // behind it. Pinning min/max is what makes the rendered height actually
    // move when the choice below changes the value.
    scales: { x: { display: false }, y: { display: false, min: 0, max: 100 } },
  },
}

module.exports = {
  config,
  choices: [{ max: 100, min: 0, path: 'data.datasets.0.data.0', step: 1 }],
}`

// A `charts` block (two variants sharing one `data`/`options` object) paired
// with a choice, to prove the choice's rebuild reaches every entry in the
// block rather than only the first.
export const CHOICES_WITH_CHARTS_SAMPLE = `const base = {
  labels: ['A', 'B', 'C'],
  datasets: [{ borderWidth: 1, data: [3, 6, 9], label: 'Values' }],
}
const commonOptions = {
  animation: false,
  plugins: { legend: false },
  scales: { x: { display: false }, y: { display: false } },
}
const configA = { type: 'bar', data: base, options: commonOptions }
const configB = { type: 'line', data: base, options: commonOptions }

module.exports = {
  charts: [
    { config: configA, title: 'Bars' },
    { config: configB, title: 'Line' },
  ],
  choices: [{ max: 10, min: 0, path: 'data.datasets.0.borderWidth', step: 1 }],
}`
