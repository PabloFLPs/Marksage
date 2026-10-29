// English technical docs + diagrams — a separate chunk, loaded only when a docs page opens in English.
import smartAssist from '../../docs/SMART-ASSIST.md?raw'
import models from '../../docs/MODELS.md?raw'
import infer from '../../docs/models-inference.svg?raw'
import train from '../../docs/models-training.svg?raw'
import arch from '../../docs/architecture.svg?raw'
import archNarrow from '../../docs/architecture.narrow.svg?raw'
import type { DocsContent } from './docsContent'

const content: DocsContent = {
  pages: { 'smart-assist': smartAssist, models },
  svgs: {
    'architecture.svg': { svg: arch, narrow: archNarrow },
    'models-inference.svg': { svg: infer },
    'models-training.svg': { svg: train },
  },
}
export default content
