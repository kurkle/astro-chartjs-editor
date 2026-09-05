import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup, EditorView } from 'codemirror'

import { parseSections } from './sections.js'

const editorTheme = EditorView.theme({
  '.cm-content': {
    lineHeight: '1.5',
  },
  '.cm-scroller': {
    fontFamily: 'var(--__sl-font-mono, ui-monospace, SFMono-Regular, Consolas, monospace)',
  },
  '&': {
    fontSize: '13px',
    height: '100%',
  },
})

export class SampleEditor {
  constructor({ code, onChange, parent, tabs }) {
    this.onChange = onChange
    this.root = parent.shadowRoot ?? parent.attachShadow({ mode: 'open' })
    this.tabs = tabs
    this.timeout = null
    this.view = null
    this.setValue(code)
  }

  get value() {
    if (!this.segments) return this.sections[0].code
    return this.segments.map((segment) => segment.code).join('\n\n')
  }

  setValue(code) {
    const parsed = parseSections(code)
    this.segments = parsed.segments
    this.sections = parsed.sections
    this.renderTabs()
    this.select(0)
  }

  renderTabs() {
    this.tabs.replaceChildren()
    this.tabs.hidden = this.sections.length === 1
    for (let index = 0; index < this.sections.length; index++) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'chartjs-editor__tab'
      button.textContent = this.sections[index].name
      button.addEventListener('click', () => this.select(index))
      this.tabs.append(button)
    }
  }

  select(index) {
    this.current = index
    if (this.view) {
      this.view.destroy()
      this.view.dom.remove()
    }
    for (let i = 0; i < this.tabs.children.length; i++) {
      this.tabs.children[i].classList.toggle('active', i === index)
    }

    const section = this.sections[index]
    this.view = new EditorView({
      doc: section.code,
      extensions: [
        basicSetup,
        javascript(),
        oneDark,
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          section.code = update.state.doc.toString()
          clearTimeout(this.timeout)
          this.timeout = setTimeout(() => this.onChange(this.value), 500)
        }),
      ],
      parent: this.root,
      root: this.root,
    })
  }
}
