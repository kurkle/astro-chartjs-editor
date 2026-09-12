import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import '../../src/client.js'
import { clickRun } from './interactions.js'
import {
  CHARTS_MISSING_CONFIG_SAMPLE,
  CONFIG_AND_CHARTS_SAMPLE,
  MULTI_ACTIONS_SAMPLE,
  MULTI_SAMPLE,
} from './samples.js'
import { hasInk, mount, shadowOf, unmount } from './utils.js'

let element

afterEach(async () => {
  unmount(element)
  element = undefined
  // Geometry specs change the browser viewport; put it back so later specs
  // (in this file or others sharing the instance) see a consistent size.
  await page.viewport(1280, 720)
})

describe('multiple charts', () => {
  it('renders one canvas per entry, a shared toolbar, and a title per entry', () => {
    element = mount(MULTI_SAMPLE)
    const root = shadowOf(element)

    expect(root.querySelectorAll('canvas')).toHaveLength(2)
    expect(root.querySelectorAll('[data-chart-run]')).toHaveLength(1)
    expect(root.querySelectorAll('.chartjs-editor__code')).toHaveLength(1)

    const chartTitles = Array.from(root.querySelectorAll('.chartjs-editor__chart-title')).map(
      (node) => node.textContent
    )
    expect(chartTitles).toEqual(['Bars', 'Line'])
  })

  it('re-renders every chart on Run', async () => {
    element = mount(MULTI_SAMPLE)
    const root = shadowOf(element)
    const before = Array.from(root.querySelectorAll('canvas'))

    await clickRun(root)

    const after = Array.from(root.querySelectorAll('canvas'))
    expect(after).toHaveLength(2)
    // renderCharts() destroys every previous chart and replaces chartsGrid's
    // children wholesale, so Run produces fresh canvas elements rather than
    // reusing the old ones in place.
    expect(after[0]).not.toBe(before[0])
    expect(after[1]).not.toBe(before[1])
    await expect.poll(() => after.every((canvas) => hasInk(canvas))).toBe(true)
  })

  it('passes an action handler the array of chart instances, in entry order', async () => {
    element = mount(MULTI_ACTIONS_SAMPLE)
    const root = shadowOf(element)

    const actionButton = root.querySelector('[data-chart-action]')
    expect(actionButton.textContent).toBe('BumpAll')

    await actionButton.click()

    // The sample's handler does `for (const chart of charts) chart.update()`.
    // A single Chart instance is not iterable, so if the client passed the
    // handler charts[0] instead of the array, this would throw and surface
    // here as an error instead of a clean re-render.
    expect(root.querySelector('.chartjs-editor__error').textContent).toBe('')
  })

  it('lays out canvases side by side on a wide viewport and stacked on a narrow one', async () => {
    element = mount(MULTI_SAMPLE)
    const root = shadowOf(element)

    await page.viewport(1400, 800)
    const [wideA, wideB] = Array.from(root.querySelectorAll('canvas')).map((canvas) =>
      canvas.getBoundingClientRect()
    )
    expect(Math.abs(wideA.top - wideB.top)).toBeLessThan(2)
    expect(Math.abs(wideA.left - wideB.left)).toBeGreaterThan(50)

    await page.viewport(500, 900)
    const [narrowA, narrowB] = Array.from(root.querySelectorAll('canvas')).map((canvas) =>
      canvas.getBoundingClientRect()
    )
    expect(Math.abs(narrowA.left - narrowB.left)).toBeLessThan(2)
    expect(Math.abs(narrowA.top - narrowB.top)).toBeGreaterThan(50)
  })
})

function expectErrorText(root, substring) {
  expect(root.querySelector('.chartjs-editor__error').textContent).toContain(substring)
}

describe('charts contract errors', () => {
  it('shows an error and creates no canvas when both config and charts are exported', () => {
    element = mount(CONFIG_AND_CHARTS_SAMPLE)
    const root = shadowOf(element)

    expectErrorText(root, 'both `config` and `charts`')
    expect(root.querySelectorAll('canvas')).toHaveLength(0)
  })

  it('shows an error naming the index when a charts entry omits config', () => {
    element = mount(CHARTS_MISSING_CONFIG_SAMPLE)
    const root = shadowOf(element)

    expectErrorText(root, 'charts[0]')
    expect(root.querySelectorAll('canvas')).toHaveLength(0)
  })
})
