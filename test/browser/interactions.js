/**
 * Interaction helpers that drive the real CodeMirror editor and toolbar
 * inside the element's shadow root, through `vitest/browser`'s `userEvent`
 * (real Playwright input events, not synthetic DOM dispatch).
 */
import { EditorView } from 'codemirror'
import { userEvent } from 'vitest/browser'

export function getTabs(root) {
  return Array.from(root.querySelectorAll('.chartjs-editor__tab'))
}

/**
 * The tabs, editor, toolbar, error area and output all live inside a
 * `<details>` that's closed by default (see client.js), so anything that
 * clicks one of them -- through Playwright's real input, not synthetic DOM
 * dispatch -- needs the panel open first, or the click lands on a
 * non-visible element and fails.
 */
export async function openDetails(root) {
  const details = root.querySelector('.chartjs-editor__details')
  if (!details.open) await userEvent.click(root.querySelector('.chartjs-editor__summary'))
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

/**
 * The live CodeMirror `EditorView` behind whichever tab is currently
 * selected. `EditorView.findFromDOM()` is a public CodeMirror API that
 * recovers the view instance from any DOM node inside it, so this needs no
 * export added to `SampleEditor` just for tests to reach it.
 */
function currentEditorView(root) {
  const content = cmContentOf(root)
  const view = EditorView.findFromDOM(content)
  if (!view) throw new Error('currentEditorView: no CodeMirror view found for the current tab')
  return view
}

/**
 * Replaces the code of whichever tab is currently selected with `newCode`,
 * in one CodeMirror transaction (`view.dispatch` with a `changes` spec) --
 * the same low-level mechanism CodeMirror itself applies for every edit,
 * typed or not. Deterministic by construction: there is no simulated
 * keystroke stream here to race against CodeMirror's own input handling
 * (an earlier version of this helper did exactly that -- select-all
 * avoided for cross-platform reasons, so it walked to the end and held
 * Backspace, then retyped character by character with a bounded retry loop
 * and bracket-closer cleanup for when `userEvent.type` fell behind under
 * load -- and still occasionally delivered a scrambled result under CI
 * load, e.g. a dropped/reordered character in the middle of a fast paste).
 * If the resulting document isn't exactly `newCode`, this throws
 * immediately with the actual content rather than retrying: a transaction
 * dispatch either produces what was asked for or something is genuinely
 * wrong, never a partial keystroke race to wait out.
 *
 * See `typeCurrentSectionCode()` below for the one test that still needs
 * real, character-by-character typing.
 */
export function replaceCurrentSectionCode(root, newCode) {
  const view = currentEditorView(root)
  view.dispatch({ changes: { from: 0, insert: newCode, to: view.state.doc.length } })

  const actual = view.state.doc.toString()
  if (actual !== newCode) {
    throw new Error(
      `replaceCurrentSectionCode: content reads ${JSON.stringify(actual)}, expected ${JSON.stringify(newCode)}`
    )
  }
}

/**
 * Clears whichever tab is currently selected (via the same deterministic
 * transaction dispatch as `replaceCurrentSectionCode`, since removing the
 * old content isn't what's under test), then types `newCode` character by
 * character through a real Playwright keyboard input
 * (`@testing-library/user-event`'s `userEvent.type`, not a transaction).
 *
 * Kept for exactly one test (see client.spec.js's debounce test): the
 * point there is that typing itself -- not a click, not a dispatched
 * change -- reaches CodeMirror's own input handling and re-renders the
 * chart once the 500ms debounce elapses with no Run click. A transaction
 * dispatch wouldn't exercise that keyboard path at all, so this is the one
 * place a real keystroke stream is worth its occasional flakiness.
 */
export async function typeCurrentSectionCode(root, newCode) {
  const view = currentEditorView(root)
  view.dispatch({ changes: { from: 0, insert: '', to: view.state.doc.length } })

  await userEvent.type(cmContentOf(root), escapeForTyping(newCode))
}

export async function clickRun(root) {
  await userEvent.click(root.querySelector('[data-chart-run]'))
}

/**
 * Presses the Cmd/Ctrl+Enter run shortcut (see editor.js's Mod-Enter
 * keymap binding) with an explicit `ctrlKey`/`metaKey` flag rather than
 * going through `userEvent.keyboard`'s modifier-key syntax. CodeMirror
 * resolves its 'Mod-' bindings from the event's own ctrlKey/metaKey flags,
 * not from which physical key was struck, so dispatching a real
 * KeyboardEvent with the flag set directly is a faithful, engine-agnostic
 * way to fire it -- Playwright's own OS-level resolution of *which*
 * physical key a test should press for 'the' modifier key is exactly the
 * kind of platform-dependent behavior this suite otherwise avoids.
 */
export function pressRunShortcut(root, { ctrlKey = false, metaKey = false } = {}) {
  cmContentOf(root).dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey,
      key: 'Enter',
      metaKey,
    })
  )
}

export async function clickReset(root) {
  await userEvent.click(root.querySelector('[data-chart-reset]'))
}

export async function clickCopy(root) {
  await userEvent.click(root.querySelector('[data-chart-copy]'))
}
