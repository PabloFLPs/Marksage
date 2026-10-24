import type { ComponentType } from 'react'
import { BookMarked, BookOpen, Download, FlaskConical, GitPullRequest, History, LifeBuoy, Route, Scale, SlidersHorizontal } from 'lucide-react'
import type { SectionType } from '../assist/sections'

export const SECTION_ICONS: Record<SectionType, ComponentType<{ className?: string }>> = {
  overview: BookOpen,
  setup: Download,
  guide: Route,
  reference: BookMarked,
  config: SlidersHorizontal,
  example: FlaskConical,
  troubleshooting: LifeBuoy,
  changelog: History,
  contributing: GitPullRequest,
  legal: Scale,
}
