/**
 * Pure logic behind a sample's `choices`: validating declarations, reading
 * and writing a value at a dotted path, deriving a control kind and label
 * when the sample doesn't set one, comparing option values, and formatting
 * the copy-pasteable readout text.
 *
 * Kept free of DOM so it can be covered by `node --test` -- the DOM wiring
 * that consumes this module (in client.js) is exercised only by the browser
 * suite, same split as `charts.js` / `normalizeCharts`.
 *
 * @typedef {{ value: unknown, label: string }} ChoiceOption
 * @typedef {{
 *   path: string,
 *   label: string,
 *   control: 'radio' | 'select' | 'range' | 'checkbox',
 *   options?: ChoiceOption[],
 *   min?: number,
 *   max?: number,
 *   step?: number,
 * }} NormalizedChoice
 */

const CONTROLS = new Set(['radio', 'select', 'range', 'checkbox'])

/**
 * Normalizes a sample's `choices` export into a validated list of control
 * declarations. Returns `[]` when the sample doesn't export `choices` at
 * all -- that's the common case, and it keeps a sample with no choices
 * behaving exactly as before.
 *
 * @param {{ choices?: unknown }} sampleExports
 * @returns {NormalizedChoice[]}
 */
export function normalizeChoices(sampleExports) {
  const { choices } = sampleExports ?? {}
  if (choices === undefined) return []
  if (!Array.isArray(choices)) {
    throw new TypeError('Sample `choices` must be an array of `{ path, ... }` declarations.')
  }
  return choices.map((choice, index) => normalizeChoice(choice, index))
}

function normalizeChoice(choice, index) {
  if (choice == null || typeof choice !== 'object') {
    throw new Error(`Sample \`choices[${index}]\` must be an object.`)
  }

  const { control, label, max, min, path, step, values } = choice
  const fail = (message) => new Error(`Sample \`choices[${index}]\` ('${path}') ${message}`)

  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error(`Sample \`choices[${index}]\` is missing a string \`path\`.`)
  }

  const { hasRange, hasValues, options } = validateShape({ fail, max, min, values })
  const resolvedControl = control ?? deriveControl({ hasRange, options })
  validateControl({ fail, hasRange, hasValues, resolvedControl })

  return {
    control: resolvedControl,
    label: label ?? path.split('.').at(-1),
    max: hasRange ? max : undefined,
    min: hasRange ? min : undefined,
    options,
    path,
    step: hasRange ? (step ?? 1) : undefined,
  }
}

function validateShape({ fail, max, min, values }) {
  const hasValues = values !== undefined
  const hasRange = min !== undefined || max !== undefined

  if (hasValues && hasRange) {
    throw fail('declares both `values` and `min`/`max`. Use only one.')
  }
  if (!hasValues && !hasRange) {
    throw fail('must declare `values`, or `min` and `max`.')
  }

  if (hasRange) validateRange({ fail, max, min })
  if (hasValues) validateValues({ fail, values })

  return { hasRange, hasValues, options: hasValues ? values.map(normalizeOption) : undefined }
}

function validateRange({ fail, max, min }) {
  if (typeof min !== 'number' || typeof max !== 'number') {
    throw fail('needs both `min` and `max` as numbers.')
  }
}

function validateValues({ fail, values }) {
  if (!Array.isArray(values) || values.length < 2) {
    throw fail('needs `values` to be an array of at least two entries.')
  }
}

function validateControl({ fail, hasRange, hasValues, resolvedControl }) {
  if (!CONTROLS.has(resolvedControl)) {
    throw fail(`has an unknown \`control\`: '${resolvedControl}'.`)
  }
  if (resolvedControl === 'range' && !hasRange) {
    throw fail("sets `control: 'range'` but has no `min`/`max`.")
  }
  if (resolvedControl !== 'range' && !hasValues) {
    throw fail(`sets \`control: '${resolvedControl}'\` but has no \`values\`.`)
  }
}

function normalizeOption(raw) {
  if (raw !== null && typeof raw === 'object' && Object.hasOwn(raw, 'value')) {
    return { label: raw.label ?? String(raw.value), value: raw.value }
  }
  return { label: String(raw), value: raw }
}

function deriveControl({ hasRange, options }) {
  if (hasRange) return 'range'
  if (options.length === 2 && options.every((option) => typeof option.value === 'boolean')) {
    return 'checkbox'
  }
  return options.length <= 4 ? 'radio' : 'select'
}

/**
 * Reads the value at a dotted path (`'options.nodeMinSize'`,
 * `'data.datasets.0.borderWidth'`). Numeric segments index into arrays the
 * same way they index into plain objects, so no special-casing is needed.
 * Missing intermediate values read as `undefined` rather than throwing.
 */
export function getValueAtPath(source, path) {
  let value = source
  for (const segment of path.split('.')) {
    if (value == null) return undefined
    value = value[segment]
  }
  return value
}

/**
 * Writes `value` at `path`, in place -- the same thing Chart.js's own docs
 * tell readers to do (change an option on the config you already have, call
 * `update()`), rather than swapping in a whole new config object. Missing
 * intermediate containers along the path are created as needed (array vs.
 * object, chosen from the next segment, the same way an array index would
 * naturally continue into a plain object otherwise); everything else in the
 * tree is left exactly as it was, because nothing else was touched.
 */
export function setValueAtPath(source, path, value) {
  setSegments(source, path.split('.'), value)
}

function setSegments(node, segments, value) {
  const [segment, ...rest] = segments
  if (rest.length === 0) {
    node[segment] = value
    return
  }
  if (node[segment] == null || typeof node[segment] !== 'object') {
    node[segment] = /^\d+$/.test(rest[0]) ? [] : {}
  }
  setSegments(node[segment], rest, value)
}

/**
 * Applies every choice's current selection to `config`, in place, and
 * returns it back for convenience. With no choices, `config` is returned
 * untouched.
 *
 * @param {unknown} config
 * @param {NormalizedChoice[]} choices
 * @param {Record<string, unknown>} selections keyed by `choice.path`
 */
export function applyChoices(config, choices, selections) {
  for (const choice of choices) {
    setValueAtPath(config, choice.path, selections[choice.path])
  }
  return config
}

/**
 * The value a choice's control should start on: whatever `config` already
 * has at `choice.path`, so the control and the code never disagree. Falls
 * back to the declaration's first alternative only when the path isn't
 * present in `config` at all.
 */
export function initialValueFor(choice, config) {
  const value = getValueAtPath(config, choice.path)
  if (value !== undefined) return value
  return choice.control === 'range' ? choice.min : choice.options[0].value
}

/** True when two option values represent the same choice. */
export function sameValue(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null || typeof a !== 'object') return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/** The index of `value` among `options`, or `-1` when it isn't one of them. */
export function indexOfValue(options, value) {
  return options.findIndex((option) => sameValue(option.value, value))
}

/**
 * Formats a value the way it would read in the sample's own source, e.g.
 * `'even'` for a string or `12` for a number, so the readout can be copied
 * straight into code.
 */
export function formatValue(value) {
  if (typeof value === 'string') return `'${value}'`
  if (typeof value === 'function') return value.name ? `${value.name}()` : 'function () {}'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** The copy-pasteable `path: value` text shown next to a control. */
export function readoutText(choice, value) {
  return `${choice.path}: ${formatValue(value)}`
}
