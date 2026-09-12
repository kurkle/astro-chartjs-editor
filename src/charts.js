/**
 * Normalizes a sample's `module.exports` into a flat list of chart descriptors.
 *
 * A sample exports either a single `config` (the existing, backward-compatible
 * shape) or a `charts` array of `{ config, title }` entries. Exactly one of the
 * two must be present; anything else is a contract violation and throws.
 *
 * @param {{ config?: unknown, charts?: Array<{ config?: unknown, title?: string }> }} sampleExports
 * @returns {Array<{ config: unknown, title: string | undefined }>}
 */
export function normalizeCharts(sampleExports) {
  const exportsObject = sampleExports ?? {}
  const hasConfig = Object.hasOwn(exportsObject, 'config')
  const hasCharts = Object.hasOwn(exportsObject, 'charts')

  if (hasConfig && hasCharts) {
    throw new Error(
      'Sample exports both `config` and `charts`. Export only one: `config` for a single chart, or `charts` for multiple.'
    )
  }

  if (!hasConfig && !hasCharts) {
    throw new Error(
      'Sample must export either `config` (single chart) or `charts` (an array of chart entries).'
    )
  }

  if (hasConfig) {
    return [{ config: exportsObject.config, title: undefined }]
  }

  const { charts } = exportsObject
  if (!Array.isArray(charts)) {
    throw new TypeError('Sample `charts` must be an array of `{ config, title }` entries.')
  }

  return charts.map((entry, index) => {
    if (entry == null || !Object.hasOwn(entry, 'config')) {
      throw new Error(`Sample \`charts[${index}]\` is missing \`config\`.`)
    }
    return { config: entry.config, title: entry.title }
  })
}
