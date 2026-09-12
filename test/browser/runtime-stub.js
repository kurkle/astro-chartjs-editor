/**
 * Stands in for a project's runtime module (the thing `runtime` points at in
 * `chartEditor({ runtime })`), aliased over `virtual:astro-chartjs-editor/runtime`
 * in vitest.browser.config.js since that virtual module only exists once the
 * Astro integration's Vite plugin has registered it.
 *
 * This is exactly the runtime module documented in README.md's "Runtime
 * module" section, so `src/client.js` is exercised against a real Chart.js
 * instance, not a mock.
 */
import Chart from 'chart.js/auto'

export const globals = { Chart }

export function createChart(canvas, config) {
  return new Chart(canvas, config)
}
