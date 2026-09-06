import { parseSections } from '../src/sections.js'
import assert from 'node:assert/strict'
import test from 'node:test'

test('uses a single JS section without block markers', () => {
  const parsed = parseSections('const config = {}')
  assert.equal(parsed.segments, null)
  assert.deepEqual(parsed.sections, [{ code: 'const config = {}', name: 'JS', order: 0 }])
})

test('orders tabs while preserving executable segment order', () => {
  const parsed = parseSections(`// <block:actions:2>
const actions = []
// </block:actions>
// <block:data:1>
const data = []
// </block:data>
// <block:config:0>
const config = {data}
// </block:config>
module.exports = {actions, config}`)

  assert.deepEqual(
    parsed.sections.map(({ name }) => name),
    ['config', 'data', 'actions']
  )
  assert.equal(parsed.segments.at(-1).code, 'module.exports = {actions, config}')
})

test('breaks ties on colliding order numbers by source appearance order', () => {
  const parsed = parseSections(`// <block:first:0>
const first = 1
// </block:first>
// <block:second:0>
const second = 2
// </block:second>`)

  assert.deepEqual(
    parsed.sections.map(({ name }) => name),
    ['first', 'second']
  )
})

test('defaults a marker with no order number to 0', () => {
  const parsed = parseSections(`// <block:noOrder>
const value = 1
// </block:noOrder>`)

  assert.equal(parsed.sections.length, 1)
  assert.equal(parsed.sections[0].name, 'noOrder')
  assert.equal(parsed.sections[0].order, 0)
  assert.equal(parsed.sections[0].code, 'const value = 1')
})

test('keeps code outside any named block in the reassembled segments, but not as a visible tab', () => {
  const parsed = parseSections(`const before = 'unnamed'
// <block:config:0>
const config = {}
// </block:config>`)

  assert.deepEqual(
    parsed.sections.map(({ name }) => name),
    ['config']
  )
  assert.deepEqual(
    parsed.segments.map((segment) => segment.code),
    ["const before = 'unnamed'", 'const config = {}']
  )
})
