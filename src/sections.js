const BLOCK_MARKER = /(?:\/\/|\/\*)\s*<(\/?)block:([\w\s]+)(?::(\d+))?>\s*(?:\*\/)?/g

export function parseSections(value) {
  const segments = []
  let current = { start: 0 }
  BLOCK_MARKER.lastIndex = 0
  let match = BLOCK_MARKER.exec(value)

  while (match) {
    segments.push({
      ...current,
      code: value.slice(current.start, match.index).trim(),
    })
    current = match[1]
      ? { start: BLOCK_MARKER.lastIndex }
      : {
          name: match[2].trim(),
          order: Number(match[3] ?? 0),
          start: BLOCK_MARKER.lastIndex,
        }
    match = BLOCK_MARKER.exec(value)
  }

  segments.push({ ...current, code: value.slice(current.start).trim() })
  const populated = segments.filter((segment) => segment.code)
  const sections = populated.filter((segment) => segment.name).sort((a, b) => a.order - b.order)

  if (!sections.length) {
    return {
      sections: [{ code: value, name: 'JS', order: 0 }],
      segments: null,
    }
  }

  return { sections, segments: populated }
}
