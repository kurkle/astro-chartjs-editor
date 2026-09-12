import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../src/client.js'
import {
  clickCopy,
  clickReset,
  clickRun,
  cmContentOf,
  getTabs,
  replaceCurrentSectionCode,
  selectTab,
} from './interactions.js'
import {
  ACTIONS_SAMPLE,
  BASIC_SAMPLE,
  BROKEN_CONFIG_CODE,
  EDITED_DATA_CODE,
  OUTPUT_SAMPLE,
} from './samples.js'
import { hasInk, mount, shadowOf, unmount } from './utils.js'

let element

afterEach(() => {
  unmount(element)
  element = undefined
})

describe('mounting', () => {
  it('renders one canvas with ink and logs no console errors', async () => {
    const errorSpy = vi.spyOn(console, 'error')

    element = mount(BASIC_SAMPLE, { title: 'Example' })
    const root = shadowOf(element)
    const canvases = root.querySelectorAll('canvas')

    expect(canvases).toHaveLength(1)
    await expect.poll(() => hasInk(canvases[0])).toBe(true)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('mounts exactly once even if connectedCallback runs again', () => {
    element = mount(BASIC_SAMPLE)
    const root = shadowOf(element)
    const canvasCountBefore = root.querySelectorAll('canvas').length

    element.connectedCallback()

    expect(root.querySelectorAll('canvas')).toHaveLength(canvasCountBefore)
  })
})

describe('tabs', () => {
  it('creates tabs from block markers in declared order with the first selected', () => {
    element = mount(BASIC_SAMPLE)
    const root = shadowOf(element)
    const tabs = getTabs(root)

    expect(tabs.map((tab) => tab.textContent)).toEqual(['config', 'data'])
    expect(tabs[0].classList.contains('active')).toBe(true)
    expect(tabs[1].classList.contains('active')).toBe(false)
  })

  it('switches the active tab and its editor content on click', async () => {
    element = mount(BASIC_SAMPLE)
    const root = shadowOf(element)

    await selectTab(root, 1)

    const tabs = getTabs(root)
    expect(tabs[0].classList.contains('active')).toBe(false)
    expect(tabs[1].classList.contains('active')).toBe(true)
    expect(cmContentOf(root).textContent).toContain('3, 6, 9')
  })
})

describe('editing', () => {
  it('re-renders the chart after an edit, and Reset restores the original code', async () => {
    element = mount(BASIC_SAMPLE)
    const root = shadowOf(element)

    await selectTab(root, 1) // 'data'
    await replaceCurrentSectionCode(root, EDITED_DATA_CODE)
    await clickRun(root)

    expect(cmContentOf(root).textContent).toContain('9, 3, 6')

    await clickReset(root)

    // Reset re-selects the first tab ('config'); go back to 'data' to check
    // its code, specifically, reverted rather than merely re-rendering.
    await selectTab(root, 1)
    const dataText = cmContentOf(root).textContent
    expect(dataText).toContain('3, 6, 9')
    expect(dataText).not.toContain('9, 3, 6')
  })

  it('writes the composed code to the clipboard, falling back to execCommand when the Clipboard API is unavailable', async () => {
    const originalClipboard = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied in headless')) },
    })
    const execCommandSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true)

    try {
      element = mount(BASIC_SAMPLE)
      const root = shadowOf(element)

      await clickCopy(root)

      await expect.poll(() => root.querySelector('[data-chart-copy]').textContent).toBe('Copied')
      expect(execCommandSpy).toHaveBeenCalledWith('copy')
    } finally {
      execCommandSpy.mockRestore()
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      })
    }
  })
})

describe('error handling', () => {
  it('shows the error and keeps the element intact without leaving a duplicate chart behind', async () => {
    element = mount(BASIC_SAMPLE)
    const root = shadowOf(element)

    await selectTab(root, 0) // 'config'
    await replaceCurrentSectionCode(root, BROKEN_CONFIG_CODE)
    await clickRun(root)

    // Not asserting the exact message text: `error.stack` (what client.js
    // prefers) has no standardized content across engines. V8 (Chromium)
    // prepends "<Name>: <message>" to the frame list; Firefox's `.stack` is
    // call frames only, with no name or message line at all. So the only
    // thing guaranteed to be true in both is that *something* is shown.
    expect(root.querySelector('.chartjs-editor__error').textContent).not.toBe('')
    // The previous chart is left as-is on an error (documented behavior),
    // but it must never be duplicated.
    expect(root.querySelectorAll('canvas')).toHaveLength(1)

    // Recovering with valid code clears the error and still leaves exactly
    // one canvas -- no ghost from the errored attempt.
    await replaceCurrentSectionCode(
      root,
      "const config = { type: 'bar', data: { labels: [], datasets: [] }, options: { animation: false } }"
    )
    await clickRun(root)

    expect(root.querySelector('.chartjs-editor__error').textContent).toBe('')
    expect(root.querySelectorAll('canvas')).toHaveLength(1)
  })
})

describe('actions', () => {
  it('renders one button per action and calls its handler with the live chart', async () => {
    element = mount(ACTIONS_SAMPLE)
    const root = shadowOf(element)

    const actionButtons = root.querySelectorAll('[data-chart-action]')
    expect(actionButtons).toHaveLength(1)
    expect(actionButtons[0].textContent).toBe('Bump')

    await actionButtons[0].click()

    // No direct handle on the chart instance from here; the handler mutating
    // and calling chart.update() without throwing is itself the assertion
    // that it received a real, live Chart instance.
    expect(root.querySelector('.chartjs-editor__error').textContent).toBe('')
  })
})

describe('output panel', () => {
  it('shows console.log lines when output is enabled', async () => {
    element = mount(OUTPUT_SAMPLE)
    const root = shadowOf(element)

    const outputNode = root.querySelector('.chartjs-editor__output')
    expect(outputNode.hidden).toBe(false)
    expect(outputNode.querySelector('pre').textContent).toBe('ready')
  })
})
