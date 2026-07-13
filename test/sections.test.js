import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSections } from '../src/sections.js'

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
