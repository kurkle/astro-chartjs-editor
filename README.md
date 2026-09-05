# @kurkle/astro-chartjs-editor

[![npm](https://img.shields.io/npm/v/@kurkle/astro-chartjs-editor.svg)](https://www.npmjs.com/package/@kurkle/astro-chartjs-editor)
[![release](https://img.shields.io/github/release/kurkle/astro-chartjs-editor.svg?style=flat-square)](https://github.com/kurkle/astro-chartjs-editor/releases/latest)
![GitHub](https://img.shields.io/github/license/kurkle/astro-chartjs-editor.svg)

Editable Chart.js samples directly in Astro Markdown.

## Setup

```js
import chartEditor from '@kurkle/astro-chartjs-editor'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [
    chartEditor({
      runtime: './docs/chart-runtime.js',
      sourceBaseUrl: 'https://github.com/example/project/blob/main/',
    }),
  ],
})
```

The runtime module creates charts and exposes any globals available to sample code:

```js
import Chart from 'chart.js/auto'

export const globals = { Chart }
export function createChart(canvas, config) {
  return new Chart(canvas, config)
}
```

## Samples

Mark a JavaScript fence with `chart-editor`:

````md
```js chart-editor height=500
module.exports = {
  config: {
    type: 'bar',
    data: { datasets: [] },
  },
}
```
````

Use Chart.js block markers for ordered tabs:

```js
// <block:data:1>
const data = { datasets: [] }
// </block:data>

// <block:config:0>
const config = { type: 'bar', data }
// </block:config>

module.exports = { config }
```
