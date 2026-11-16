import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMMANDS, availableCommands, type CommandActions, type CommandContext } from '../../src/commands/registry'
import { saveModelNoticeSeen } from '../../src/lib/storage'

const start: CommandContext = {
  hasDocument: false,
  showAbout: false,
  readOnly: false,
  editing: false,
  isDesktop: true,
  outlineShown: false,
  theme: 'light',
  assistMode: 'heuristics',
  lang: 'en',
}
const editing: CommandContext = { ...start, hasDocument: true, editing: true }
const ids = (ctx: CommandContext) => availableCommands(ctx).map((c) => c.id)

function spyActions(): CommandActions {
  return {
    onNew: vi.fn(),
    onImport: vi.fn(),
    onPaste: vi.fn(),
    onTrySample: vi.fn(),
    onExport: vi.fn(),
    onPrintPdf: vi.fn(),
    onCopy: vi.fn(),
    changeViewMode: vi.fn(),
    toggleOutline: vi.fn(),
    toggleTheme: vi.fn(),
    setLang: vi.fn(),
    onAssistModeChange: vi.fn(),
    requestAssistNotice: vi.fn(),
    onCloseDocument: vi.fn(),
    openAbout: vi.fn(),
    openDocs: vi.fn(),
    openModelsDocs: vi.fn(),
    openStory: vi.fn(),
    openPrivacy: vi.fn(),
  }
}
const command = (id: string) => {
  const found = COMMANDS.find((c) => c.id === id)
  if (!found) throw new Error(`no command "${id}"`)
  return found
}

afterEach(() => saveModelNoticeSeen(false))

describe('command registry', () => {
  it('ids are unique', () => {
    expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(COMMANDS.length)
  })

  it('the start screen offers no document commands', () => {
    expect(ids(start)).toEqual(['new', 'open', 'paste', 'sample', 'theme', 'lang-pt-BR', 'about', 'docs', 'models', 'story', 'privacy'])
  })

  it('an open document in the editor offers everything, in display order', () => {
    expect(ids(editing)).toEqual([
      'new', 'open', 'paste', 'sample', 'export', 'pdf', 'copy', 'view', 'outline', 'theme', 'lang-pt-BR',
      'assist-off', 'assist-heuristics', 'assist-model', 'home', 'about', 'docs', 'models', 'story', 'privacy',
    ])
  })

  it('read-only documents can be printed and copied, not exported or edited', () => {
    const shown = ids({ ...editing, editing: false, readOnly: true })
    expect(shown).toEqual(expect.arrayContaining(['pdf', 'copy', 'outline']))
    expect(shown).not.toContain('export')
    expect(shown).not.toContain('view')
  })

  it('Assist modes only while editing; About hides document commands but keeps Start screen', () => {
    expect(ids({ ...editing, editing: false })).not.toContain('assist-off')
    const about = ids({ ...editing, showAbout: true })
    expect(about).not.toContain('copy')
    expect(about).toContain('home')
  })

  it('offers only the other language', () => {
    expect(ids({ ...start, lang: 'pt-BR' })).toContain('lang-en')
    expect(ids({ ...start, lang: 'pt-BR' })).not.toContain('lang-pt-BR')
  })

  it('names and icons follow the state', () => {
    expect(command('view').title(editing).key).toBe('action.preview')
    expect(command('view').title({ ...editing, editing: false }).key).toBe('action.edit')
    expect(command('theme').title({ ...start, theme: 'dark' }).key).toBe('theme.toLight')
    expect(command('assist-heuristics').hint?.(editing)).toBe('palette.current')
    expect(command('assist-off').hint?.(editing)).toBeUndefined()
  })

  it('runs through the same App actions', () => {
    const a = spyActions()
    command('view').run(editing, a)
    expect(a.changeViewMode).toHaveBeenCalledWith('preview')
    command('lang-pt-BR').run(start, a)
    expect(a.setLang).toHaveBeenCalledWith('pt-BR')
  })

  it('Rules + AI never skips the download notice', () => {
    const a = spyActions()
    command('assist-model').run(editing, a)
    expect(a.requestAssistNotice).toHaveBeenCalledOnce()
    expect(a.onAssistModeChange).not.toHaveBeenCalled()
    saveModelNoticeSeen(true)
    command('assist-model').run(editing, a)
    expect(a.onAssistModeChange).toHaveBeenCalledWith('model')
  })

  it('no command is destructive or acts on the selection yet', () => {
    expect(COMMANDS.filter((c) => c.destructive || c.needsSelection)).toEqual([])
  })
})
