/**
 * Interaction helpers that drive the real CodeMirror editor and toolbar
 * inside the element's shadow root, through `vitest/browser`'s `userEvent`
 * (real Playwright input events, not synthetic DOM dispatch).
 */
import { userEvent } from 'vitest/browser'

export function getTabs(root) {
  return Array.from(root.querySelectorAll('.chartjs-editor__tab'))
}

export async function selectTab(root, index) {
  const tabs = getTabs(root)
  await userEvent.click(tabs[index])
}

/**
 * `SampleEditor` attaches its own shadow root on `.chartjs-editor__code`
 * (`parent.attachShadow(...)` in src/editor.js), separate from the custom
 * element's own shadow root. CodeMirror's `.cm-content` lives inside that
 * nested shadow root, so it isn't reachable through the outer root's
 * `querySelector`.
 */
export function cmContentOf(root) {
  return root.querySelector('.chartjs-editor__code').shadowRoot.querySelector('.cm-content')
}

/**
 * `userEvent.type`'s special-key syntax (from `@testing-library/user-event`)
 * reads `{` and `[` as the start of a key descriptor (`{Enter}`, `[ControlLeft]`).
 * Doubling them is that library's documented escape for literal braces and
 * brackets in the text -- both of which show up constantly in JS code.
 */
function escapeForTyping(text) {
  return text.replaceAll('{', '{{').replaceAll('[', '[[')
}

function activeElementIn(shadowRoot) {
  return shadowRoot.activeElement
}

async function waitFor(predicate, { interval = 20, timeout = 2000 } = {}) {
  const deadline = Date.now() + timeout
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition never became true')
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

// `.cm-content`'s `textContent` concatenates each source line's `.cm-line`
// div with no separator -- browsers don't insert one between block-level
// siblings -- so a real, correctly-typed multi-line result never contains
// the newlines `newCode` does; this is what a correctly-typed result reads
// as instead. Replacement code passed to `replaceCurrentSectionCode` is kept
// to a single line for exactly this reason: CodeMirror auto-indents after a
// typed newline (part of `basicSetup`), and that auto-indent stacks with any
// indentation already present in a multi-line replacement string, making the
// resulting text depend on details of how the newline was typed rather than
// only on `newCode` itself.
function flatten(text) {
  return text.replaceAll('\n', '')
}

/**
 * Replaces the code of whichever tab is currently selected.
 *
 * This deliberately avoids a select-all keychord. CodeMirror's `basicSetup`
 * binds it to "Mod-a", which CodeMirror resolves to Control-a or Cmd-a
 * depending on the platform it detects -- and doing that detection through a
 * real Playwright-driven browser, across Chromium and Firefox and both CI's
 * Linux and a Mac dev machine, turned out to be exactly the kind of
 * environment-dependent timing this suite otherwise avoids (it was flaky in
 * practice, passing most runs and silently mis-typing on others).
 *
 * Walking to the end and holding Backspace long enough to clear the section
 * needs no modifier-key resolution and no held state, just repeat counts
 * generous enough that the excess presses are no-ops once the caret hits the
 * start of the section.
 *
 * The whole clear-and-type cycle is verified against the DOM afterwards
 * rather than trusted blindly, with one targeted repair and a bounded number
 * of full retries: CodeMirror's `closeBrackets` extension (also part of
 * `basicSetup`) inserts a matching closer as you type an opening bracket and
 * "overtypes" -- skips over rather than duplicating -- once you type that
 * same closer yourself with the cursor immediately before it. Under fast,
 * programmatic typing that overtype has occasionally missed for the
 * outermost pair, leaving its auto-inserted closer stranded right after the
 * real content. A suite that silently exercised the wrong code path some
 * fraction of the time would be worse than a slower, self-checking one.
 */
export async function replaceCurrentSectionCode(root, newCode, attempts = 3) {
  const content = cmContentOf(root)
  const codeShadowRoot = root.querySelector('.chartjs-editor__code').shadowRoot
  const expected = escapeForTyping(newCode)
  const target = flatten(newCode)

  for (let attempt = 1; attempt <= attempts; attempt++) {
    await userEvent.click(content)
    await waitFor(() => activeElementIn(codeShadowRoot) === content)

    const lineCount = content.querySelectorAll('.cm-line').length
    const clearCount = content.textContent.length + 20
    await userEvent.keyboard(`{ArrowDown>${lineCount + 5}}{End}{Backspace>${clearCount}}`)

    try {
      await waitFor(() => content.textContent === '', { timeout: 500 })
    } catch {
      continue // didn't fully clear; retry from a click
    }

    await userEvent.type(content, expected, { skipClick: true })

    if (content.textContent === target) return

    // CodeMirror's `closeBrackets` extension (part of `basicSetup`) inserts
    // a matching closer as you type an opening bracket and "overtypes" it
    // -- skips over rather than duplicating -- once you type that same
    // closer yourself with the cursor immediately before it. Under fast,
    // programmatic typing that overtype occasionally misses for the
    // outermost pair, leaving its auto-inserted closer stranded right where
    // the cursor stopped: real content followed by one or more genuine
    // extra `}`/`)`/`]`. The cursor is still sitting exactly there, so
    // deleting forward trims exactly the surplus without touching anything
    // that was actually typed.
    if (content.textContent.startsWith(target)) {
      const surplus = content.textContent.length - target.length
      await userEvent.keyboard(`{Delete>${surplus}}`)
      if (content.textContent === target) return
    }
  }

  throw new Error(
    `replaceCurrentSectionCode: content still reads ${JSON.stringify(content.textContent)} after ${attempts} attempts, expected ${JSON.stringify(target)}`
  )
}

export async function clickRun(root) {
  await userEvent.click(root.querySelector('[data-chart-run]'))
}

export async function clickReset(root) {
  await userEvent.click(root.querySelector('[data-chart-reset]'))
}

export async function clickCopy(root) {
  await userEvent.click(root.querySelector('[data-chart-copy]'))
}
