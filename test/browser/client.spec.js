import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import '../../src/client.js'
import {
  clickCopy,
  clickReset,
  clickRun,
  cmContentOf,
  getTabs,
  openDetails,
  pressRunShortcut,
  replaceCurrentSectionCode,
  selectTab,
  typeCurrentSectionCode,
} from './interactions.js'
import {
  ACTIONS_SAMPLE,
  BASIC_SAMPLE,
  BROKEN_CONFIG_CODE,
  CHOICES_SAMPLE,
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

describe('chart header', () => {
  // mount() builds the exact markup remarkChartEditor emits (see utils.js's
  // header comment), so `title: ''` here stands in for a fence with no
  // title= meta on a page that -- after this fix -- resolves to no title at
  // all (see src/remark.js's editorMarkup() and its dedicated coverage in
  // test/remark.test.js, which is what actually exercises the regression:
  // remark.js reads node:buffer/node:path and can't be imported into this
  // browser bundle). What's tested here is the DOM contract that consumes
  // that resolved title: an empty title must hide the header outright,
  // taking no vertical space, rather than leaving a hollow box behind.
  it('is hidden and takes no vertical space when there is no title', () => {
    element = mount(BASIC_SAMPLE, { title: '' })
    const root = shadowOf(element)
    const header = root.querySelector('.chartjs-editor__chart-header')

    expect(header.hidden).toBe(true)
    expect(header.getBoundingClientRect().height).toBe(0)
  })

  // Stands in for a fence with title="Node Padding" (or chartTitle) in its
  // meta -- the still-honored side of the fallback chain.
  it('shows the title text and takes up space when a title is set', () => {
    element = mount(BASIC_SAMPLE, { title: 'Node Padding' })
    const root = shadowOf(element)
    const header = root.querySelector('.chartjs-editor__chart-header')

    expect(header.hidden).toBe(false)
    expect(header.textContent).toBe('Node Padding')
    expect(header.getBoundingClientRect().height).toBeGreaterThan(0)
  })

  it('still gives the canvas a real aria-label when the title is empty', () => {
    element = mount(BASIC_SAMPLE, { title: '' })
    const root = shadowOf(element)

    expect(root.querySelector('canvas').getAttribute('aria-label')).toBe('Chart.js sample')
  })
})

describe('code panel', () => {
  // The automatic rule (client.js, right after the initial render() call):
  // no `choices` means nothing else stands in for the full configuration,
  // so it starts open; one or more `choices` means the control already
  // surfaces the setting worth calling out, so it starts collapsed.
  it('is open by default when the sample declares no choices', () => {
    element = mount(BASIC_SAMPLE)
    const root = shadowOf(element)
    const details = root.querySelector('.chartjs-editor__details')

    expect(details.open).toBe(true)
  })

  it('is collapsed by default when the sample declares choices, and opens on click', async () => {
    element = mount(CHOICES_SAMPLE)
    const root = shadowOf(element)
    const details = root.querySelector('.chartjs-editor__details')

    expect(details.open).toBe(false)

    await openDetails(root)

    expect(details.open).toBe(true)

    await userEvent.click(root.querySelector('.chartjs-editor__summary'))

    expect(details.open).toBe(false)
  })

  it('code="collapsed" collapses the panel even when there are no choices', () => {
    element = mount(BASIC_SAMPLE, { codePanel: 'collapsed' })
    const root = shadowOf(element)

    expect(root.querySelector('.chartjs-editor__details').open).toBe(false)
  })

  it('code="open" opens the panel even when the sample declares choices', () => {
    element = mount(CHOICES_SAMPLE, { codePanel: 'open' })
    const root = shadowOf(element)

    expect(root.querySelector('.chartjs-editor__details').open).toBe(true)
  })

  it('ignores an unrecognized code= value and falls back to the automatic rule', () => {
    element = mount(CHOICES_SAMPLE, { codePanel: 'sideways' })
    const root = shadowOf(element)

    // CHOICES_SAMPLE declares choices, so the automatic rule says collapsed
    // -- same as if codePanel had been left unset entirely.
    expect(root.querySelector('.chartjs-editor__details').open).toBe(false)
  })

  it('sizes to its content instead of a fixed 360px box', async () => {
    element = mount(BASIC_SAMPLE)
    const root = shadowOf(element)

    await openDetails(root)

    // BASIC_SAMPLE's 'config' tab is four short lines; a box that still
    // sizes itself to the old fixed height would measure close to 360px.
    const { height } = root.querySelector('.chartjs-editor__code').getBoundingClientRect()
    expect(height).toBeGreaterThan(0)
    expect(height).toBeLessThan(200)
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

    await openDetails(root)
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

    await openDetails(root)
    await selectTab(root, 1) // 'data'
    replaceCurrentSectionCode(root, EDITED_DATA_CODE)
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

  // The one test in this suite that types character by character through a
  // real CodeMirror input (typeCurrentSectionCode(), see interactions.js)
  // instead of replaceCurrentSectionCode()'s deterministic transaction
  // dispatch. Every other test just needs particular code sitting in the
  // editor and doesn't care how it got there, so it uses the dispatch.
  // This one specifically has to prove that typing itself -- not a click,
  // not a dispatched change -- reaches CodeMirror's own input handling and
  // re-renders the chart once the 500ms debounce elapses, with no Run
  // click at all; a transaction dispatch wouldn't exercise that keyboard
  // path or the debounce timer next to it.
  it('re-renders the chart from real typing alone, once the debounce elapses, with no Run click', async () => {
    element = mount(BASIC_SAMPLE)
    const root = shadowOf(element)
    const canvasBefore = root.querySelector('canvas')

    await openDetails(root)
    await selectTab(root, 1) // 'data'
    await typeCurrentSectionCode(root, EDITED_DATA_CODE)

    // The 500ms debounce only starts counting down from the *last*
    // keystroke (see editor.js's updateListener: every change clears and
    // reschedules it), and typing EDITED_DATA_CODE character by character
    // itself takes a variable, load-dependent amount of time first -- so
    // this budget has to cover both, generously, rather than pin the
    // debounce's own 500ms as if typing were instant.
    await expect.poll(() => root.querySelector('canvas'), { timeout: 5000 }).not.toBe(canvasBefore)
    await expect.poll(() => hasInk(root.querySelector('canvas'))).toBe(true)
    expect(cmContentOf(root).textContent).toContain('9, 3, 6')
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

      await openDetails(root)
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

describe('run shortcut', () => {
  // Typing already re-renders after a 500ms debounce (see editor.js), so
  // the only thing distinguishing "the shortcut ran it" from "the debounce
  // would have fired anyway" is speed: poll well under 500ms, so this only
  // passes if Mod-Enter applied the edit immediately.
  const IMMEDIATE = { timeout: 150 }

  // CodeMirror resolves its 'Mod-' bindings from `navigator.platform` (see
  // editorTheme's comment in editor.js), the same host property for every
  // browser instance running on it -- confirmed here by both Chromium and
  // Firefox agreeing with *each other* and disagreeing with the "wrong"
  // modifier on a Mac dev machine (Ctrl+Enter did nothing in either engine;
  // Cmd+Enter worked in both). So which single key counts as "Mod" is a
  // platform fact, not something a test can hardcode across CI (Linux) and
  // a Mac without becoming exactly the kind of environment-dependent
  // flakiness this suite otherwise avoids.
  const isMac = /Mac/.test(navigator.platform)

  async function editAndPress(modifiers) {
    element = mount(BASIC_SAMPLE)
    const root = shadowOf(element)
    const canvasBefore = root.querySelector('canvas')

    await openDetails(root)
    await selectTab(root, 1) // 'data'
    replaceCurrentSectionCode(root, EDITED_DATA_CODE)
    pressRunShortcut(root, modifiers)

    await expect.poll(() => root.querySelector('canvas'), IMMEDIATE).not.toBe(canvasBefore)
    await expect.poll(() => hasInk(root.querySelector('canvas'))).toBe(true)
  }

  it("runs the current code immediately on this platform's Mod+Enter (Ctrl on Windows/Linux, Cmd on Mac)", async () => {
    await editAndPress(isMac ? { metaKey: true } : { ctrlKey: true })
  })

  it('does not run on the other modifier alone', async () => {
    // CodeMirror's key matching builds one exact modifier-prefixed name per
    // event (Alt-/Ctrl-/Meta-/Shift-, in that order) and compares it against
    // the binding's own normalized name -- there's no "any of these
    // modifiers" match. Holding both Ctrl and Meta together, tried first,
    // builds "Ctrl-Meta-Enter", which matches neither "Ctrl-Enter" nor
    // "Meta-Enter" and so doesn't run either -- confirmed by this failing
    // the same way pressing only the wrong single modifier does below.
    element = mount(BASIC_SAMPLE)
    const root = shadowOf(element)
    const canvasBefore = root.querySelector('canvas')

    await openDetails(root)
    await selectTab(root, 1) // 'data'
    replaceCurrentSectionCode(root, EDITED_DATA_CODE)
    pressRunShortcut(root, isMac ? { ctrlKey: true } : { metaKey: true })

    await new Promise((resolve) => setTimeout(resolve, IMMEDIATE.timeout))
    expect(root.querySelector('canvas')).toBe(canvasBefore)
  })
})

describe('error handling', () => {
  it('shows the error message on its own line, in both browsers', async () => {
    element = mount(BASIC_SAMPLE)
    const root = shadowOf(element)

    await openDetails(root)
    await selectTab(root, 0) // 'config'
    replaceCurrentSectionCode(root, BROKEN_CONFIG_CODE)
    await clickRun(root)

    // client.js used to show `error.stack ?? error.message`. V8 puts the
    // error's name and message at the top of `.stack`; Firefox's `.stack`
    // is call frames only, with no message line at all -- so this exact
    // assertion used to pass on Chromium and fail on Firefox. Rendering
    // `error.message` explicitly (see renderError() in client.js) fixes
    // that: this suite runs both engines, so a regression here fails in CI
    // regardless of which browser catches it first.
    const errorNode = root.querySelector('.chartjs-editor__error')
    expect(errorNode.textContent).toContain('brokenHelperThatDoesNotExist is not defined')
    expect(errorNode.querySelector('.chartjs-editor__error-message').textContent).toBe(
      'brokenHelperThatDoesNotExist is not defined'
    )
  })

  it('shows a thrown non-Error value too, not only real Error instances', () => {
    // A sample can `throw` any value, not necessarily an Error -- renderError()
    // has a separate branch (String(error), no message/stack split) for that.
    element = mount("throw 'a plain string, not an Error'")
    const root = shadowOf(element)

    expect(root.querySelector('.chartjs-editor__error').textContent).toBe(
      'a plain string, not an Error'
    )
  })

  it('shows the error and keeps the element intact without leaving a duplicate chart behind', async () => {
    element = mount(BASIC_SAMPLE)
    const root = shadowOf(element)

    await openDetails(root)
    await selectTab(root, 0) // 'config'
    replaceCurrentSectionCode(root, BROKEN_CONFIG_CODE)
    await clickRun(root)

    expect(root.querySelector('.chartjs-editor__error').textContent).not.toBe('')
    // The previous chart is left as-is on an error (documented behavior),
    // but it must never be duplicated.
    expect(root.querySelectorAll('canvas')).toHaveLength(1)

    // Recovering with valid code clears the error and still leaves exactly
    // one canvas -- no ghost from the errored attempt.
    replaceCurrentSectionCode(
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
