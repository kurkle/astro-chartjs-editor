import Chart from 'chart.js/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import '../../src/client.js'
import {
  CHOICES_ANIMATED_SAMPLE,
  CHOICES_BREAKS_ON_APPLY_SAMPLE,
  CHOICES_INVALID_SAMPLE,
  CHOICES_SAMPLE,
  CHOICES_SELECT_CHECKBOX_SAMPLE,
  CHOICES_WITH_CHARTS_SAMPLE,
} from './samples.js'
import { hasInk, mount, shadowOf, unmount } from './utils.js'

let element

afterEach(() => {
  unmount(element)
  element = undefined
})

function readouts(root) {
  return Array.from(root.querySelectorAll('.chartjs-editor__readout')).map(
    (node) => node.textContent
  )
}

/** Dispatches a real 'input' event, the same one a range slider fires while
 * being dragged -- userEvent has no drag-a-slider-to-value primitive, and a
 * plain value assignment plus this event is what the range control's own
 * listener (see buildRangeControl in client.js) actually listens for. */
function setRangeValue(input, value) {
  input.value = String(value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Waits real wall-clock time rather than a frame count: Chart.js's
 * Animation.tick() paces itself off Date.now(), and headless Chromium and
 * Firefox schedule requestAnimationFrame at different, sometimes throttled
 * rates -- a fixed number of frames is not a fixed amount of progress
 * through a duration-based animation in both engines, but a fixed number of
 * milliseconds is. */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** A vertical bar's rendered height in pixels: the distance between its
 * animated top edge (`y`) and the fixed zero-line (`base`) -- both plain,
 * directly-animated properties BarController's updateElements() sets on the
 * element, unlike its own `.height` field (which this build of Chart.js
 * leaves unpopulated for a vertical bar; `.width` is its counterpart). */
function barHeight(chart) {
  const element = chart.getDatasetMeta(0).data[0]
  return Math.abs(element.base - element.y)
}

describe('choices: rendering', () => {
  it('renders one control group per declaration, outside the collapsed panel', () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)
    const details = root.querySelector('.chartjs-editor__details')

    expect(details.open).toBe(false)
    expect(root.querySelectorAll('.chartjs-editor__choice')).toHaveLength(2)
    expect(root.querySelector('.chartjs-editor__choices').hidden).toBe(false)
  })

  it('hides the choices row entirely when a sample declares none', () => {
    element = mount(
      'module.exports = { config: { type: "bar", data: { labels: [], datasets: [] } } }'
    )
    const root = shadowOf(element)

    expect(root.querySelector('.chartjs-editor__choices').hidden).toBe(true)
    expect(root.querySelectorAll('.chartjs-editor__choice')).toHaveLength(0)
  })

  it('derives a radiogroup for 2 values and a labeled range for min/max', () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)

    const radiogroup = root.querySelector('[role="radiogroup"]')
    expect(radiogroup).not.toBeNull()
    expect(radiogroup.querySelectorAll('[role="radio"]')).toHaveLength(2)

    const range = root.querySelector('input[type="range"]')
    expect(range.min).toBe('0')
    expect(range.max).toBe('10')
    expect(range.step).toBe('1')
    expect(root.querySelector(`label[for="${range.id}"]`)).not.toBeNull()
  })

  it('derives a select for 5+ values and a checkbox for [true, false]', () => {
    element = mount(CHOICES_SELECT_CHECKBOX_SAMPLE)
    const root = shadowOf(element)

    const select = root.querySelector('select')
    expect(select.querySelectorAll('option')).toHaveLength(5)
    expect(root.querySelector(`label[for="${select.id}"]`)).not.toBeNull()

    const checkbox = root.querySelector('input[type="checkbox"]')
    expect(checkbox).not.toBeNull()
    expect(root.querySelector(`label[for="${checkbox.id}"]`)).not.toBeNull()
  })
})

describe('choices: initial selection', () => {
  it("reads the radio's initial selection from the config, not values[0]", () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)

    // CHOICES_SAMPLE's config sets options.scales.y.type: 'linear', so
    // 'linear' -- the first declared value -- must read active. Flip the
    // declaration order in samples.js and this would still need to pass,
    // which is the point: it's the config's value driving this, not array
    // position.
    const [first, second] = root.querySelectorAll('[role="radio"]')
    expect(first.getAttribute('aria-checked')).toBe('true')
    expect(second.getAttribute('aria-checked')).toBe('false')
  })

  it('reads the range initial value from the config', () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)

    // config sets data.datasets[0].borderWidth: 1.
    expect(root.querySelector('input[type="range"]').value).toBe('1')
  })

  it('falls back to the first option when the path is absent from the config', () => {
    element = mount(CHOICES_SELECT_CHECKBOX_SAMPLE)
    const root = shadowOf(element)

    // Neither options.custom.mode nor options.custom.enabled exist in this
    // sample's config, so both choices fall back to their first declared
    // value ('a', and true).
    expect(root.querySelector('select').value).toBe('0')
    expect(root.querySelector('input[type="checkbox"]').checked).toBe(true)
  })

  it('falls back to the range minimum when the path is absent from the config', () => {
    element = mount(
      `const config = { type: 'bar', data: { labels: [], datasets: [] }, options: { animation: false } }
       module.exports = { config, choices: [{ path: 'options.nodeMinSize', min: 4, max: 20 }] }`
    )
    const root = shadowOf(element)

    expect(root.querySelector('input[type="range"]').value).toBe('4')
  })
})

describe('choices: readout', () => {
  it('shows the dotted path and the current value as copyable text', () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)

    expect(readouts(root)).toEqual([
      "options.scales.y.type: 'linear'",
      'data.datasets.0.borderWidth: 1',
    ])
  })

  it('updates the readout when the selection changes', async () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)
    const [, secondRadio] = root.querySelectorAll('[role="radio"]')

    await userEvent.click(secondRadio)

    expect(readouts(root)[0]).toBe("options.scales.y.type: 'logarithmic'")
  })
})

describe('choices: applying a selection', () => {
  it('mutates the chart in place and moves the readout on a radio click', async () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)
    const canvasBefore = root.querySelector('canvas')
    const [, secondRadio] = root.querySelectorAll('[role="radio"]')

    await userEvent.click(secondRadio)

    expect(secondRadio.getAttribute('aria-checked')).toBe('true')
    const canvasAfter = root.querySelector('canvas')
    // The canvas is the *same* node -- see 'choices: mutate in place' below
    // for the equivalent check on the Chart instance itself, plus the rest
    // of the proof that this is a real in-place update, not a recreate.
    expect(canvasAfter).toBe(canvasBefore)
    await expect.poll(() => hasInk(canvasAfter)).toBe(true)
    expect(root.querySelector('.chartjs-editor__error').textContent).toBe('')
  })

  it('mutates the chart in place on a range change', async () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)
    const canvasBefore = root.querySelector('canvas')

    setRangeValue(root.querySelector('input[type="range"]'), 7)

    expect(root.querySelector('canvas')).toBe(canvasBefore)
    expect(readouts(root)[1]).toBe('data.datasets.0.borderWidth: 7')
  })

  it('applies a choice to every chart in a `charts` block, not only the first', async () => {
    element = mount(CHOICES_WITH_CHARTS_SAMPLE)
    const root = shadowOf(element)
    const before = Array.from(root.querySelectorAll('canvas'))
    expect(before).toHaveLength(2)

    setRangeValue(root.querySelector('input[type="range"]'), 9)

    const after = Array.from(root.querySelectorAll('canvas'))
    expect(after).toHaveLength(2)
    expect(after[0]).toBe(before[0])
    expect(after[1]).toBe(before[1])
    await expect.poll(() => after.every((canvas) => hasInk(canvas))).toBe(true)
    expect(readouts(root)[0]).toBe('data.datasets.0.borderWidth: 9')
  })

  it('mutates the chart in place on a select change', async () => {
    element = mount(CHOICES_SELECT_CHECKBOX_SAMPLE)
    const root = shadowOf(element)
    const canvasBefore = root.querySelector('canvas')

    await userEvent.selectOptions(root.querySelector('select'), '2')

    expect(root.querySelector('canvas')).toBe(canvasBefore)
    expect(readouts(root)[0]).toBe("options.custom.mode: 'c'")
  })

  it('mutates the chart in place on a checkbox change', async () => {
    element = mount(CHOICES_SELECT_CHECKBOX_SAMPLE)
    const root = shadowOf(element)
    const canvasBefore = root.querySelector('canvas')
    const checkbox = root.querySelector('input[type="checkbox"]')
    expect(checkbox.checked).toBe(true)

    await userEvent.click(checkbox)

    expect(checkbox.checked).toBe(false)
    expect(root.querySelector('canvas')).toBe(canvasBefore)
    expect(readouts(root)[1]).toBe('options.custom.enabled: false')
  })

  it('shows an error and leaves the chart completely untouched when a choice would change its type', async () => {
    element = mount(CHOICES_BREAKS_ON_APPLY_SAMPLE)
    const root = shadowOf(element)
    const canvasBefore = root.querySelector('canvas')
    const chartBefore = Chart.getChart(canvasBefore)
    expect(root.querySelector('.chartjs-editor__error').textContent).toBe('')

    const [, secondRadio] = root.querySelectorAll('[role="radio"]')
    await userEvent.click(secondRadio)

    // Thrown as a TypeError naming the unsupported path, before anything
    // about the live chart is touched -- not Chart.js failing partway
    // through constructing a chart of an unregistered type, and not a
    // silent no-op either.
    expect(root.querySelector('.chartjs-editor__error').textContent).not.toBe('')
    expect(root.querySelector('.chartjs-editor__error-message').textContent).toContain(
      "path 'type'"
    )
    // The readout still reflects the click -- the control state is honest
    // about what was selected even though applying it failed.
    expect(readouts(root)[0]).toBe("type: 'not-a-real-chart-type'")
    // The chart itself never moved: same canvas, same live instance.
    expect(root.querySelector('canvas')).toBe(canvasBefore)
    expect(Chart.getChart(canvasBefore)).toBe(chartBefore)

    // Picking a working value afterwards recovers cleanly, still in place.
    const [firstRadio] = root.querySelectorAll('[role="radio"]')
    await userEvent.click(firstRadio)

    expect(root.querySelector('.chartjs-editor__error').textContent).toBe('')
    expect(root.querySelectorAll('canvas')).toHaveLength(1)
    expect(root.querySelector('canvas')).toBe(canvasBefore)
    expect(Chart.getChart(canvasBefore)).toBe(chartBefore)
  })
})

/** True when the y scale is currently spacing values linearly rather than
 * logarithmically -- computed from the scale's own getPixelForValue(), not
 * from the `options.scales.y.type` string a choice just wrote. Equal
 * absolute steps between CHOICES_SAMPLE's data values (3 to 6, 6 to 9, each
 * +3) land at equal pixel gaps only on a linear scale; a logarithmic scale
 * spaces equal *ratios* evenly instead, and 6/3 (2x) isn't the same ratio as
 * 9/6 (1.5x), so its two gaps come out visibly different. */
function yScaleIsLinear(chart) {
  const scale = chart.scales.y
  const gapLow = Math.abs(scale.getPixelForValue(6) - scale.getPixelForValue(3))
  const gapHigh = Math.abs(scale.getPixelForValue(9) - scale.getPixelForValue(6))
  return Math.abs(gapLow - gapHigh) < 1
}

describe('choices: mutate in place', () => {
  // Point 1 of the proof this change rests on: the Chart object survives a
  // selection change as the *same* instance, on the *same* canvas element --
  // not a new instance standing in for it.
  it('keeps the same Chart instance and the same canvas element across a selection change', async () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)
    const canvasBefore = root.querySelector('canvas')
    const chartBefore = Chart.getChart(canvasBefore)
    expect(chartBefore).toBeInstanceOf(Chart)
    const [, secondRadio] = root.querySelectorAll('[role="radio"]')

    await userEvent.click(secondRadio)

    const canvasAfter = root.querySelector('canvas')
    expect(canvasAfter).toBe(canvasBefore)
    expect(Chart.getChart(canvasAfter)).toBe(chartBefore)
  })

  // Point 2 of the proof, for a *value* choice under `options`
  // (options.scales.y.type): toggled 6 times (more than the required 5),
  // with every toggle checked against pixel spacing the scale actually
  // computed -- not the config just written. CHOICES_SAMPLE disables
  // animation, so update() draws synchronously (see Chart.js's
  // Chart#render(): it calls draw() directly rather than scheduling one
  // through the animator when there is nothing to animate) and each
  // assertion can run immediately after the click with no lag to wait out.
  it('applies every toggle of an `options` value choice with no lag, over 6 alternations', async () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)
    const chart = Chart.getChart(root.querySelector('canvas'))
    const [firstRadio, secondRadio] = root.querySelectorAll('[role="radio"]')

    // options.scales.y.type starts at 'linear'.
    expect(yScaleIsLinear(chart)).toBe(true)

    for (let toggle = 0; toggle < 6; toggle++) {
      const selectingLogarithmic = toggle % 2 === 0
      await userEvent.click(selectingLogarithmic ? secondRadio : firstRadio)
      expect(yScaleIsLinear(chart)).toBe(!selectingLogarithmic)
    }
  })

  // Point 2 of the proof, for a *range* choice under `data`
  // (data.datasets.0.borderWidth): toggled 6 times, checked each time
  // against the bar element's own *resolved* borderWidth
  // (getDatasetMeta().data[0].options.borderWidth, produced by Chart.js's
  // option resolver) rather than the raw value just written into
  // selections.
  it('applies every toggle of a `data` range choice with no lag, over 6 alternations', () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)
    const chart = Chart.getChart(root.querySelector('canvas'))
    const range = root.querySelector('input[type="range"]')

    for (let toggle = 0; toggle < 6; toggle++) {
      const value = toggle % 2 === 0 ? 8 : 2
      setRangeValue(range, value)
      expect(chart.getDatasetMeta(0).data[0].options.borderWidth).toBe(value)
    }
  })

  // Point 3 of the proof: the animation is a continuation, not a restart.
  // The bar's rendered height is `|element.base - element.y|` (base: the
  // fixed zero-line pixel; y: the bar's animated top edge -- BarController's
  // own updateElements() computes both this way), sampled directly off the
  // live chart across real animation frames. An in-place update interpolates
  // `y` from wherever it already is (Chart.js's Animation class reads
  // `target[prop]` as its `from` value; see the comment above
  // rebuildCharts() in client.js), so a frame sampled shortly after a toggle
  // must already sit strictly between the pre-toggle and settled height. A
  // from-scratch recreate would instead start the animation from the
  // chart's default resting state, unrelated to what was on screen a moment
  // before.
  //
  // setup.js sets Chart.defaults.animation = false globally, for every other
  // test's pixel-fixture determinism. Confirmed against Chart.js 4.5.1's own
  // resolver (helpers.dataset.js's addScopes(), the "Fallback to `false`
  // results to `false`" branch): once the *global* default is exactly
  // `false`, every chart's per-property animation config resolves to
  // `false` too, even one whose own `options.animation` sets a real
  // duration -- there is no per-instance opt-out. Restoring the global
  // default to a real object (with a `duration` key -- Animations.configure()
  // reads Object.keys(defaults.animation) to know which sub-options to pull
  // per property, so an empty object still resolves every property's cfg to
  // `{}` and skips animating) for the lifetime of this one test, then
  // putting it back, is what actually lets this chart's own animation run.
  it('resumes the animation from the current geometry instead of restarting it', async () => {
    const originalDefaultAnimation = Chart.defaults.animation
    Chart.defaults.animation = { duration: 1, easing: 'linear' }

    try {
      element = mount(CHOICES_ANIMATED_SAMPLE)
      const root = shadowOf(element)
      const chart = Chart.getChart(root.querySelector('canvas'))

      // Let the initial mount's own animation settle before measuring
      // (duration 200ms, comfortable margin), so it doesn't contaminate the
      // sample captured for the toggle below.
      await wait(500)
      const before = barHeight(chart)

      setRangeValue(root.querySelector('input[type="range"]'), 90)
      await wait(40)
      const shortlyAfterToggle = barHeight(chart)

      await wait(500)
      const settled = barHeight(chart)

      // The value actually changed, and settled at the new target.
      expect(settled).not.toBeCloseTo(before, 0)

      const low = Math.min(before, settled)
      const high = Math.max(before, settled)
      expect(shortlyAfterToggle).toBeGreaterThan(low)
      expect(shortlyAfterToggle).toBeLessThan(high)
    } finally {
      Chart.defaults.animation = originalDefaultAnimation
    }
  })
})

describe('choices: keyboard', () => {
  it('moves the radiogroup selection with the arrow keys', async () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)
    const [first, second] = root.querySelectorAll('[role="radio"]')

    first.focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(second.getAttribute('aria-checked')).toBe('true')
    expect(second.tabIndex).toBe(0)
    expect(first.tabIndex).toBe(-1)
    expect(readouts(root)[0]).toBe("options.scales.y.type: 'logarithmic'")
  })
})

describe('choices: invalid declarations', () => {
  it('shows an error and leaves the element intact instead of throwing past it', () => {
    element = mount(CHOICES_INVALID_SAMPLE)
    const root = shadowOf(element)

    expect(root.querySelector('.chartjs-editor__error').textContent).toContain(
      'must declare `values`, or `min` and `max`'
    )
    expect(root.querySelectorAll('canvas')).toHaveLength(0)
    expect(root.querySelectorAll('.chartjs-editor__choice')).toHaveLength(0)
  })
})
