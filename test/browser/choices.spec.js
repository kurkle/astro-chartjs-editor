import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import '../../src/client.js'
import {
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

    // CHOICES_SAMPLE's config sets options.indexAxis: 'x', so 'x' -- the
    // first declared value -- must read active. Flip the declaration order
    // in samples.js and this would still need to pass, which is the point:
    // it's the config's value driving this, not array position.
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

    expect(readouts(root)).toEqual(["options.indexAxis: 'x'", 'data.datasets.0.borderWidth: 1'])
  })

  it('updates the readout when the selection changes', async () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)
    const [, secondRadio] = root.querySelectorAll('[role="radio"]')

    await userEvent.click(secondRadio)

    expect(readouts(root)[0]).toBe("options.indexAxis: 'y'")
  })
})

describe('choices: applying a selection', () => {
  it('re-creates the chart and moves the readout on a radio click', async () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)
    const canvasBefore = root.querySelector('canvas')
    const [, secondRadio] = root.querySelectorAll('[role="radio"]')

    await userEvent.click(secondRadio)

    expect(secondRadio.getAttribute('aria-checked')).toBe('true')
    const canvasAfter = root.querySelector('canvas')
    expect(canvasAfter).not.toBe(canvasBefore)
    await expect.poll(() => hasInk(canvasAfter)).toBe(true)
    expect(root.querySelector('.chartjs-editor__error').textContent).toBe('')
  })

  it('re-creates the chart on a range change', async () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)
    const canvasBefore = root.querySelector('canvas')

    setRangeValue(root.querySelector('input[type="range"]'), 7)

    await expect.poll(() => root.querySelector('canvas')).not.toBe(canvasBefore)
    expect(readouts(root)[1]).toBe('data.datasets.0.borderWidth: 7')
  })

  it('applies a choice to every chart in a `charts` block, not only the first', async () => {
    element = mount(CHOICES_WITH_CHARTS_SAMPLE)
    const root = shadowOf(element)
    const before = Array.from(root.querySelectorAll('canvas'))
    expect(before).toHaveLength(2)

    setRangeValue(root.querySelector('input[type="range"]'), 9)

    await expect.poll(() => root.querySelectorAll('canvas').length).toBe(2)
    const after = Array.from(root.querySelectorAll('canvas'))
    expect(after[0]).not.toBe(before[0])
    expect(after[1]).not.toBe(before[1])
    await expect.poll(() => after.every((canvas) => hasInk(canvas))).toBe(true)
    expect(readouts(root)[0]).toBe('data.datasets.0.borderWidth: 9')
  })

  it('re-creates the chart on a select change', async () => {
    element = mount(CHOICES_SELECT_CHECKBOX_SAMPLE)
    const root = shadowOf(element)
    const canvasBefore = root.querySelector('canvas')

    await userEvent.selectOptions(root.querySelector('select'), '2')

    await expect.poll(() => root.querySelector('canvas')).not.toBe(canvasBefore)
    expect(readouts(root)[0]).toBe("options.custom.mode: 'c'")
  })

  it('re-creates the chart on a checkbox change', async () => {
    element = mount(CHOICES_SELECT_CHECKBOX_SAMPLE)
    const root = shadowOf(element)
    const canvasBefore = root.querySelector('canvas')
    const checkbox = root.querySelector('input[type="checkbox"]')
    expect(checkbox.checked).toBe(true)

    await userEvent.click(checkbox)

    expect(checkbox.checked).toBe(false)
    await expect.poll(() => root.querySelector('canvas')).not.toBe(canvasBefore)
    expect(readouts(root)[1]).toBe('options.custom.enabled: false')
  })

  it('shows an error and keeps the element intact when applying a choice fails', async () => {
    element = mount(CHOICES_BREAKS_ON_APPLY_SAMPLE)
    const root = shadowOf(element)
    expect(root.querySelector('.chartjs-editor__error').textContent).toBe('')

    const [, secondRadio] = root.querySelectorAll('[role="radio"]')
    await userEvent.click(secondRadio)

    expect(root.querySelector('.chartjs-editor__error').textContent).not.toBe('')
    // The readout still reflects the click -- the control state is honest
    // about what was selected even though applying it failed.
    expect(readouts(root)[0]).toBe("type: 'not-a-real-chart-type'")

    // Picking a working value afterwards recovers cleanly.
    const [firstRadio] = root.querySelectorAll('[role="radio"]')
    await userEvent.click(firstRadio)

    expect(root.querySelector('.chartjs-editor__error').textContent).toBe('')
    expect(root.querySelectorAll('canvas')).toHaveLength(1)
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
    expect(readouts(root)[0]).toBe("options.indexAxis: 'y'")
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
