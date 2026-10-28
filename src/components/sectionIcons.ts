import type { ComponentType } from 'react'
import { BookA, BookMarked, BookOpen, Download, FlaskConical, GitPullRequest, History, LifeBuoy, Lightbulb, Milestone, Rocket, Route, Scale, ShieldCheck, SlidersHorizontal, Zap } from 'lucide-react'
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
  security: ShieldCheck,
  performance: Zap,
  deployment: Rocket,
  explanation: Lightbulb,
  glossary: BookA,
  roadmap: Milestone,
}
