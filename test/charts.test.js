import { normalizeCharts } from '../src/charts.js'
import assert from 'node:assert/strict'
import test from 'node:test'

test('normalizes a single `config` export into a one-entry list with no title', () => {
  const config = { type: 'bar' }
  const result = normalizeCharts({ config })
  assert.deepEqual(result, [{ config, title: undefined }])
})

test('normalizes a `charts` export with a single entry', () => {
  const config = { type: 'bar' }
  const result = normalizeCharts({ charts: [{ config, title: 'Only one' }] })
  assert.deepEqual(result, [{ config, title: 'Only one' }])
})

test('normalizes a `charts` export with multiple entries, preserving order', () => {
  const configA = { type: 'bar' }
  const configB = { type: 'line' }
  const result = normalizeCharts({
    charts: [
      { config: configA, title: 'Without option' },
      { config: configB, title: 'With option' },
    ],
  })
  assert.deepEqual(result, [
    { config: configA, title: 'Without option' },
    { config: configB, title: 'With option' },
  ])
})

test('allows a `charts` entry to omit `title`', () => {
  const config = { type: 'bar' }
  const result = normalizeCharts({ charts: [{ config }] })
  assert.deepEqual(result, [{ config, title: undefined }])
})

test('throws naming the index when a `charts` entry is missing `config`', () => {
  const config = { type: 'bar' }
  assert.throws(
    () => normalizeCharts({ charts: [{ config }, { title: 'No config here' }] }),
    /charts\[1\].*config/
  )
})

test('throws naming the index when a `charts` entry is not an object', () => {
  assert.throws(() => normalizeCharts({ charts: [null] }), /charts\[0\].*config/)
})

test('throws when both `config` and `charts` are exported', () => {
  assert.throws(
    () => normalizeCharts({ charts: [{ config: {} }], config: {} }),
    /both `config` and `charts`/
  )
})

test('throws when neither `config` nor `charts` is exported', () => {
  assert.throws(() => normalizeCharts({}), /must export either `config`.*`charts`/)
})

test('throws a TypeError when `charts` is not an array', () => {
  assert.throws(() => normalizeCharts({ charts: { config: {} } }), {
    message: /must be an array/,
    name: 'TypeError',
  })
})
