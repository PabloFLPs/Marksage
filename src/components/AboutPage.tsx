import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  ClipboardPaste,
  Code2,
  Cookie,
  HardDrive,
  Trash2,
  Columns2,
  Download,
  FileText,
  Gauge,
  Heading,
  ListTree,
  ImageOff,
  Lock,
  Moon,
  Save,
  Scale,
  History,
  Sparkles,
  Table,
  UserRound,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { hasDownloadedModel } from '../assist/modelEngine'
import { AppIconPicker } from './AppIconPicker'
import type { AppIconId } from '../lib/appIcons'
import { keyLabel, type KeyStyle, type KeyToken } from '../lib/keyStyle'
import { useKeyStyle } from '../hooks/useKeyStyle'
import { createContext, useContext } from 'react'
import { useI18n } from '../hooks/useI18n'
import { LANGS, type Lang } from '../lib/i18n'

const KeyStyleContext = createContext<KeyStyle>('mac')

interface AboutPageProps {
  onBack: () => void
  onOpenDocs: () => void
  onOpenModelsDocs: () => void
  closing?: boolean
  onTrySmartAssist: () => void
  appIcon: AppIconId
  onAppIconChange: (id: AppIconId) => void
  theme: 'light' | 'dark'
  /** Delete the cached model files (and leave Rules + AI mode). */
  onRemoveModel: () => Promise<void>
  /** Wipe every Marksage key and cache in this browser, then reload. */
  onDeleteAllData: () => Promise<void>
  /** "Load images from the web" (lib/remoteImages.ts). */
  remoteImages: boolean
  onRemoteImagesChange: (on: boolean) => void
}

const SHORTCUTS: [KeyToken[], string, string][] = [
  [['mod', 'o'], 'Open a file', 'Abrir um arquivo'],
  [['mod', 'n'], 'New document', 'Novo documento'],
  [['mod', 's'], 'Export (press again to download)', 'Exportar (aperte de novo para baixar)'],
  [['mod', 'shift', 'c'], 'Copy Markdown', 'Copiar Markdown'],
  [['mod', 'shift', 'h'], 'Recent documents', 'Documentos recentes'],
  [['tab'], 'Accept a Smart Assist suggestion', 'Aceitar uma sugestão do Smart Assist'],
  [['esc'], 'Dismiss a suggestion', 'Ignorar uma sugestão'],
]

export function AboutPage({ closing = false, onBack, onOpenDocs, onOpenModelsDocs, onTrySmartAssist, appIcon, onAppIconChange, theme, onRemoveModel, onDeleteAllData, remoteImages, onRemoteImagesChange }: AboutPageProps) {
  const { keyStyle, setKeyStyle } = useKeyStyle()
  const { t, lang, setLang } = useI18n()
  const pt = lang === 'pt-BR'
  /** Pick the copy for the current language. */
  const x = <T,>(en: T, ptBR: T): T => (pt ? ptBR : en)
  const strong = 'font-medium text-ink dark:text-dark-ink'
  // #privacy (the start screen's "Privacy & storage" link) opens About scrolled to that section.
  useEffect(() => {
    const go = () => {
      if (window.location.hash === '#privacy') window.document.getElementById('privacy')?.closest('section')?.scrollIntoView({ block: 'start' })
    }
    const timer = window.setTimeout(go, 60) // after the page's enter animation has laid it out
    window.addEventListener('hashchange', go)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('hashchange', go)
    }
  }, [])

  return (
    <KeyStyleContext.Provider value={keyStyle}>
    <main className={`scroll-area min-h-0 flex-1 overflow-y-auto ${closing ? 'anim-fade-out' : 'anim-fade'}`}>
      <div className={`mx-auto w-full max-w-[760px] px-4 py-8 sm:px-6 sm:py-10 ${closing ? 'anim-stagger-out' : 'anim-stagger'}`}>
        <button
          type="button"
          onClick={onBack}
          className="tap -ml-2 mb-8 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-ink-muted transition-colors hover:text-accent dark:text-dark-ink-muted dark:hover:text-dark-accent"
        >
          <ArrowLeft className="h-4 w-4" /> {t('about.back')}
        </button>

        <h1 className="text-2xl font-semibold tracking-tight">{t('app.name')}</h1>
        <p className="mt-1 text-sm font-medium text-accent dark:text-dark-accent">{t('app.tagline')}</p>
        <p className="mt-3 text-sm leading-6 text-ink-muted dark:text-dark-ink-muted">
          {x(
            'A quiet place to read and write Markdown — with a small, local assistant that notices what you meant to write and offers to fix it. Nothing you open here ever leaves your browser.',
            'Um lugar tranquilo para ler e escrever Markdown — com um pequeno assistente local que percebe o que você quis escrever e oferece a correção. Nada do que você abre aqui sai do seu navegador.',
          )}
        </p>

        <Section title={x('Appearance', 'Aparência')}>
          <p className="mb-4 text-sm leading-6 text-ink-muted dark:text-dark-ink-muted">
            {x(
              'App icon and accent colour — shown in the browser tab, the header, and across the interface.',
              'Ícone do app e cor de destaque — aparecem na aba do navegador, no cabeçalho e em toda a interface.',
            )}
          </p>
          <AppIconPicker value={appIcon} onChange={onAppIconChange} theme={theme} />
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('appearance.language')}</p>
            <Segmented<Lang>
              label={t('appearance.language')}
              value={lang}
              onChange={setLang}
              options={LANGS.map((l) => [l.id, l.label, l.short])}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('appearance.keyStyle')}</p>
            <Segmented<KeyStyle>
              label={t('appearance.keyStyle')}
              value={keyStyle}
              onChange={setKeyStyle}
              options={[
                ['mac', 'macOS', '⌘ ⇧'],
                ['windows', t('keystyle.windows'), 'Ctrl Shift'],
              ]}
            />
          </div>
        </Section>

        <Section title="Smart Assist" badge={x('local · on by default', 'local · ligado por padrão')}>
          <p className="mb-4 text-sm leading-6 text-ink-muted dark:text-dark-ink-muted">
            {x(
              <>
                It’s on from the start in <strong className={strong}>Rules</strong> mode; switch modes or turn it off from the{' '}
                <strong className={strong}>Assist</strong> menu in the editor header (the sparkle button on phones). It never
                changes your text on its own — it only suggests, and only when it's confident.{' '}
                <Keys k={['tab']} /> accepts, <Keys k={['esc']} /> dismisses, <Keys k={['mod', 'z']} /> undoes. The icon on a suggestion says what kind of fix it is; a ✦ means the local model made the call; click the card to see where it applies.
              </>,
              <>
                Ele já vem ligado no modo <strong className={strong}>Regras</strong>; troque de modo ou desligue pelo menu{' '}
                <strong className={strong}>Assist</strong> no cabeçalho do editor (o botão ✦ no celular). Ele nunca altera o
                seu texto sozinho — só sugere, e só quando tem confiança. <Keys k={['tab']} /> aceita,{' '}
                <Keys k={['esc']} /> ignora, <Keys k={['mod', 'z']} /> desfaz. O ícone de uma sugestão diz que tipo de correção ela é; um ✦ quer dizer que o modelo local decidiu; clique no cartão para ver onde ela se aplica.
              </>,
            )}
          </p>
          <Feature icon={<Code2 />} title={x('Code block languages', 'Linguagem dos blocos de código')}>
            {x(
              <>Leave a code block (<code>```</code>) without a language and it suggests one (TypeScript, Python, Bash, SQL and 16 more), so your code gets properly labelled. When two languages fit (JavaScript or TypeScript, C or C++), <em>Rules + AI</em> offers both and lets you pick.</>,
              <>Deixe um bloco de código (<code>```</code>) sem linguagem e ele sugere uma (TypeScript, Python, Bash, SQL e mais 16), para o seu código ficar bem identificado. Quando duas linguagens servem (JavaScript ou TypeScript, C ou C++), o modo <em>Regras + IA</em> oferece as duas para você escolher.</>,
            )}
          </Feature>
          <Feature icon={<Table />} title={x('Smart paste', 'Colagem inteligente')}>
            {x(
              'Paste CSV, spreadsheet cells, terminal output, bullet lists or JSON — your paste lands untouched, then you’re offered a clean Markdown table, list or code block.',
              'Cole CSV, células de planilha, saída de terminal, listas ou JSON — a colagem entra intacta e depois você recebe a oferta de uma tabela, lista ou bloco de código em Markdown.',
            )}
          </Feature>
          <Feature icon={<Heading />} title={x('Structure hints', 'Dicas de formatação')}>
            {x(
              <>Catches the near-misses: <code>**Title**</code> used as a heading, <code>#Heading</code> without a space, <code>-item</code>, <code>1)item</code>, <code>1- item</code>, <code>• item</code> pasted from a document, <code>== Title ==</code>, and links broken by a space, <code>[text] (url)</code>.</>,
              <>Pega os quase-acertos: <code>**Título**</code> usado como título, <code>#Título</code> sem espaço, <code>-item</code>, <code>1)item</code>, <code>1- item</code>, <code>• item</code> colado de um documento, <code>== Título ==</code> e links quebrados por um espaço, <code>[texto] (url)</code>.</>,
            )}
          </Feature>
          <Feature icon={<Gauge />} title={x('Readability dots', 'Pontos de legibilidade')}>
            {x(
              <>Each <code>##</code> section gets a subtle dot in the preview — green to red — with a tooltip. Works in English and Portuguese.</>,
              <>Cada seção <code>##</code> ganha um pontinho discreto na pré-visualização — do verde ao vermelho — com uma dica ao passar o mouse. Funciona em português e inglês.</>,
            )}
          </Feature>
          <Feature icon={<ListTree />} title={x('Outline & document insights', 'Estrutura e análise do documento')}>
            {x(
              <>The <em>Outline</em> panel lists every section with what it is — setup, reference, security and 13 more — and its key sentence; click one to jump there. Types come from the headings; in <em>Rules + AI</em> mode, Marksage’s section model also reads the text under headings that don’t say. Its <em>Document</em> tab sums the whole file up: what it looks like (README, guide, changelog…), reading time, readability, tone signals and things worth a look, like heading jumps or images without alt text. Its <em>Suggestions</em> tab lists everything Smart Assist could fix in the whole document; click one and the suggestion opens right there in the editor.</>,
              <>O painel <em>Estrutura</em> lista cada seção com o que ela é — instalação, referência, segurança e mais 13 — e sua frase-chave; clique para ir até ela. Os tipos vêm dos títulos; no modo <em>Regras + IA</em>, o modelo de seções do Marksage também lê o texto sob títulos que não dizem. A aba <em>Documento</em> resume o arquivo inteiro: com o que ele se parece (README, guia, registro de mudanças…), tempo de leitura, legibilidade, sinais de tom e o que vale uma olhada, como saltos de título ou imagens sem texto alternativo. A aba <em>Sugestões</em> lista tudo o que o Smart Assist poderia corrigir no documento inteiro; clique em uma e a sugestão abre ali mesmo no editor.</>,
            )}
          </Feature>
          <p className="mt-4 text-xs leading-5 text-ink-muted dark:text-dark-ink-muted">
            {x(
              <>Modes: <strong className="font-medium">Rules</strong> runs instantly with no download — rules for every question. <strong className="font-medium">Rules + AI</strong> adds Marksage’s own small models where they beat the rules: one for code-block languages (385 KB, trained on ~64k real code blocks) and one for section types in the Outline (385 KB, trained on ~27k real doc sections, fetched the first time you open it). They run entirely on your device and are downloaded once, then kept in your browser. Everything else stays with the rules: models for structure hints and paste types were trained too, but on real text they didn’t do better than the rules, so they aren’t used.</>,
              <>Modos: <strong className="font-medium">Regras</strong> roda na hora, sem download — regras para todas as perguntas. <strong className="font-medium">Regras + IA</strong> adiciona os modelos pequenos do próprio Marksage onde eles superam as regras: um para as linguagens dos blocos de código (385 KB, treinado com ~64 mil blocos de código reais) e um para os tipos de seção na Estrutura (385 KB, treinado com ~27 mil seções de documentação reais, baixado na primeira vez que você a abre). Eles rodam inteiramente no seu dispositivo e são baixados uma vez, depois ficam guardados no navegador. O resto continua com as regras: também treinamos modelos para as dicas de estrutura e os tipos de colagem, mas em textos reais eles não se saíram melhor que as regras, então não são usados.</>,
            )}
          </p>
          <ModeTable x={x} />
          <button
            type="button"
            onClick={onTrySmartAssist}
            className="press group mt-5 inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong dark:bg-dark-accent dark:text-dark-surface dark:hover:bg-dark-accent-strong"
          >
            <Sparkles className="hover-sparkle h-4 w-4" /> {x('Try it on a sample document', 'Experimentar num documento de exemplo')}
          </button>
          <button
            type="button"
            onClick={onOpenDocs}
            className="group ml-1 mt-5 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-accent hover:bg-accent/5 dark:text-dark-accent dark:hover:bg-dark-accent/10"
          >
            <BookOpen className="h-4 w-4" /> {x('How it works', 'Como funciona')}
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
          <button
            type="button"
            onClick={onOpenModelsDocs}
            className="group ml-1 mt-5 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-accent hover:bg-accent/5 dark:text-dark-accent dark:hover:bg-dark-accent/10"
          >
            <Brain className="h-4 w-4" /> {x('How the models work', 'Como os modelos funcionam')}
          </button>
        </Section>

        <Section title={x('Reading & writing', 'Leitura e escrita')}>
          <Feature icon={<FileText />} title={x('Open anything Markdown', 'Abra qualquer Markdown')}>
            {x(
              <>Drag a Markdown file anywhere onto the window, use Open, paste text straight onto the empty page, or start writing. <code>.md</code>, <code>.markdown</code> and <code>.mdx</code> open (MDX’s JSX shows as plain text), as do <code>.mdown</code>, <code>.mkd</code>, <code>.mkdn</code> and <code>.mdwn</code>; plain <code>.txt</code> doesn’t. If the browser won’t let Paste read your clipboard, a new document opens for you to paste into.</>,
              <>Arraste um arquivo Markdown para qualquer lugar da janela, use Abrir, cole o texto direto na página vazia, ou comece a escrever. Abrem <code>.md</code>, <code>.markdown</code> e <code>.mdx</code> (o JSX do MDX aparece como texto), além de <code>.mdown</code>, <code>.mkd</code>, <code>.mkdn</code> e <code>.mdwn</code>; <code>.txt</code> simples não. Se o navegador não deixar o Colar ler a área de transferência, abre um documento novo para você colar nele.</>,
            )}
          </Feature>
          <Feature icon={<Columns2 />} title={x('Live split editor', 'Editor dividido ao vivo')}>
            {x(
              'Opened and pasted files show the preview first, for reading — start typing and the editor opens right there, with your keystroke in it. Edit on the right, watch the preview update on the left. Drag the divider to resize; double-click it to reset. On phones the editor comes first. On long documents, two small buttons in the corner of the preview take you to the start or the end — and typing stays smooth: the preview catches up a moment later, re-rendering only the section you changed.',
              'Arquivos abertos e colados aparecem primeiro na pré-visualização, para leitura — comece a digitar e o editor abre ali mesmo, com a sua tecla nele. Edite à direita e veja a pré-visualização atualizar à esquerda. Arraste o divisor para redimensionar; clique duas vezes para redefinir. No celular, o editor vem primeiro. Em documentos longos, dois botõezinhos no canto da pré-visualização levam ao início ou ao fim — e a digitação continua fluida: a pré-visualização acompanha um instante depois, refazendo só a seção que você mudou.',
            )}
          </Feature>
          <Feature icon={<Save />} title={x('Autosave', 'Salvamento automático')}>
            {x(
              'Your current document is kept in this browser — saved as you type and again the moment you reload, close the tab or switch apps — so a refresh never loses work. If a document is too large for the browser to keep, Marksage tells you to export it. Big files: from 1 MB Marksage notes that editing may be slow; over 5 MB they open read-only and aren’t kept. An asterisk next to the filename means there are changes you haven’t exported.',
              'O documento atual fica guardado neste navegador — salvo enquanto você digita e de novo no instante em que você recarrega, fecha a aba ou troca de app — então recarregar a página nunca perde trabalho. Se um documento for grande demais para o navegador guardar, o Marksage avisa para exportar. Arquivos grandes: a partir de 1 MB o Marksage avisa que editar pode ficar lento; acima de 5 MB eles abrem só para leitura e não são guardados. Um asterisco ao lado do nome indica alterações ainda não exportadas.',
            )}
          </Feature>
          <Feature icon={<History />} title={x('Recent documents', 'Documentos recentes')}>
            {x(
              <>Every document you open, paste or write is kept in Recent (clock icon, or <Keys k={['mod', 'shift', 'h']} />) — switch between them freely, nothing is lost. Up to 15, stored only in this browser.</>,
              <>Todo documento que você abre, cola ou escreve fica em Recentes (ícone de relógio, ou <Keys k={['mod', 'shift', 'h']} />) — alterne entre eles à vontade, nada se perde. Até 15, guardados só neste navegador.</>,
            )}
          </Feature>
          <Feature icon={<Download />} title={x('Name, export & copy', 'Nome, exportar e copiar')}>
            {x(
              <>Click the document’s name in the header to rename it (on a phone: ⋯ → Rename…). Export asks for the file name first — your document’s name, or one taken from its first heading — and that name sticks; <Keys k={['mod', 's']} /> opens it and pressing it again downloads. Or copy the raw Markdown in one click.</>,
              <>Clique no nome do documento no cabeçalho para renomear (no celular: ⋯ → Renomear…). Exportar pede primeiro o nome do arquivo — o nome do documento, ou um tirado do primeiro título — e esse nome fica; <Keys k={['mod', 's']} /> abre e, apertando de novo, baixa. Ou copie o Markdown bruto com um clique.</>,
            )}
          </Feature>
          <Feature icon={<ClipboardPaste />} title={x('GitHub-flavoured Markdown', 'Markdown no estilo GitHub')}>
            {x(
              'Tables, task lists, strikethrough and autolinks render out of the box, and code blocks get syntax colors (about 30 languages) and a copy button.',
              'Tabelas, listas de tarefas, tachado e links automáticos funcionam de cara, e os blocos de código ganham cores de sintaxe (cerca de 30 linguagens) e um botão de copiar.',
            )}
          </Feature>
          <Feature icon={<Moon />} title={x('Light & dark', 'Claro e escuro')}>
            {x('Remembered between visits — as are your language, icon and accent.', 'Lembrado entre visitas — assim como o idioma, o ícone e a cor de destaque.')}
          </Feature>
        </Section>

        <Section title={x('Keyboard shortcuts', 'Atalhos de teclado')}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {SHORTCUTS.map(([k, en, ptBR]) => (
              <div key={k.join('+')} className="contents">
                <dt>
                  <Keys k={k} />
                </dt>
                <dd className="text-ink-muted dark:text-dark-ink-muted">{x(en, ptBR)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title={x('Privacy & storage', 'Privacidade e armazenamento')}>
          <div id="privacy" />
          <Feature icon={<Lock />} title={x('Local-first, always', 'Local em primeiro lugar, sempre')}>
            {x(
              'No accounts and no uploads: the website only delivers the app’s files. Files are read by your browser and Smart Assist runs on your device — nothing you open or write is sent anywhere.',
              'Sem contas e sem uploads: o site só entrega os arquivos do app. Os arquivos são lidos pelo seu navegador e o Smart Assist roda no seu dispositivo — nada do que você abre ou escreve é enviado.',
            )}
          </Feature>
          <Feature icon={<ImageOff />} title={x('Images from the web', 'Imagens da web')}>
            {x(
              'An image in a document that points to another website isn’t loaded unless you turn this on: loading it tells that site your IP address and browser — a downloaded file could use it as a tracking pixel. Turned on, images load without saying where you read them (no referrer).',
              'Uma imagem de um documento que aponta para outro site não é carregada a menos que você ative isto: carregá-la conta àquele site seu endereço IP e navegador — um arquivo baixado poderia usar isso como pixel de rastreamento. Ativado, as imagens carregam sem dizer onde você as lê (sem referrer).',
            )}
            <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-ink dark:text-dark-ink">
              <button
                type="button"
                role="switch"
                aria-checked={remoteImages}
                onClick={() => onRemoteImagesChange(!remoteImages)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${remoteImages ? 'bg-accent dark:bg-dark-accent' : 'bg-line dark:bg-dark-line'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${remoteImages ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </button>
              {x('Load images from the web', 'Carregar imagens da web')}
            </label>
          </Feature>
          <Feature icon={<HardDrive />} title={x('What’s kept in this browser', 'O que fica guardado neste navegador')}>
            {x(
              <>Only on this device, in your browser’s local storage: the open document and up to 15 <span className={strong}>recent documents</span>, and your <span className={strong}>settings</span> (theme, language, icon, key style, editor split, Smart Assist mode, whether the Outline is open, whether images from the web load). If you pick <span className={strong}>Rules + AI</span>, its model files (385 KB for code languages, plus 385 KB for section types once you open the Outline) are kept in the browser cache so they download once. It all stays until you clear it.</>,
              <>Apenas neste dispositivo, no armazenamento local do navegador: o documento aberto e até 15 <span className={strong}>documentos recentes</span>, e suas <span className={strong}>configurações</span> (tema, idioma, ícone, estilo das teclas, divisão do editor, modo do Smart Assist, se a Estrutura está aberta, se imagens da web carregam). Se você escolher o <span className={strong}>Regras + IA</span>, os arquivos dos modelos (385 KB para linguagens de código, mais 385 KB para tipos de seção quando você abre a Estrutura) ficam no cache do navegador para baixar só uma vez. Tudo fica até você apagar.</>,
            )}
          </Feature>
          <Feature icon={<Cookie />} title={x('No cookies, no tracking', 'Sem cookies, sem rastreamento')}>
            {x(
              'No cookies, analytics, ads or third-party services — even the fonts are your system’s. Everything above is stored only because a feature you use needs it, which is why there’s no cookie banner. The server that hosts this site may keep standard technical logs (such as IP address and time) to deliver it.',
              'Sem cookies, análises, anúncios ou serviços de terceiros — até as fontes são as do seu sistema. Tudo acima é guardado só porque um recurso que você usa precisa disso, e por isso não há banner de cookies. O servidor que hospeda este site pode manter registros técnicos padrão (como endereço IP e horário) para entregá-lo.',
            )}
          </Feature>
          <Feature icon={<UserRound />} title={x('Who runs Marksage', 'Quem mantém o Marksage')}>
            {x(
              <>Marksage is made and published by <a href="https://github.com/PabloFLPs" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline dark:text-dark-accent">PabloFLPs</a>. Questions about privacy or your data: open an issue on <a href="https://github.com/PabloFLPs/Marksage/issues" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline dark:text-dark-accent">GitHub</a>. Nothing you write ever reaches us; the button below clears what this browser keeps.</>,
              <>O Marksage é feito e publicado por <a href="https://github.com/PabloFLPs" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline dark:text-dark-accent">PabloFLPs</a>. Dúvidas sobre privacidade ou seus dados: abra uma issue no <a href="https://github.com/PabloFLPs/Marksage/issues" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline dark:text-dark-accent">GitHub</a>. Nada do que você escreve chega até nós; o botão abaixo limpa o que este navegador guarda.</>,
            )}
          </Feature>
          <StorageControls x={x} onRemoveModel={onRemoveModel} onDeleteAllData={onDeleteAllData} />
        </Section>

        <Section title={x('Open source', 'Código aberto')}>
          <Feature icon={<Scale />} title={x('Free software, AGPL-3.0', 'Software livre, AGPL-3.0')}>
            {x(
              <>Marksage — code and models — is free software under the GNU Affero General Public License v3.0: you can read, change and share it, and if you run a changed version for other people, you share your changes too. The source is on <a href="https://github.com/PabloFLPs/Marksage" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline dark:text-dark-accent">GitHub</a>.</>,
              <>O Marksage — código e modelos — é software livre sob a GNU Affero General Public License v3.0: você pode ler, mudar e compartilhar, e se rodar uma versão modificada para outras pessoas, compartilha as suas mudanças também. O código está no <a href="https://github.com/PabloFLPs/Marksage" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline dark:text-dark-accent">GitHub</a>.</>,
            )}
          </Feature>
        </Section>
      </div>
    </main>
    </KeyStyleContext.Provider>
  )
}

type Pick2 = <T>(en: T, ptBR: T) => T

/** Which questions a model answers in each mode — the same table as docs/SMART-ASSIST.md §1.3 and the README. */
function ModeTable({ x }: { x: Pick2 }) {
  const rules = x('rules', 'regras')
  const rows: [string, string, string][] = [
    [x('Code-block language', 'Linguagem do bloco de código'), rules, x('model ✦, or the rules when the model agrees or they’re 99% sure', 'modelo ✦, ou as regras quando o modelo concorda ou elas têm 99% de certeza')],
    [x('Smart paste', 'Colagem inteligente'), rules, x('rules (a pasted code block’s language: as above)', 'regras (linguagem de um bloco de código colado: como acima)')],
    [x('Structure hints', 'Dicas de formatação'), rules, rules],
    [x('Readability', 'Legibilidade'), rules, rules],
    [x('Outline section types', 'Tipos de seção na Estrutura'), x('heading rule', 'regra dos títulos'), x('heading rule, then the section model ✦', 'regra dos títulos, depois o modelo de seções ✦')],
  ]
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-xs leading-5 text-ink-muted dark:text-dark-ink-muted">
        <thead>
          <tr className="border-b border-line dark:border-dark-line">
            <th className="py-1.5 pr-3 font-medium text-ink dark:text-dark-ink">{x('Question', 'Pergunta')}</th>
            <th className="py-1.5 pr-3 font-medium text-ink dark:text-dark-ink">{x('Rules', 'Regras')}</th>
            <th className="py-1.5 font-medium text-ink dark:text-dark-ink">{x('Rules + AI', 'Regras + IA')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([q, h, m]) => (
            <tr key={q} className="border-b border-line last:border-0 dark:border-dark-line">
              <td className="py-1.5 pr-3 text-ink dark:text-dark-ink">{q}</td>
              <td className="py-1.5 pr-3">{h}</td>
              <td className={`py-1.5 ${m === h ? '' : 'text-accent dark:text-dark-accent'}`}>{m}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Remove the downloaded models / delete everything Marksage keeps in this browser. */
function StorageControls({ x, onRemoveModel, onDeleteAllData }: { x: Pick2; onRemoveModel: () => Promise<void>; onDeleteAllData: () => Promise<void> }) {
  const [hasModel, setHasModel] = useState(false)
  const [removed, setRemoved] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  useEffect(() => {
    let alive = true
    hasDownloadedModel().then((v) => alive && setHasModel(v))
    return () => {
      alive = false
    }
  }, [])
  const btn =
    'press inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium text-ink transition-colors hover:border-red-500 hover:text-red-600 dark:border-dark-line dark:text-dark-ink dark:hover:border-red-400 dark:hover:text-red-400'
  return (
    <div className="flex flex-wrap items-center gap-2 pl-7">
      {hasModel && (
        <button
          type="button"
          className={btn}
          onClick={async () => {
            await onRemoveModel()
            setHasModel(false)
            setRemoved(true)
          }}
        >
          <Trash2 className="h-3.5 w-3.5" /> {x('Remove downloaded models', 'Remover os modelos baixados')}
        </button>
      )}
      {removed && (
        <span role="status" className="anim-rise text-xs text-ink-muted dark:text-dark-ink-muted">
          {x('Models removed — Smart Assist is back on Rules.', 'Modelos removidos — o Smart Assist voltou para Regras.')}
        </span>
      )}
      {confirmAll ? (
        <span className="anim-rise inline-flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-muted dark:text-dark-ink-muted">
            {x('Delete the open document, recent documents, settings and the models from this browser?', 'Apagar o documento aberto, os recentes, as configurações e os modelos deste navegador?')}
          </span>
          <button type="button" onClick={onDeleteAllData} className="rounded px-1 font-medium text-red-600 hover:underline dark:text-red-400">
            {x('Delete everything', 'Apagar tudo')}
          </button>
          <button type="button" onClick={() => setConfirmAll(false)} className="rounded px-1 text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
            {x('Cancel', 'Cancelar')}
          </button>
        </span>
      ) : (
        <button type="button" className={btn} onClick={() => setConfirmAll(true)}>
          <Trash2 className="h-3.5 w-3.5" /> {x('Delete all Marksage data', 'Apagar todos os dados do Marksage')}
        </button>
      )}
    </div>
  )
}

function Section({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <section className="mt-12 scroll-mt-6 anim-rise">
      <h2 className="mb-5 flex items-baseline gap-2 border-b border-line pb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted dark:border-dark-line dark:text-dark-ink-muted">
        {title}
        {badge && <span className="font-normal normal-case tracking-normal text-accent dark:text-dark-accent">{badge}</span>}
      </h2>
      {children}
    </section>
  )
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="group mb-5 flex gap-3">
      <span className="mt-0.5 shrink-0 text-accent transition-transform duration-200 group-hover:scale-125 group-hover:-rotate-6 dark:text-dark-accent [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-ink-muted dark:text-dark-ink-muted [&_code]:rounded [&_code]:bg-surface-soft [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] dark:[&_code]:bg-dark-surface-raised">
          {children}
        </p>
      </div>
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface-soft px-1.5 py-0.5 font-mono text-[11px] text-ink dark:border-dark-line dark:bg-dark-surface-raised dark:text-dark-ink">
      {children}
    </kbd>
  )
}

function Keys({ k }: { k: KeyToken[] }) {
  const style = useContext(KeyStyleContext)
  return (
    <span className="inline-flex items-center gap-0.5 align-baseline">
      {k.map((t, i) => (
        <span key={t} className="inline-flex items-center gap-0.5">
          {style === 'windows' && i > 0 && <span className="text-[10px] text-ink-muted dark:text-dark-ink-muted">+</span>}
          <Kbd>{keyLabel(t, style)}</Kbd>
        </span>
      ))}
    </span>
  )
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: [T, string, string][]
}) {
  const index = Math.max(0, options.findIndex(([id]) => id === value))
  return (
    <div role="radiogroup" aria-label={label} className="relative flex w-full rounded-md border border-line p-0.5 sm:inline-flex sm:w-auto dark:border-dark-line">
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded bg-accent/10 transition-transform duration-200 ease-out dark:bg-dark-accent/15"
        style={{ width: `calc(${100 / options.length}% - 2px)`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map(([id, text, hint]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`relative z-10 flex min-w-0 flex-1 flex-col items-center rounded px-3 py-1 text-xs sm:w-36 sm:flex-none ${
            value === id ? 'text-accent dark:text-dark-accent' : 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'
          }`}
        >
          <span className="font-medium">{text}</span>
          <span className="font-mono text-[10px] opacity-70">{hint}</span>
        </button>
      ))}
    </div>
  )
}
