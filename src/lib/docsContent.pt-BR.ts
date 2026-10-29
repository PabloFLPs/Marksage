// Portuguese technical docs + diagrams — a separate chunk, loaded only when a docs page opens in PT-BR.
import smartAssist from '../../docs/SMART-ASSIST.pt-BR.md?raw'
import models from '../../docs/MODELS.pt-BR.md?raw'
import infer from '../../docs/models-inference.pt-BR.svg?raw'
import train from '../../docs/models-training.pt-BR.svg?raw'
import arch from '../../docs/architecture.pt-BR.svg?raw'
import archNarrow from '../../docs/architecture.narrow.pt-BR.svg?raw'
import type { DocsContent } from './docsContent'

const content: DocsContent = {
  pages: { 'smart-assist': smartAssist, models },
  svgs: {
    'architecture.pt-BR.svg': { svg: arch, narrow: archNarrow },
    'models-inference.pt-BR.svg': { svg: infer },
    'models-training.pt-BR.svg': { svg: train },
  },
}
export default content
