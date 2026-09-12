import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineBrowserCommand } from '@vitest/browser'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Reference images can only be produced by a real browser, so producing them
// is a mode of this suite rather than a separate tool. `npm run fixtures:update`
// sets the flag and runs Chromium alone, so one browser is the source of
// truth for what gets written.
//
// The command below is registered only in that mode, and its presence (not a
// value passed through `define`) is what the suite checks: Vitest re-encodes
// a `define`d `false` as the browser-side string "false", which is truthy.
const updating = process.env.UPDATE_FIXTURES === '1'

const saveFixtureImage = defineBrowserCommand((_context, name, dataUrl) => {
  const file = resolve(process.cwd(), 'test/fixtures', `${name}.png`)
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log(`updated ${file}`)
})

// The same flags rasterize the canvas on the CPU in both browsers, so the
// pixel fixtures stay comparable regardless of the host's GPU.
const chromiumArgs = [
  '--disable-accelerated-2d-canvas',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
]

const firefoxPrefs = {
  'gfx.canvas.accelerated': false,
  'layers.acceleration.disabled': true,
}

export default defineConfig({
  resolve: {
    alias: {
      // src/client.js imports the Astro integration's virtual runtime
      // module, which only exists once the integration's Vite plugin has
      // registered it. Outside Astro, alias it to a stub that creates a real
      // Chart.js instance (see test/browser/runtime-stub.js), so the element
      // under test renders real ink instead of a mock.
      'virtual:astro-chartjs-editor/runtime': fileURLToPath(
        new URL('./test/browser/runtime-stub.js', import.meta.url)
      ),
    },
  },
  test: {
    browser: {
      commands: updating ? { saveFixtureImage } : {},
      enabled: true,
      headless: true,
      instances: updating
        ? [{ browser: 'chromium' }]
        : [{ browser: 'chromium' }, { browser: 'firefox' }],
      // These launch options belong to the provider, not an instance: Vitest
      // accepts (and silently ignores) a `launch`/`launchOptions` key on an
      // instance entry.
      provider: playwright({
        launchOptions: { args: chromiumArgs, firefoxUserPrefs: firefoxPrefs },
      }),
      screenshotFailures: false,
    },
    // Istanbul, not v8: v8 coverage is collected over the Chrome DevTools
    // Protocol, and Vitest refuses it as soon as a non-Chromium instance is
    // configured (Firefox, here). Instrumenting the source instead keeps
    // both browsers in one run and merges their coverage.
    //
    // Scoped to client.js and editor.js: these are the two modules that were
    // entirely untested before this change (DOM glue and the CodeMirror
    // wiring) and that only a real browser can exercise. integration.js,
    // remark.js, sections.js and charts.js are plain functions already
    // covered by `npm run test:unit`; letting this run also touch them
    // (editor.js imports sections.js) would just duplicate that coverage in
    // a second lcov file.
    coverage: {
      include: ['src/client.js', 'src/editor.js'],
      provider: 'istanbul',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage/browser',
    },
    globals: true,
    include: ['test/browser/**/*.spec.js'],
    setupFiles: ['test/browser/setup.js'],
  },
})
