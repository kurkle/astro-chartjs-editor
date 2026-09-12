import {
  applyChoices,
  formatValue,
  getValueAtPath,
  indexOfValue,
  initialValueFor,
  normalizeChoices,
  readoutText,
  sameValue,
  setValueAtPath,
} from '../src/choices.js'
import assert from 'node:assert/strict'
import test from 'node:test'

test('returns an empty list when the sample exports no `choices`', () => {
  assert.deepEqual(normalizeChoices({}), [])
  assert.deepEqual(normalizeChoices(undefined), [])
})

test('throws a TypeError when `choices` is not an array', () => {
  assert.throws(() => normalizeChoices({ choices: { path: 'a' } }), {
    message: /must be an array/,
    name: 'TypeError',
  })
})

test('throws naming the index when an entry is not an object', () => {
  assert.throws(() => normalizeChoices({ choices: [null] }), /choices\[0\].*object/)
})

test('throws naming the index when `path` is missing', () => {
  assert.throws(() => normalizeChoices({ choices: [{ values: ['a', 'b'] }] }), /choices\[0\].*path/)
})

test('throws when a declaration has neither `values` nor `min`/`max`', () => {
  assert.throws(
    () => normalizeChoices({ choices: [{ path: 'options.x' }] }),
    /must declare `values`, or `min` and `max`/
  )
})

test('throws when a declaration has both `values` and `min`/`max`', () => {
  assert.throws(
    () =>
      normalizeChoices({
        choices: [{ max: 10, min: 0, path: 'options.x', values: ['a', 'b'] }],
      }),
    /declares both `values` and `min`\/`max`/
  )
})

test('throws when `min`/`max` are not numbers', () => {
  assert.throws(
    () => normalizeChoices({ choices: [{ max: '10', min: 0, path: 'options.x' }] }),
    /needs both `min` and `max` as numbers/
  )
})

test('throws when `values` has fewer than two entries', () => {
  assert.throws(
    () => normalizeChoices({ choices: [{ path: 'options.x', values: ['only'] }] }),
    /at least two entries/
  )
})

test('throws when `control` is not one of the known kinds', () => {
  assert.throws(
    () =>
      normalizeChoices({ choices: [{ control: 'slider', path: 'options.x', values: ['a', 'b'] }] }),
    /unknown `control`: 'slider'/
  )
})

test('throws when `control: "range"` is set without `min`/`max`', () => {
  assert.throws(
    () =>
      normalizeChoices({ choices: [{ control: 'range', path: 'options.x', values: ['a', 'b'] }] }),
    /sets `control: 'range'` but has no `min`\/`max`/
  )
})

test('throws when a non-range control is set without `values`', () => {
  assert.throws(
    () =>
      normalizeChoices({ choices: [{ control: 'select', max: 10, min: 0, path: 'options.x' }] }),
    /sets `control: 'select'` but has no `values`/
  )
})

test('derives `radio` for 2-4 values', () => {
  const [choice] = normalizeChoices({ choices: [{ path: 'options.x', values: ['a', 'b', 'c'] }] })
  assert.equal(choice.control, 'radio')
})

test('derives `select` for 5 or more values', () => {
  const [choice] = normalizeChoices({
    choices: [{ path: 'options.x', values: ['a', 'b', 'c', 'd', 'e'] }],
  })
  assert.equal(choice.control, 'select')
})

test('derives `range` from `min`/`max`', () => {
  const [choice] = normalizeChoices({ choices: [{ max: 20, min: 0, path: 'options.x' }] })
  assert.equal(choice.control, 'range')
  assert.equal(choice.step, 1)
})

test('derives `checkbox` for `values: [true, false]`', () => {
  const [choice] = normalizeChoices({ choices: [{ path: 'options.x', values: [true, false] }] })
  assert.equal(choice.control, 'checkbox')
})

test('honors an explicit `control` over the derived default', () => {
  const [choice] = normalizeChoices({
    choices: [{ control: 'select', path: 'options.x', values: ['a', 'b'] }],
  })
  assert.equal(choice.control, 'select')
})

test('honors an explicit `step`, defaulting to 1 otherwise', () => {
  const [choice] = normalizeChoices({ choices: [{ max: 20, min: 0, path: 'options.x', step: 2 }] })
  assert.equal(choice.step, 2)
})

test('defaults `label` to the last path segment, honors an explicit one', () => {
  const [a, b] = normalizeChoices({
    choices: [
      { path: 'options.nodeMinSize', values: ['a', 'b'] },
      { label: 'Padding mode', path: 'options.nodePaddingMode', values: ['a', 'b'] },
    ],
  })
  assert.equal(a.label, 'nodeMinSize')
  assert.equal(b.label, 'Padding mode')
})

test('normalizes plain and `{ value, label }` option entries', () => {
  const [choice] = normalizeChoices({
    choices: [
      {
        path: 'options.x',
        values: ['auto', { label: 'Gradient fill', value: { type: 'gradient' } }],
      },
    ],
  })
  assert.deepEqual(choice.options[0], { label: 'auto', value: 'auto' })
  assert.deepEqual(choice.options[1], { label: 'Gradient fill', value: { type: 'gradient' } })
})

test('a `{ value }` entry without `label` falls back to `String(value)`', () => {
  const [choice] = normalizeChoices({
    choices: [{ path: 'options.x', values: [{ value: 1 }, { value: 2 }] }],
  })
  assert.deepEqual(choice.options[0], { label: '1', value: 1 })
})

test('reads a dotted path, including through array indices', () => {
  const config = { data: { datasets: [{ borderWidth: 3 }] }, options: { x: 'auto' } }
  assert.equal(getValueAtPath(config, 'options.x'), 'auto')
  assert.equal(getValueAtPath(config, 'data.datasets.0.borderWidth'), 3)
})

test('reading a missing intermediate value returns undefined, not a throw', () => {
  assert.equal(getValueAtPath({ options: {} }, 'options.scales.y.min'), undefined)
  assert.equal(getValueAtPath(undefined, 'options.x'), undefined)
})

test('writes a dotted path into a new object, leaving the source untouched', () => {
  const source = { options: { x: 'auto', y: 'kept' } }
  const result = setValueAtPath(source, 'options.x', 'even')

  assert.equal(result.options.x, 'even')
  assert.equal(source.options.x, 'auto', 'the source object must not be mutated')
  assert.equal(result.options.y, 'kept')
  assert.notEqual(result, source)
  assert.notEqual(result.options, source.options)
})

test('writes through an array index without disturbing sibling entries', () => {
  const source = { data: { datasets: [{ borderWidth: 1 }, { borderWidth: 2 }] } }
  const result = setValueAtPath(source, 'data.datasets.0.borderWidth', 9)

  assert.equal(result.data.datasets[0].borderWidth, 9)
  assert.equal(result.data.datasets[1].borderWidth, 2)
  assert.equal(source.data.datasets[0].borderWidth, 1, 'the source must not be mutated')
})

test('keeps unrelated branches -- including functions -- by reference', () => {
  const tick = () => 'tick'
  const source = { options: { plugins: { tooltip: { callbacks: { label: tick } } }, x: 'auto' } }
  const result = setValueAtPath(source, 'options.x', 'even')

  assert.equal(result.options.plugins.callbacks, source.options.plugins.callbacks)
  assert.equal(result.options.plugins, source.options.plugins)
  assert.equal(result.options.plugins.tooltip.callbacks.label, tick)
})

test('creates missing containers, choosing array vs object from the next segment', () => {
  const result = setValueAtPath({}, 'data.datasets.0.borderWidth', 4)
  assert.ok(Array.isArray(result.data.datasets))
  assert.equal(result.data.datasets[0].borderWidth, 4)
})

test('applyChoices folds every choice into one rebuilt config', () => {
  const [mode, size] = normalizeChoices({
    choices: [
      { path: 'options.nodePaddingMode', values: ['auto', 'even'] },
      { max: 20, min: 0, path: 'options.nodeMinSize' },
    ],
  })
  const config = { options: { nodeMinSize: 0, nodePaddingMode: 'auto' } }

  const result = applyChoices(config, [mode, size], {
    'options.nodeMinSize': 12,
    'options.nodePaddingMode': 'even',
  })

  assert.deepEqual(result, { options: { nodeMinSize: 12, nodePaddingMode: 'even' } })
  assert.equal(config.options.nodePaddingMode, 'auto', 'the original config must not be mutated')
})

test('applyChoices with no choices returns the original config reference unchanged', () => {
  const config = { options: {} }
  assert.equal(applyChoices(config, [], {}), config)
})

test('initialValueFor reads the value already present in the config', () => {
  const [choice] = normalizeChoices({
    choices: [{ path: 'options.nodePaddingMode', values: ['auto', 'even'] }],
  })
  const config = { options: { nodePaddingMode: 'even' } }
  assert.equal(initialValueFor(choice, config), 'even')
})

test('initialValueFor falls back to the range minimum when the path is absent', () => {
  const [choice] = normalizeChoices({ choices: [{ max: 20, min: 4, path: 'options.nodeMinSize' }] })
  assert.equal(initialValueFor(choice, {}), 4)
})

test('initialValueFor falls back to the first option when the path is absent', () => {
  const [choice] = normalizeChoices({
    choices: [{ path: 'options.colorMode', values: ['gradient', 'from', 'to'] }],
  })
  assert.equal(initialValueFor(choice, {}), 'gradient')
})

test('sameValue compares primitives and structurally compares objects', () => {
  assert.equal(sameValue('a', 'a'), true)
  assert.equal(sameValue('a', 'b'), false)
  assert.equal(sameValue({ type: 'gradient' }, { type: 'gradient' }), true)
  assert.equal(sameValue({ type: 'gradient' }, { type: 'flat' }), false)
  assert.equal(sameValue(null, {}), false)
  assert.equal(sameValue(1, '1'), false)
})

test('sameValue falls back to false for two different values JSON.stringify cannot compare', () => {
  const a = {}
  a.self = a
  const b = {}
  b.self = b
  assert.equal(sameValue(a, b), false)
})

test('indexOfValue finds the matching option, or -1', () => {
  const [choice] = normalizeChoices({
    choices: [{ path: 'options.colorMode', values: ['gradient', 'from', 'to'] }],
  })
  assert.equal(indexOfValue(choice.options, 'from'), 1)
  assert.equal(indexOfValue(choice.options, 'missing'), -1)
})

test('formatValue quotes strings and stringifies other JSON-able values', () => {
  assert.equal(formatValue('even'), "'even'")
  assert.equal(formatValue(12), '12')
  assert.equal(formatValue(true), 'true')
  assert.equal(formatValue({ type: 'gradient' }), '{"type":"gradient"}')
})

test('formatValue names a function rather than stringifying its source', () => {
  function label() {}
  assert.equal(formatValue(label), 'label()')
  assert.equal(
    formatValue(() => {}),
    'function () {}'
  )
})

test('formatValue falls back to String() for a value JSON.stringify cannot serialize', () => {
  const circular = {}
  circular.self = circular
  assert.equal(formatValue(circular), String(circular))
})

test('readoutText composes the path and the formatted value', () => {
  const [choice] = normalizeChoices({
    choices: [{ path: 'options.nodePaddingMode', values: ['auto', 'even'] }],
  })
  assert.equal(readoutText(choice, 'even'), "options.nodePaddingMode: 'even'")
})
