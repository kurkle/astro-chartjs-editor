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
      sourceBaseUrl: 'https://github.com/you/your-project/blob/main/',
    }),
  ],
})
```

Integration options:

| Option          | Required | Description                                                                                                                                       |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime`       | yes      | Path to the runtime module, resolved relative to the Astro project root. The integration throws immediately if this is missing.                     |
| `sourceBaseUrl` | no       | Base URL used to build a "View source" link for each sample. See [`sourceBaseUrl`](#sourcebaseurl) below.                                            |
| `sourceRoot`    | no       | Directory that sample file paths are made relative to when building the source link, resolved relative to the project root. Defaults to the project root. |

The integration injects a page script (`import '@kurkle/astro-chartjs-editor/client'`) and registers a remark plugin that transforms `chart-editor` fences (see [Samples](#samples)). It detects three ways Astro's Markdown pipeline can be configured and adapts without ever silently dropping the plugin:

- if `markdown.processor` is a satteri processor with an `options.mdastPlugins` array, it pushes its own mdast plugin into that array;
- otherwise, if `markdown.processor.options.remarkPlugins` is already an array, it pushes `[remarkChartEditor, options]` into that array;
- otherwise, it sets `markdown.remarkPlugins` on the config it hands to `updateConfig`.

## Runtime module

The runtime module you point `runtime` at is loaded through a virtual Vite module (`virtual:astro-chartjs-editor/runtime`) and must export `globals` and `createChart`:

```js
import Chart from 'chart.js/auto'

export const globals = { Chart }

export function createChart(canvas, config) {
  return new Chart(canvas, config)
}
```

### `globals`

`globals` is a plain object. Every key becomes a bare identifier that sample code can reference directly, bound to the corresponding value. `Chart` is the only export any sample needs by default, but a runtime module is free to export as many additional named values as it wants the same way — for example, helper modules that a chart type's own samples rely on. Sample code doesn't need to know or care where an identifier came from, only that `globals` exposed it.

Two constraints, enforced at sample-evaluation time (in the browser, per sample), not at build time:

- every key of `globals` must be a valid JavaScript identifier (`/^[$A-Z_a-z][$\w]*$/`). A key that isn't (e.g. one containing a hyphen) makes every sample throw `Invalid sample global: <name>` as soon as it's rendered.
- names are not sandboxed beyond that check — a sample can shadow a global by declaring a same-named local variable, same as any other JavaScript scoping.

### `createChart(canvas, config)`

Called once per render with the `<canvas>` element and the sample's evaluated `config`. It must return the chart instance. The client owns the chart's lifecycle from that point:

- before every re-render (typing in the editor after the 500ms debounce, clicking **Run**, or clicking **Reset**), it calls `chart?.destroy()` on the previous instance and then calls `createChart` again to get a new one.
- if the sample throws while being evaluated, `createChart` is **not** called for that render — the previously rendered chart (if any) is left on screen untouched, and only the error message is updated. On the very first render, if the initial sample throws, no chart is created at all and the canvas stays blank.
- there is currently no explicit teardown when the custom element itself is disconnected from the DOM (no `disconnectedCallback`) — only re-renders destroy the previous chart. This is existing behavior, not something this change alters.

### `sourceBaseUrl`

When set, each rendered sample gets a **View source** link. The link is built as `sourceBaseUrl + <path of the Markdown file, relative to sourceRoot, with OS separators normalized to '/'>`. `sourceRoot` defaults to the Astro project root. For example, with `sourceBaseUrl: 'https://github.com/example/project/blob/main/'` and a sample fence in a file at `docs/sample.md` (relative to `sourceRoot`), the link becomes `https://github.com/example/project/blob/main/docs/sample.md`.

If `sourceBaseUrl` isn't set, or the file's path isn't available (`file.path` for the remark plugin, or `context.fileURL` for the satteri code visitor — both are optional inputs the caller may leave unset), the link is omitted entirely — the toolbar just doesn't get a "View source" entry, nothing errors.

## Samples

Mark a JavaScript fence with `chart-editor`:

````md
```js chart-editor height=500
// <block:data:1>
const data = {
  labels: ['Q1', 'Q2', 'Q3', 'Q4'],
  datasets: [
    {
      label: 'Revenue',
      data: [12, 19, 8, 15],
    },
  ],
}
// </block:data>

// <block:config:0>
const config = {
  type: 'bar',
  data,
}
// </block:config>

module.exports = {
  config,
}
```
````

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

The evaluated sample must set `module.exports` to an object. It must export **exactly one** of `config` or `charts` — plus, optionally, `actions` and `output`.

### Single chart: `config`

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

This is the original, single-canvas shape and its behavior is unchanged.

- **`config`** is passed straight through to the runtime's `createChart`.
- **`actions`** is a list of `{ name, handler }` pairs. Each renders as a button above the chart(s); clicking it calls `handler(chart)` with the live chart instance.
- **`output`** controls an "Output" panel below the chart(s) that mirrors `console.log(...)` calls made by the sample (up to the last 50 messages, newline-joined) in addition to the real console. `false` (default) hides the panel entirely. `true` shows it, starting with a `...` placeholder until the first log call. A string shows it starting with that string as the placeholder instead of `...`.

### Multiple charts: `charts`

To render more than one chart from a single editor block — for example, the same base config with one option toggled, so the reader sees both variants side by side instead of two separate, fully-duplicated blocks — export `charts` instead of `config`:

```js
module.exports = {
  charts: [
    { title: 'Without nodeMinSize', config: configA },
    { title: 'With nodeMinSize', config: configB },
  ],
}
```

- `charts` is an array; each entry requires `config` and may optionally set `title`. `title` renders as a small heading above that entry's canvas (this is separate from the fence's own `title=` meta parameter, which still labels the whole block).
- One editor, one **Run**/**Copy**/**Reset** toolbar, and one error area are shared by all entries. Every canvas in the block is destroyed and recreated on each render (typing after the debounce, **Run**, or **Reset**).
- **`actions`** and **`output`** work the same as above, except an action's `handler` receives the **array of chart instances** (in entry order) instead of a single chart, since there's more than one to act on.
- The chart grid lays out with CSS grid (`repeat(auto-fit, minmax(320px, 1fr))`), so entries sit side by side on wide viewports and stack on narrow ones (including Starlight's ~600px content column).

### Validation

Exporting both `config` and `charts`, or neither, throws immediately when the sample is evaluated (shown in the block's error area, same as any other sample error) rather than silently picking one:

| Situation                              | Error                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Both `config` and `charts` exported     | `Sample exports both \`config\` and \`charts\`. Export only one: ...` |
| Neither `config` nor `charts` exported  | `Sample must export either \`config\` ... or \`charts\` ...`          |
| `charts` is not an array                | `Sample \`charts\` must be an array of \`{ config, title }\` entries.` |
| A `charts` entry is missing `config`    | `Sample \`charts[<index>]\` is missing \`config\`.` (names the index)  |

This logic lives in `src/charts.js` (`normalizeCharts`), covered by `test/charts.test.js`.

### Featured option: `choices`

A sample almost always demonstrates one particular option. Rather than leaving a reader to find it inside a (collapsed, see below) code panel, a sample can declare it as a live control that renders between the chart(s) and the code:

```js
module.exports = {
  config,
  choices: [
    { path: 'options.nodePaddingMode', values: ['auto', 'even'], control: 'radio', label: 'Padding mode' },
    { path: 'options.nodeMinSize', min: 0, max: 20, step: 2, control: 'range' },
    { path: 'options.colorMode', values: ['gradient', 'from', 'to'], control: 'select' },
  ],
}
```

| Field                | Required                    | Meaning                                                                                                                    |
| --------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `path`                | yes                          | Dotted path into the chart configuration, e.g. `options.nodeMinSize` or `data.datasets.0.borderWidth`. Also the text shown in the readout. |
| `values`              | one of `values` / `min`+`max` | The alternatives. A plain value, or `{ value, label }` when a value is an object or needs a friendlier name.               |
| `min`, `max`, `step`  | —                             | A numeric range instead of a fixed list. `step` defaults to `1`.                                                            |
| `control`             | no                            | `'radio'`, `'select'`, `'range'`, or `'checkbox'`. Defaulted from the declaration when omitted, see below.                  |
| `label`               | no                            | Defaults to the last segment of `path`.                                                                                     |

When `control` isn't set, it's derived from the declaration: 2–4 `values` → `radio`; 5 or more `values` → `select`; `min`/`max` → `range`; `values: [true, false]` → `checkbox`.

The control's initial selection is read from the sample's own `config` (or the first entry's `config` when exporting `charts`) at `path`, not from `values[0]` — so the control and the code never disagree about the current state. A choice applies to **every** chart in the block: with `charts`, the same path/value is set on every entry's config. A control that should affect only one chart calls for two separate blocks instead.

Each control shows a copy-pasteable readout (`options.nodePaddingMode: 'even'`) next to it — this is deliberate: the full code panel is collapsed by default (see below), so the readout is what teaches the syntax to a reader who never opens it.

Applying a selection rebuilds the affected chart's configuration and re-creates the chart, rather than assigning into `chart.options` and calling `chart.update()`. That choice isn't about `update()` being unsafe — it's that rebuilding doesn't depend on the order options happen to resolve in, and it works the same way whether a choice targets `options` or `data`, so one code path covers every declared choice.

This logic lives in `src/choices.js` (`normalizeChoices`, `getValueAtPath`, `setValueAtPath`, `applyChoices`, `initialValueFor`, `readoutText`, and friends), covered by `test/choices.test.js`. The DOM that renders the controls is in `src/client.js`, covered by the browser suite (`test/browser/choices.spec.js`).

#### Styling the controls

The controls are inside the custom element's shadow root, so ordinary page selectors can't reach them. Two CSS custom properties pierce the shadow boundary instead:

| Custom property                      | Affects                                                    | Default   |
| -------------------------------------- | ------------------------------------------------------------ | ----------- |
| `--chartjs-editor-control-accent`     | The active radio segment's background, and the focus/accent color of every control | `#4133b0` |
| `--chartjs-editor-control-gap`        | Spacing between control groups, and within a group           | `0.6rem`–`0.85rem` |

Set them on any ancestor of `<astro-chartjs-editor>` (they inherit through the shadow boundary like any other custom property):

```css
astro-chartjs-editor {
  --chartjs-editor-control-accent: #0ea5e9;
}
```

## Error behavior

| Situation                                                       | What happens                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A fence isn't `js`/`javascript`, or is missing the `chart-editor` marker | Left completely untouched by the remark plugin. Renders as an ordinary fenced code block. Never an error.                                                                                                       |
| Sample code throws when evaluated (syntax error or runtime throw), including an invalid `choices` declaration | Caught in the browser, per render. The error's message is shown in an inline error element, with the stack behind a disclosure; the previously rendered chart, if any, is left as-is. This never touches the Astro build — remark only base64-encodes the source text at build time and never evaluates it. |
| `runtime` points at a path with no matching file                  | Not checked at all by `integration.js` — the path is resolved with `path.resolve()` regardless of whether anything exists there. The virtual module's `load()` hook then emits `export * from "<that path>"` literally. Based on how Vite/Rollup resolve `load()` output, this becomes a **module resolution failure at dev-server/build time**, not a browser-only error — but this project has no Astro project scaffolded to actually run `astro build` against, so this specific claim is inferred from source and standard Vite/Rollup module-resolution semantics, not executed. Treat it as high-confidence but unverified by an actual build. |

## The code panel

The tabs, editor, **Run**/**Copy**/**Reset**/**View source** toolbar, error area and output panel all sit inside a `<details>` element, collapsed by default, with "Full configuration" as its summary. The chart(s) and any `choices` controls are always visible above it. The panel sizes to its content (up to a `max-block-size` of 360px, scrolling past that) instead of reserving a fixed height regardless of how much code a sample has.

Typing already re-renders the chart(s) after a 500ms debounce, but **Ctrl+Enter** (or **Cmd+Enter** on macOS) runs the current code immediately from inside the editor, same as clicking **Run**.

## Exports

| Subpath                          | Module              |
| --------------------------------- | -------------------- |
| `@kurkle/astro-chartjs-editor`     | `src/integration.js` (the default export, `chartEditor(options)`) |
| `@kurkle/astro-chartjs-editor/charts` | `src/charts.js` (`normalizeCharts`, used internally to validate and flatten the `config`/`charts` contract) |
| `@kurkle/astro-chartjs-editor/choices` | `src/choices.js` (`normalizeChoices` and friends, used internally to validate and apply the `choices` contract) |
| `@kurkle/astro-chartjs-editor/client` | `src/client.js` (the page script injected automatically; you shouldn't need to import it yourself) |
| `@kurkle/astro-chartjs-editor/remark` | `src/remark.js` (`remarkChartEditor`, `satteriChartEditor`) |
| `@kurkle/astro-chartjs-editor/sections` | `src/sections.js` (`parseSections`, used internally to split block-marker code into tabs) |
