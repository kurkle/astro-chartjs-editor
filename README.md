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
      sourceBaseUrl: 'https://github.com/kurkle/chartjs-chart-sankey/blob/main/',
    }),
  ],
})
```

(Copied from `chartjs-chart-sankey`'s `astro.config.mjs`.)

Integration options:

| Option          | Required | Description                                                                                                                                       |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime`       | yes      | Path to the runtime module, resolved relative to the Astro project root. The integration throws immediately if this is missing.                     |
| `sourceBaseUrl` | no       | Base URL used to build a "View source" link for each sample. See [`sourceBaseUrl`](#sourcebaseurl) below.                                            |
| `sourceRoot`    | no       | Directory that sample file paths are made relative to when building the source link, resolved relative to the project root. Defaults to the project root. |

The integration injects a page script (`import '@kurkle/astro-chartjs-editor/client'`) and registers a remark plugin that transforms `chart-editor` fences (see [Samples](#samples)). It detects three ways Astro's Markdown pipeline can be configured and adapts without ever silently dropping the plugin:

- if `markdown.processor` is a Sätteri processor with an `options.mdastPlugins` array, it pushes its own mdast plugin into that array;
- otherwise, if `markdown.processor.options.remarkPlugins` is already an array, it pushes `[remarkChartEditor, options]` into that array;
- otherwise, it sets `markdown.remarkPlugins` on the config it hands to `updateConfig`.

## Runtime module

The runtime module you point `runtime` at is loaded through a virtual Vite module (`virtual:astro-chartjs-editor/runtime`) and must export `globals` and `createChart`:

```js
import Chart from 'chart.js/auto'
import { Flow, SankeyController } from '../dist/chartjs-chart-sankey.esm.js'
import * as helpers from './scripts/helpers.js'
import * as Utils from './scripts/utils.js'

Chart.register(SankeyController, Flow)

export const globals = { Chart, Utils, helpers }

export function createChart(canvas, config) {
  return new Chart(canvas, config)
}
```

(Copied and lightly trimmed from `chartjs-chart-sankey`'s `docs/chart-runtime.js`, which is the only real-world consumer today.)

### `globals`

`globals` is a plain object. Every key becomes a bare identifier that sample code can reference directly, with the corresponding value bound as its value — sankey exposes only `Chart`, but nothing stops a runtime module from exposing more, and a future matrix/treemap runtime module is expected to add its own `Utils` and/or `helpers` exports the same way, alongside `Chart`.

Two constraints, enforced at sample-evaluation time (in the browser, per sample), not at build time:

- every key of `globals` must be a valid JavaScript identifier (`/^[$A-Z_a-z][$\w]*$/`). A key that isn't (e.g. one containing a hyphen) makes every sample throw `Invalid sample global: <name>` as soon as it's rendered.
- names are not sandboxed beyond that check — a sample can shadow a global by declaring a same-named local variable, same as any other JavaScript scoping.

### `createChart(canvas, config)`

Called once per render with the `<canvas>` element and the sample's evaluated `config`. It must return the chart instance. The client owns the chart's lifecycle from that point:

- before every re-render (typing in the editor after the 500ms debounce, clicking **Run**, or clicking **Reset**), it calls `chart?.destroy()` on the previous instance and then calls `createChart` again to get a new one.
- if the sample throws while being evaluated, `createChart` is **not** called for that render — the previously rendered chart (if any) is left on screen untouched, and only the error message is updated. On the very first render, if the initial sample throws, no chart is created at all and the canvas stays blank.
- there is currently no explicit teardown when the custom element itself is disconnected from the DOM (no `disconnectedCallback`) — only re-renders destroy the previous chart. This is existing behavior, not something this change alters.

### `sourceBaseUrl`

When set, each rendered sample gets a **View source** link. The link is built as `sourceBaseUrl + <path of the Markdown file, relative to sourceRoot, with OS separators normalized to '/'>`. `sourceRoot` defaults to the Astro project root, so with the example above and a sample fence living in `chartjs-chart-sankey`'s `src/content/docs/samples/basic.md` (relative to that repo's root, where its `astro.config.mjs` also lives), the link becomes `https://github.com/kurkle/chartjs-chart-sankey/blob/main/src/content/docs/samples/basic.md`. If `sourceBaseUrl` isn't set (or the file's path isn't available, e.g. some Sätteri contexts without a `fileURL`), the link is omitted entirely — the toolbar just doesn't get a "View source" entry, nothing errors.

## Samples

Mark a JavaScript fence with `chart-editor`:

````md
```js chart-editor height=500
// <block:data:1>
const data = {
  datasets: [
    {
      label: 'Basic sankey',
      data: [
        { from: 'A', to: 'B', flow: 10 },
        { from: 'A', to: 'C', flow: 5 },
      ],
    },
  ],
}
// </block:data>

// <block:config:0>
const config = {
  type: 'sankey',
  data,
}
// </block:config>

module.exports = {
  config,
}
```
````

(Copied and trimmed from `chartjs-chart-sankey`'s `src/content/docs/samples/basic.md`, with `height=500` added to the fence's meta to illustrate the parameter documented below — the real sample doesn't set it and gets the `420` default instead.)

Only a fence with `js` or `javascript` as its language **and** the standalone word `chart-editor` in its meta string is transformed. Anything else (wrong language, missing marker) is left as a normal, unprocessed code fence — no error, no chart editor UI.

### Fence meta parameters

The meta string after `chart-editor` is parsed for two named parameters (`name=value`, quoted or unquoted):

| Parameter | Falls back to (in order)             | Default | Notes                                             |
| --------- | ------------------------------------- | ------- | -------------------------------------------------- |
| `height`  | frontmatter `chartHeight`              | `420`   | Sets the canvas height in pixels.                  |
| `title`   | frontmatter `chartTitle`, then `title` | `''`    | Shown above the chart; hidden entirely when empty. |

This is what the `height=500` in the example above sets — a 500px-tall canvas instead of the 420px default. Parsing of both is covered by `test/remark.test.js` (e.g. `height=600` and `height=500` fences, plus a default-height case).

No other parameters are read. Anything else present in the meta string is silently ignored — it is not an error, and it has no effect.

### Block markers

Chart.js's own samples use a block-marker comment syntax to split one JavaScript source into labeled, ordered tabs:

```js
// <block:name:order>
...code...
// </block:name>
```

- **Markers are entirely optional.** If none are found, the whole fence becomes a single tab labeled `JS`.
- **`order`** is a non-negative integer that controls left-to-right tab order; lower first. It's optional — a marker without a trailing `:order` (e.g. `<block:name>`) defaults to `0`.
- **Colliding order numbers** don't error: ties are broken by the block's appearance order in the source (the sort is stable), so two blocks both at order `0` keep their original left-to-right order.
- **Code outside any named block** (e.g. anything before the first marker) is still executed as part of the sample — it's concatenated back in when the code runs — but it is **not** shown as its own tab and can't be edited directly in the UI. In practice, every part of a sample that should be visible/editable needs to be inside a named block.
- The closing tag ignores whatever follows `block:` up to `>` other than the name — `// </block:name>` — and doesn't itself carry an order number.

## `module.exports` contract

The evaluated sample must set `module.exports` to an object. Three fields are read:

```js
module.exports = {
  config, // required: passed to createChart(canvas, config)
  actions: [
    // optional, default []
    { name: 'Randomize', handler: (chart) => {
      /* mutate chart.data and call chart.update() */
    } },
  ],
  output: false, // optional, default false
}
```

- **`config`** is required in practice (it's what gets passed to `createChart`); there's no explicit validation if it's missing, so an undefined `config` is passed straight through to the runtime's `createChart`.
- **`actions`** is a list of `{ name, handler }` pairs. Each renders as a button above the chart; clicking it calls `handler(chart)` with the live chart instance. **This is already supported today** — it is not a gap that matrix/treemap migration would need to add. It just isn't documented or exercised by the only current consumer (sankey), which is why it wasn't visible from outside `src/`.
- **`output`** controls an "Output" panel below the chart that mirrors `console.log(...)` calls made by the sample (up to the last 50 messages, newline-joined) in addition to the real console. `false` (default) hides the panel entirely. `true` shows it, starting with a `...` placeholder until the first log call. A string shows it starting with that string as the placeholder instead of `...`. This is also already supported and, like `actions`, undocumented and unused by sankey today.

## Error behavior

| Situation                                                       | What happens                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A fence isn't `js`/`javascript`, or is missing the `chart-editor` marker | Left completely untouched by the remark plugin. Renders as an ordinary fenced code block. Never an error.                                                                                                       |
| Sample code throws when evaluated (syntax error or runtime throw) | Caught in the browser, per render. The error's stack (or message) is shown in an inline error element; the previously rendered chart, if any, is left as-is. This never touches the Astro build — remark only base64-encodes the source text at build time and never evaluates it. |
| `runtime` points at a path with no matching file                  | Not checked at all by `integration.js` — the path is resolved with `path.resolve()` regardless of whether anything exists there. The virtual module's `load()` hook then emits `export * from "<that path>"` literally. Based on how Vite/Rollup resolve `load()` output, this becomes a **module resolution failure at dev-server/build time**, not a browser-only error — but this project has no Astro project scaffolded to actually run `astro build` against, so this specific claim is inferred from source and standard Vite/Rollup module-resolution semantics, not executed. Treat it as high-confidence but unverified by an actual build. |

## Exports

| Subpath                          | Module              |
| --------------------------------- | -------------------- |
| `@kurkle/astro-chartjs-editor`     | `src/integration.js` (the default export, `chartEditor(options)`) |
| `@kurkle/astro-chartjs-editor/client` | `src/client.js` (the page script injected automatically; you shouldn't need to import it yourself) |
| `@kurkle/astro-chartjs-editor/remark` | `src/remark.js` (`remarkChartEditor`, `satteriChartEditor`) |
| `@kurkle/astro-chartjs-editor/sections` | `src/sections.js` (`parseSections`, used internally to split block-marker code into tabs) |
