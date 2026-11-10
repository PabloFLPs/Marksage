import { useMemo, type ReactNode } from 'react'
import { BookOpen, Brain, ClipboardPaste, Clipboard, Columns2, Cpu, Download, Eye, FilePlus2, FileText, FolderOpen, Home, Info, Languages, ListTree, Milestone, Moon, PenLine, PowerOff, Shield, Sparkles, Sun, Zap } from 'lucide-react'
import type { Command } from '../components/CommandPalette'
import type { AssistMode } from '../assist/types'
import { entryTitle, relativeTime, type HistoryEntry } from '../lib/history'
import { LANGS, type Lang } from '../lib/i18n'
import { loadModelNoticeSeen } from '../lib/storage'
import type { ViewMode } from '../lib/viewMode'
import { useI18n } from './useI18n'

/** Where the app is (what the list may offer) and what each command does. */
export interface PaletteContext {
  hasDocument: boolean
  showAbout: boolean
  readOnly: boolean
  editing: boolean
  isDesktop: boolean
  outlineShown: boolean
  theme: 'light' | 'dark'
  assistMode: AssistMode
  recent: HistoryEntry[]
  currentDocId: string | undefined
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
  onOpenHistory: (entry: HistoryEntry) => void
}

/** The command palette's list — only what can be done from the current screen, then the recent documents. */
export function usePaletteCommands(c: PaletteContext): Command[] {
  const { t, lang } = useI18n()
  const { hasDocument, showAbout, readOnly, editing, isDesktop, outlineShown, theme, assistMode, recent, currentDocId } = c
  const { onNew, onImport, onPaste, onTrySample, onExport, onPrintPdf, onCopy, changeViewMode, toggleOutline, toggleTheme, setLang, onAssistModeChange, requestAssistNotice, onCloseDocument, openAbout, openDocs, openModelsDocs, openStory, openPrivacy, onOpenHistory } = c
  return useMemo<Command[]>(() => {
    const docGroup = t('palette.group.document')
    const viewGroup = t('palette.group.view')
    const assistGroup = 'Smart Assist'
    const goGroup = t('palette.group.goto')
    const onDoc = hasDocument && !showAbout
    const list: Command[] = [
      { id: 'new', group: docGroup, icon: <FilePlus2 />, label: t('action.newDocument'), keywords: 'new blank create novo criar em branco', run: onNew },
      { id: 'open', group: docGroup, icon: <FolderOpen />, label: t('action.openFile'), keys: ['mod', 'o'], keywords: 'open file abrir arquivo', run: onImport },
      { id: 'paste', group: docGroup, icon: <ClipboardPaste />, label: t('empty.paste'), keywords: 'paste clipboard colar', run: onPaste },
      { id: 'sample', group: docGroup, icon: <Sparkles />, label: t('empty.trySample'), keywords: 'sample demo tour example exemplo', run: onTrySample },
    ]
    if (onDoc && !readOnly) list.push({ id: 'export', group: docGroup, icon: <Download />, label: t('action.exportMarkdown'), keys: ['mod', 's'], keywords: 'export save download exportar salvar baixar', run: onExport })
    if (onDoc) list.push({ id: 'pdf', group: docGroup, icon: <FileText />, label: t('action.exportPdf'), keywords: 'pdf print save export imprimir salvar exportar', run: onPrintPdf })
    if (onDoc) list.push({ id: 'copy', group: docGroup, icon: <Clipboard />, label: t('action.copyMarkdown'), keys: ['mod', 'shift', 'c'], keywords: 'copy copiar', run: onCopy })
    if (onDoc && !readOnly)
      list.push(
        editing
          ? { id: 'view', group: viewGroup, icon: <Eye />, label: t('action.preview'), keywords: 'preview read visualizar ler', run: () => changeViewMode('preview') }
          : { id: 'view', group: viewGroup, icon: isDesktop ? <Columns2 /> : <PenLine />, label: t('action.edit'), keywords: 'edit editor write editar escrever', run: () => changeViewMode('edit') },
      )
    if (onDoc)
      list.push({ id: 'outline', group: viewGroup, icon: <ListTree />, label: t(outlineShown ? 'palette.outlineHide' : 'palette.outlineShow'), keywords: 'outline document suggestions estrutura documento sugestões', run: toggleOutline })
    list.push(
      { id: 'theme', group: viewGroup, icon: theme === 'dark' ? <Sun /> : <Moon />, label: t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark'), keywords: 'theme dark light tema escuro claro', run: toggleTheme },
      ...LANGS.filter((l) => l.id !== lang).map((l) => ({ id: `lang-${l.id}`, group: viewGroup, icon: <Languages />, label: t('palette.language', { lang: l.label }), keywords: 'language idioma english português', run: () => setLang(l.id) })),
    )
    if (onDoc && editing) {
      const modes: [AssistMode, ReactNode][] = [['off', <PowerOff key="off" />], ['heuristics', <Zap key="rules" />], ['model', <Cpu key="model" />]]
      for (const [mode, icon] of modes)
        list.push({
          id: `assist-${mode}`,
          group: assistGroup,
          icon,
          label: t(`assist.option.${mode}`),
          hint: mode === assistMode ? t('palette.current') : undefined,
          keywords: 'assist mode modo smart',
          run: () => (mode !== 'model' || assistMode === 'model' || loadModelNoticeSeen() ? onAssistModeChange(mode) : requestAssistNotice()),
        })
    }
    if (hasDocument || showAbout) list.push({ id: 'home', group: goGroup, icon: <Home />, label: t('palette.startScreen'), keywords: 'start home close início inicial fechar', run: onCloseDocument })
    list.push(
      { id: 'about', group: goGroup, icon: <Info />, label: t('palette.about'), keywords: 'about help features sobre ajuda recursos', run: openAbout },
      { id: 'docs', group: goGroup, icon: <BookOpen />, label: t('palette.docs'), keywords: 'docs documentation how documentação', run: openDocs },
      { id: 'models', group: goGroup, icon: <Brain />, label: t('palette.models'), keywords: 'models ai training modelos ia treino', run: openModelsDocs },
      { id: 'story', group: goGroup, icon: <Milestone />, label: t('empty.story'), keywords: 'story timeline history história linha do tempo', run: openStory },
      { id: 'privacy', group: goGroup, icon: <Shield />, label: t('empty.privacy'), keywords: 'privacy storage data delete privacidade dados apagar', run: openPrivacy },
    )
    const recentGroup = t('history.title')
    for (const e of recent)
      if (e.id !== currentDocId)
        list.push({ id: `recent-${e.id}`, group: recentGroup, icon: <FileText />, label: entryTitle(e, t('doc.untitled')), hint: relativeTime(e.updatedAt, t, lang), keywords: e.filename ?? '', run: () => onOpenHistory(e) })
    return list
  }, [t, lang, setLang, hasDocument, showAbout, readOnly, editing, isDesktop, outlineShown, theme, assistMode, recent, currentDocId, onNew, onImport, onPaste, onTrySample, onExport, onPrintPdf, onCopy, changeViewMode, toggleOutline, toggleTheme, onAssistModeChange, requestAssistNotice, onCloseDocument, openAbout, openDocs, openModelsDocs, openStory, openPrivacy, onOpenHistory])
}
