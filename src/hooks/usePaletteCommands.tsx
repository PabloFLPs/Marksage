import { createElement, useMemo } from 'react'
import { FileText } from 'lucide-react'
import type { Command } from '../components/CommandPalette'
import type { AssistMode } from '../assist/types'
import { availableCommands, type CommandActions, type CommandContext, type CommandGroup } from '../commands/registry'
import { entryTitle, relativeTime, type HistoryEntry } from '../lib/history'
import { useI18n } from './useI18n'

/** Where the app is (what the list may offer), what each command does, and the recent documents. */
export interface PaletteContext extends CommandActions {
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
  onOpenHistory: (entry: HistoryEntry) => void
}

/** The command palette's list — the registry's commands for the current screen, then the recent documents. */
export function usePaletteCommands(c: PaletteContext): Command[] {
  const { t, lang } = useI18n()
  const { hasDocument, showAbout, readOnly, editing, isDesktop, outlineShown, theme, assistMode, recent, currentDocId } = c
  const { onNew, onImport, onPaste, onTrySample, onExport, onPrintPdf, onCopy, changeViewMode, toggleOutline, toggleTheme, setLang, onAssistModeChange, requestAssistNotice, onCloseDocument, openAbout, openDocs, openModelsDocs, openStory, openPrivacy, onOpenHistory } = c
  return useMemo<Command[]>(() => {
    const ctx: CommandContext = { hasDocument, showAbout, readOnly, editing, isDesktop, outlineShown, theme, assistMode, lang }
    const actions: CommandActions = { onNew, onImport, onPaste, onTrySample, onExport, onPrintPdf, onCopy, changeViewMode, toggleOutline, toggleTheme, setLang, onAssistModeChange, requestAssistNotice, onCloseDocument, openAbout, openDocs, openModelsDocs, openStory, openPrivacy }
    const groupLabel: Record<CommandGroup, string> = {
      document: t('palette.group.document'),
      view: t('palette.group.view'),
      assist: 'Smart Assist',
      goto: t('palette.group.goto'),
    }
    const list: Command[] = availableCommands(ctx).map((d) => {
      const title = d.title(ctx)
      const hint = d.hint?.(ctx)
      return {
        id: d.id,
        group: groupLabel[d.group],
        icon: createElement(d.icon(ctx)),
        label: t(title.key, title.vars),
        keys: d.keys,
        keywords: d.keywords(ctx),
        hint: hint ? t(hint) : undefined,
        run: () => d.run(ctx, actions),
      }
    })
    const recentGroup = t('history.title')
    for (const e of recent)
      if (e.id !== currentDocId)
        list.push({ id: `recent-${e.id}`, group: recentGroup, icon: <FileText />, label: entryTitle(e, t('doc.untitled')), hint: relativeTime(e.updatedAt, t, lang), keywords: e.filename ?? '', run: () => onOpenHistory(e) })
    return list
  }, [t, lang, setLang, hasDocument, showAbout, readOnly, editing, isDesktop, outlineShown, theme, assistMode, recent, currentDocId, onNew, onImport, onPaste, onTrySample, onExport, onPrintPdf, onCopy, changeViewMode, toggleOutline, toggleTheme, onAssistModeChange, requestAssistNotice, onCloseDocument, openAbout, openDocs, openModelsDocs, openStory, openPrivacy, onOpenHistory])
}
