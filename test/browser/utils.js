/**
 * DOM helpers shared by the browser specs.
 *
 * `mount` builds the exact markup `remarkChartEditor` emits (see
 * `src/remark.js`), so the specs exercise the same base64-templated shape a
 * real Markdown build produces rather than a hand-shaped stand-in.
 */

export function encodeBase64(code) {
  return btoa(unescape(encodeURIComponent(code)))
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

export function mount(
  code,
  { title = '', height = 240, sourceUrl = '', codePanel = undefined } = {}
) {
  const container = document.createElement('div')
  const codeAttribute = codePanel === undefined ? '' : ` data-code="${escapeAttribute(codePanel)}"`
  container.innerHTML =
    `<astro-chartjs-editor data-title="${escapeAttribute(title)}" data-height="${height}" data-source-url="${escapeAttribute(sourceUrl)}"${codeAttribute}>` +
    `<template data-chart-code data-encoding="base64">${encodeBase64(code)}</template>` +
    `</astro-chartjs-editor>`
  document.body.append(container)
  return container.querySelector('astro-chartjs-editor')
}

export function unmount(element) {
  element?.parentNode?.remove()
}

export function shadowOf(element) {
  return element.shadowRoot
}

/** True if the canvas has at least one non-white, non-transparent pixel. */
export function hasInk(canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 0 && (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255)) {
      return true
    }
  }
  return false
}
