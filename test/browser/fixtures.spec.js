/**
 * Pixel-reference specs.
 *
 * These compare rendered pixels, not just behavior/geometry, so they exist
 * to catch regressions the other specs structurally can't: a chart that
 * still "has ink" and still redraws on edit, but draws the wrong ink.
 *
 * Every sample here is deliberately textless (no legend, no axis ticks or
 * labels -- see test/browser/samples.js) so the reference PNGs don't depend
 * on the host's font rendering. That's what broke the sankey fixture in CI: a
 * macOS-captured PNG didn't match Linux's font antialiasing.
 *
 * Run `npm run fixtures:update` to (re)capture the references from Chromium
 * after a deliberate visual change. That command exists only to set
 * UPDATE_FIXTURES=1; the run below still executes the normal assertions, it
 * just writes a fresh PNG first when the rendered pixels don't already match.
 */
import { afterEach, expect, it } from 'vitest'
import { page, server } from 'vitest/browser'
import '../../src/client.js'
import basicPng from '../fixtures/basic.png?url'
import editedPng from '../fixtures/edited.png?url'
import multiPng from '../fixtures/multi.png?url'
import { clickRun, openDetails, replaceCurrentSectionCode, selectTab } from './interactions.js'
import { diffImageData, readImageData } from './pixel.js'
import { BASIC_SAMPLE, EDITED_DATA_CODE, MULTI_SAMPLE_TEXTLESS } from './samples.js'
import { hasInk, mount, shadowOf, unmount } from './utils.js'

const TOLERANCE = 0.001
// The multi-chart fixture screenshots real, CSS-scaled DOM (the canvas
// backing store stretched to its grid column width), not a canvas's raw
// pixel buffer -- so it picks up sub-pixel scaling differences between
// browsers/OS that the single-canvas fixtures below never see. A looser
// tolerance absorbs that without hiding an actual rendering regression.
const COMPOSITE_TOLERANCE = 0.01

let element

afterEach(async () => {
  unmount(element)
  element = undefined
  await page.viewport(1280, 720)
})

async function loadExisting(url) {
  try {
    return await readImageData(url)
  } catch {
    return undefined
  }
}

/**
 * Asserts `actual` against the reference PNG at `referenceUrl`, or -- only
 * when the update command is registered (`npm run fixtures:update`) --
 * (re)writes it via `toDataUrl()` when it doesn't already match.
 */
async function assertOrCapture(name, actual, referenceUrl, toDataUrl, tolerance = TOLERANCE) {
  const save = server.commands.saveFixtureImage
  const expected = await loadExisting(referenceUrl)
  const matches =
    expected !== undefined &&
    expected.width === actual.width &&
    expected.height === actual.height &&
    diffImageData(actual, expected).ratio <= tolerance

  if (save) {
    if (!matches) await save(name, toDataUrl())
    return
  }

  expect(
    expected,
    `no reference image found for '${name}'; run npm run fixtures:update`
  ).toBeDefined()
  expect(expected.width).toBe(actual.width)
  expect(expected.height).toBe(actual.height)
  expect(diffImageData(actual, expected).ratio).toBeLessThanOrEqual(tolerance)
}

function canvasImageData(canvas) {
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
}

it('matches the basic chart reference image', async () => {
  element = mount(BASIC_SAMPLE)
  const root = shadowOf(element)
  const canvas = root.querySelector('canvas')

  await expect.poll(() => hasInk(canvas)).toBe(true)

  await assertOrCapture('basic', canvasImageData(canvas), basicPng, () => canvas.toDataURL())
})

it('matches the edited chart reference image, proving an edit redraws the chart', async () => {
  element = mount(BASIC_SAMPLE)
  const root = shadowOf(element)

  await openDetails(root)
  await selectTab(root, 1) // 'data'
  replaceCurrentSectionCode(root, EDITED_DATA_CODE)
  await clickRun(root)

  const canvas = root.querySelector('canvas')
  await expect.poll(() => hasInk(canvas)).toBe(true)

  await assertOrCapture('edited', canvasImageData(canvas), editedPng, () => canvas.toDataURL())
})

it('matches the two-chart layout reference image on a wide viewport', async () => {
  await page.viewport(1400, 900)
  element = mount(MULTI_SAMPLE_TEXTLESS)
  const root = shadowOf(element)
  const grid = root.querySelector('.chartjs-editor__charts')

  await expect.poll(() => root.querySelectorAll('canvas').length).toBe(2)
  await expect
    .poll(() => Array.from(root.querySelectorAll('canvas')).every((canvas) => hasInk(canvas)))
    .toBe(true)

  // `page.screenshot({ element })` re-resolves a raw Element through a CSS
  // selector under the hood, which isn't unique here (several `div`s share
  // this shape). Wrapping it in a Locator pins the screenshot to this exact
  // node instead.
  const base64 = await page.screenshot({
    base64: true,
    element: page.elementLocator(grid),
    save: false,
  })
  const dataUrl = `data:image/png;base64,${base64}`
  const actual = await readImageData(dataUrl)

  await assertOrCapture('multi', actual, multiPng, () => dataUrl, COMPOSITE_TOLERANCE)
})
