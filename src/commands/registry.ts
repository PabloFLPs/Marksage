import { BookOpen, Brain, ClipboardPaste, Clipboard, Code, Columns2, Cpu, Download, Eye, FilePlus2, FileText, FolderOpen, Heading, Home, Info, Languages, List, ListChecks, ListOrdered, ListTree, Milestone, Moon, PenLine, PowerOff, Quote, RemoveFormatting, Shield, Sparkles, Sun, Table, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AssistMode } from '../assist/types'
import type { EditName } from './edits'
import { LANGS, type Lang, type MessageKey, type Vars } from '../lib/i18n.ts'
import type { KeyToken } from '../lib/keyStyle'
import { loadModelNoticeSeen } from '../lib/storage.ts'
import type { ViewMode } from '../lib/viewMode'

/**
 * Marksage's commands, defined once: what each is called, when it's offered and what it does. The command palette
 * lists them (`hooks/usePaletteCommands.tsx`); the header and menus still call the same App handlers directly (moving
 * them onto `run` waits for the UI atlas — ROADMAP). Recent documents aren't commands: the palette adds them itself.
 */

/** Where the app is — what decides which commands are offered and how they're named. */
export interface CommandContext {
  hasDocument: boolean
  showAbout: boolean
  readOnly: boolean
  editing: boolean
  isDesktop: boolean
  outlineShown: boolean
  theme: 'light' | 'dark'
  assistMode: AssistMode
  lang: Lang
  /** Text is selected in the editor (read when the palette opens). */
  hasSelection: boolean
}

/** What commands can do — App's handlers, the same ones its buttons call. */
export interface CommandActions {
  onNew: () => void
  onImport: () => void
  onPaste: () => void
  onTrySample: () => void
  onExport: () => void
  /** Save as PDF: the print dialog on the rendered document. */
  onPrintPdf: () => void
  onCopy: () => void
  changeViewMode: (mode: ViewMode) => void
  toggleOutline: () => void
  toggleTheme: () => void
  setLang: (lang: Lang) => void
  onAssistModeChange: (mode: AssistMode) => void
  /** "Rules + AI" before the download notice was seen: the Assist menu opens on the notice instead. */
  requestAssistNotice: () => void
  onCloseDocument: () => void
  openAbout: () => void
  openDocs: () => void
  openModelsDocs: () => void
  openStory: () => void
  openPrivacy: () => void
  /** Apply a Markdown edit (`commands/edits.ts`) to the editor's selection as one undo step, or say there's nothing to change. */
  applyEdit: (edit: EditName) => void
}

export type CommandGroup = 'document' | 'format' | 'view' | 'assist' | 'goto'

/** A message key and its variables — the command's name in the current language. */
export interface CommandTitle {
  key: MessageKey
  vars?: Vars
}

export interface CommandDefinition {
  /** Stable: tests, the palette's rows and (later) the intent model's answers use it. */
  id: string
  group: CommandGroup
  icon: (ctx: CommandContext) => LucideIcon
  title: (ctx: CommandContext) => CommandTitle
  /** Extra words it's found by, in both languages — search terms, never shown. */
  keywords: (ctx: CommandContext) => string
  /** Its own shortcut, when it has one that works in every browser or is worth knowing. */
  keys?: KeyToken[]
  /** Quieter text after the name ("current"). */
  hint?: (ctx: CommandContext) => MessageKey | undefined
  when: (ctx: CommandContext) => boolean
  run: (ctx: CommandContext, actions: CommandActions) => void
  /** Asks before running (none yet: every command today can be undone or redone by hand). */
  destructive: boolean
  /** Offered only with text selected in the editor. */
  needsSelection: boolean
}

const fixed =
  <T>(value: T) =>
  (): T =>
    value
const always = (): boolean => true
/** A document is on screen (not About or a docs page over it). */
const onDocument = (ctx: CommandContext): boolean => ctx.hasDocument && !ctx.showAbout

/** Editing a document (not read-only): the Markdown edits apply. */
const inEditor = (ctx: CommandContext): boolean => onDocument(ctx) && ctx.editing && !ctx.readOnly

/**
 * A Markdown edit for the palette. Line edits (`needsSelection: false`) act on the lines the selection touches, or the
 * caret's line; the others need selected text. Each is one undo step (`commands/edits.ts`, `lib/editorText.ts`).
 */
function edit(id: string, icon: LucideIcon, title: MessageKey, keywords: string, transform: EditName, needsSelection: boolean): CommandDefinition {
  return {
    id,
    group: 'format',
    icon: fixed(icon),
    title: fixed({ key: title }),
    keywords: fixed(keywords),
    when: (ctx) => inEditor(ctx) && (!needsSelection || ctx.hasSelection),
    run: (_ctx, a) => a.applyEdit(transform),
    destructive: false,
    needsSelection,
  }
}

const ASSIST_MODES: { mode: AssistMode; icon: LucideIcon; title: MessageKey }[] = [
  { mode: 'off', icon: PowerOff, title: 'assist.option.off' },
  { mode: 'heuristics', icon: Zap, title: 'assist.option.heuristics' },
  { mode: 'model', icon: Cpu, title: 'assist.option.model' },
]

/** Display order: groups appear in the order of their first command. */
export const COMMANDS: readonly CommandDefinition[] = [
  {
    id: 'new',
    group: 'document',
    icon: fixed(FilePlus2),
    title: fixed({ key: 'action.newDocument' }),
    keywords: fixed('new blank create novo criar em branco'),
    when: always,
    run: (_ctx, a) => a.onNew(),
    destructive: false,
    needsSelection: false,
  },
  {
    id: 'open',
    group: 'document',
    icon: fixed(FolderOpen),
    title: fixed({ key: 'action.openFile' }),
    keywords: fixed('open file abrir arquivo'),
    keys: ['mod', 'o'],
    when: always,
    run: (_ctx, a) => a.onImport(),
    destructive: false,
    needsSelection: false,
  },
  {
    id: 'paste',
    group: 'document',
    icon: fixed(ClipboardPaste),
    title: fixed({ key: 'empty.paste' }),
    keywords: fixed('paste clipboard colar'),
    when: always,
    run: (_ctx, a) => a.onPaste(),
    destructive: false,
    needsSelection: false,
  },
  {
    id: 'sample',
    group: 'document',
    icon: fixed(Sparkles),
    title: fixed({ key: 'empty.trySample' }),
    keywords: fixed('sample demo tour example exemplo'),
    when: always,
    run: (_ctx, a) => a.onTrySample(),
    destructive: false,
    needsSelection: false,
  },
  {
    id: 'export',
    group: 'document',
    icon: fixed(Download),
    title: fixed({ key: 'action.exportMarkdown' }),
    keywords: fixed('export save download exportar salvar baixar'),
    keys: ['mod', 's'],
    when: (ctx) => onDocument(ctx) && !ctx.readOnly,
    run: (_ctx, a) => a.onExport(),
    destructive: false,
    needsSelection: false,
  },
  {
    id: 'pdf',
    group: 'document',
    icon: fixed(FileText),
    title: fixed({ key: 'action.exportPdf' }),
    keywords: fixed('pdf print save export imprimir salvar exportar'),
    when: onDocument,
    run: (_ctx, a) => a.onPrintPdf(),
    destructive: false,
    needsSelection: false,
  },
  {
    id: 'copy',
    group: 'document',
    icon: fixed(Clipboard),
    title: fixed({ key: 'action.copyMarkdown' }),
    keywords: fixed('copy copiar'),
    keys: ['mod', 'shift', 'c'],
    when: onDocument,
    run: (_ctx, a) => a.onCopy(),
    destructive: false,
    needsSelection: false,
  },
  edit('edit-table', Table, 'edit.table', 'table csv tsv columns spreadsheet tabela colunas planilha', 'linesToTable', true),
  edit('edit-bullets', List, 'edit.bulletList', 'list bullets unordered items lista marcadores tópicos itens', 'bulletList', false),
  edit('edit-numbered', ListOrdered, 'edit.numberedList', 'list numbered ordered steps lista numerada ordenada passos', 'numberedList', false),
  edit('edit-tasks', ListChecks, 'edit.taskList', 'tasks todo checklist checkbox tarefas lista de tarefas', 'taskList', false),
  edit('edit-heading-up', Heading, 'edit.headingUp', 'heading title level up bigger promote título nível subir maior', 'headingUp', false),
  edit('edit-heading-down', Heading, 'edit.headingDown', 'heading title level down smaller demote título nível descer menor', 'headingDown', false),
  edit('edit-quote', Quote, 'edit.quote', 'quote blockquote citação citar', 'quote', false),
  edit('edit-code', Code, 'edit.codeBlock', 'code block fence snippet código bloco trecho', 'codeBlock', true),
  edit('edit-plain', RemoveFormatting, 'edit.removeFormatting', 'remove clear plain bold italic link formatting remover limpar negrito itálico formatação', 'removeInlineFormatting', true),
  {
    // One row that switches: Preview while editing, Edit while reading.
    id: 'view',
    group: 'view',
    icon: (ctx) => (ctx.editing ? Eye : ctx.isDesktop ? Columns2 : PenLine),
    title: (ctx) => ({ key: ctx.editing ? 'action.preview' : 'action.edit' }),
    keywords: (ctx) => (ctx.editing ? 'preview read visualizar ler' : 'edit editor write editar escrever'),
    when: (ctx) => onDocument(ctx) && !ctx.readOnly,
    run: (ctx, a) => a.changeViewMode(ctx.editing ? 'preview' : 'edit'),
    destructive: false,
    needsSelection: false,
  },
  {
    id: 'outline',
    group: 'view',
    icon: fixed(ListTree),
    title: (ctx) => ({ key: ctx.outlineShown ? 'palette.outlineHide' : 'palette.outlineShow' }),
    keywords: fixed('outline document suggestions estrutura documento sugestões'),
    when: onDocument,
    run: (_ctx, a) => a.toggleOutline(),
    destructive: false,
    needsSelection: false,
  },
  {
    id: 'theme',
    group: 'view',
    icon: (ctx) => (ctx.theme === 'dark' ? Sun : Moon),
    title: (ctx) => ({ key: ctx.theme === 'dark' ? 'theme.toLight' : 'theme.toDark' }),
    keywords: fixed('theme dark light tema escuro claro'),
    when: always,
    run: (_ctx, a) => a.toggleTheme(),
    destructive: false,
    needsSelection: false,
  },
  ...LANGS.map(
    (l): CommandDefinition => ({
      id: `lang-${l.id}`,
      group: 'view',
      icon: fixed(Languages),
      title: fixed({ key: 'palette.language', vars: { lang: l.label } }),
      keywords: fixed('language idioma english português'),
      when: (ctx) => ctx.lang !== l.id,
      run: (_ctx, a) => a.setLang(l.id),
      destructive: false,
      needsSelection: false,
    }),
  ),
  ...ASSIST_MODES.map(
    ({ mode, icon, title }): CommandDefinition => ({
      id: `assist-${mode}`,
      group: 'assist',
      icon: fixed(icon),
      title: fixed({ key: title }),
      keywords: fixed('assist mode modo smart'),
      hint: (ctx) => (ctx.assistMode === mode ? 'palette.current' : undefined),
      when: (ctx) => onDocument(ctx) && ctx.editing,
      // Rules + AI never skips the download notice: until it was seen, the Assist menu opens on it.
      run: (ctx, a) => (mode !== 'model' || ctx.assistMode === 'model' || loadModelNoticeSeen() ? a.onAssistModeChange(mode) : a.requestAssistNotice()),
      destructive: false,
      needsSelection: false,
    }),
  ),
  {
    id: 'home',
    group: 'goto',
    icon: fixed(Home),
    title: fixed({ key: 'palette.startScreen' }),
    keywords: fixed('start home close início inicial fechar'),
    when: (ctx) => ctx.hasDocument || ctx.showAbout,
    run: (_ctx, a) => a.onCloseDocument(),
    destructive: false,
    needsSelection: false,
  },
  {
    id: 'about',
    group: 'goto',
    icon: fixed(Info),
    title: fixed({ key: 'palette.about' }),
    keywords: fixed('about help features sobre ajuda recursos'),
    when: always,
    run: (_ctx, a) => a.openAbout(),
    destructive: false,
    needsSelection: false,
  },
  {
    id: 'docs',
    group: 'goto',
    icon: fixed(BookOpen),
    title: fixed({ key: 'palette.docs' }),
    keywords: fixed('docs documentation how documentação'),
    when: always,
    run: (_ctx, a) => a.openDocs(),
    destructive: false,
    needsSelection: false,
  },
  {
    id: 'models',
    group: 'goto',
    icon: fixed(Brain),
    title: fixed({ key: 'palette.models' }),
    keywords: fixed('models ai training modelos ia treino'),
    when: always,
    run: (_ctx, a) => a.openModelsDocs(),
    destructive: false,
    needsSelection: false,
  },
  {
    id: 'story',
    group: 'goto',
    icon: fixed(Milestone),
    title: fixed({ key: 'empty.story' }),
    keywords: fixed('story timeline history história linha do tempo'),
    when: always,
    run: (_ctx, a) => a.openStory(),
    destructive: false,
    needsSelection: false,
  },
  {
    id: 'privacy',
    group: 'goto',
    icon: fixed(Shield),
    title: fixed({ key: 'empty.privacy' }),
    keywords: fixed('privacy storage data delete privacidade dados apagar'),
    when: always,
    run: (_ctx, a) => a.openPrivacy(),
    destructive: false,
    needsSelection: false,
  },
]

/** The commands offered right now, in display order. */
export function availableCommands(ctx: CommandContext): CommandDefinition[] {
  return COMMANDS.filter((c) => c.when(ctx))
}
