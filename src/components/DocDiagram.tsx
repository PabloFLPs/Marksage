import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useI18n } from '../hooks/useI18n'
import { MermaidView } from './MermaidView'

interface DocDiagramProps {
  /** The drawn version: our own SVG file (docs/*.svg), inlined so it follows the app theme and accent. */
  svg: string
  /** The same drawing with its lanes stacked, shown on narrow screens. */
  narrowSvg?: string
  /** The same diagram as Mermaid source (also what GitHub shows under "details"). */
  mermaid: string
  alt: string
}

type View = 'drawn' | 'mermaid'

/** A docs diagram with a switch between the drawn SVG and a Mermaid rendering (Mermaid loads on first use). */
export function DocDiagram({ svg, narrowSvg, mermaid, alt }: DocDiagramProps) {
  const { t } = useI18n()
  const [view, setView] = useState<View>('drawn')
  // Never wider than the drawing itself (the single-column diagrams are 440 px wide).
  const width = Number(/<svg[^>]*\swidth="(\d+)"/.exec(svg)?.[1]) || 720
  return (
    <figure className="doc-diagram-figure" style={{ '--diagram-max': `${width}px` } as CSSProperties}>
      <div role="group" aria-label={t('diagram.view')} className="doc-diagram-switch">
        {(['drawn', 'mermaid'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            title={v === 'mermaid' ? t('diagram.mermaidHint') : undefined}
            onClick={() => setView(v)}
          >
            {t(`diagram.${v}`)}
          </button>
        ))}
      </div>
      {view === 'drawn' ? (
        // Our own static files from the repo, not user content. CSS shows one of the two by width.
        <>
          <div className={`doc-diagram${narrowSvg ? ' doc-diagram-wide' : ''}`} role="img" aria-label={alt} dangerouslySetInnerHTML={{ __html: svg }} />
          {narrowSvg && <div className="doc-diagram doc-diagram-narrow" role="img" aria-label={alt} dangerouslySetInnerHTML={{ __html: narrowSvg }} />}
        </>
      ) : (
        <MermaidView source={mermaid} alt={alt} />
      )}
    </figure>
  )
}
