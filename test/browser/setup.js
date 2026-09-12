import { Chart } from 'chart.js'

// Deterministic rendering for both the ink checks and the pixel fixtures:
// - `animation: false` means a chart's pixels land on the canvas within the
//   same render rather than fading in over a duration.
// - `responsive: false` means Chart.js uses the canvas's own width/height
//   attributes (set explicitly by src/client.js) instead of observing the
//   container element's CSS size, which would otherwise vary with the test
//   runner's viewport.
// - a fixed `devicePixelRatio` keeps the backing store's pixel dimensions
//   independent of whatever the host display reports.
Chart.defaults.animation = false
Chart.defaults.devicePixelRatio = 1
Chart.defaults.responsive = false
