/**
 * Pixel comparison for the reference-image fixtures.
 */
import pixelmatch from 'pixelmatch'

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** Decode a PNG (an asset URL from a `?url` import) into ImageData. */
export function readImageData(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onerror = () => reject(new Error(`Failed to load image ${url}`))
    image.onload = () => {
      const { height, width } = image
      const ctx = createCanvas(width, height).getContext('2d')
      ctx.drawImage(image, 0, 0, width, height)
      resolve(ctx.getImageData(0, 0, width, height))
    }
    image.src = url
  })
}

/**
 * pixelmatch 7.2.0 changed the default `checkerboard` option to `true` in a
 * minor release, which blends semi-transparent pixels against a checkerboard
 * instead of plain white -- a different measurement, not a stricter one.
 * Force it off so a lockfile refresh onto a newer 7.x can't silently change
 * what a reference image means.
 */
export function diffImageData(actual, expected) {
  const { height, width } = expected
  const diff = createCanvas(width, height).getContext('2d').createImageData(width, height)
  const count = pixelmatch(actual.data, expected.data, diff.data, width, height, {
    checkerboard: false,
    threshold: 0.1,
  })
  return { count, ratio: count / (width * height) }
}
