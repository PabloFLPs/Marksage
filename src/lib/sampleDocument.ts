/**
 * The sample document — "Try it on a sample document" on the start screen and on About.
 *
 * A small, made-up README with slips left in on purpose, so every Smart Assist feature shows up in a minute:
 * code blocks without a language (one TypeScript-or-JavaScript case for Rules + AI's two-option offer), structure
 * near-misses of several kinds, a CSV to paste back in (smart paste), one long winding section and one plain one
 * (readability dots), headings that name their type and one that doesn't (Outline; the section model reads it in
 * Rules + AI), and a vague link + untagged code for the Document tab's "worth a look". The checklist on top is the
 * tour. Keep EN and PT-BR in step (same lines): `npm run check:docs` lists every slip, line by line, with the
 * feature it shows, and fails if one stops working or anything else appears — also after accepting everything.
 * In Portuguese, a list slip can't start with an article (`-a volta…`, `-o …`): it reads as a command-line flag,
 * and the structure rule rightly skips it. The readability dots must match too (a section under 30 words gets none).
 */
export const SAMPLE_DOCUMENT = `# Pitwall

> **Smart Assist tour.** This README has a few slips left in on purpose. Move the cursor around: suggestions show up at the bottom of the editor. **Tab** accepts, **Esc** dismisses, **Ctrl/⌘ Z** undoes. Nothing changes unless you accept it.
>
> - [ ] Give the code blocks a language (Installation, Usage, Configuration)
> - [ ] Fix the formatting slips (Usage, Configuration, FAQ, the last line)
> - [ ] Paste the lap times in Examples back in and take the table
> - [ ] Open the **Outline**: what each section is, then the **Document** and **Suggestions** tabs
> - [ ] Switch the **Assist** menu to **Rules + AI**: Marksage's own small models join in (✦)

Pitwall turns lap-time spreadsheets into race summaries: fastest laps, stints and the gap to the leader. One small command-line tool, no account, no server.

## Installation

You need Node.js 20 or newer. Install it, then summarise a whole folder of races:

\`\`\`
npm install --global pitwall
for f in races/*.csv; do pitwall "$f" --laps 53; done
\`\`\`

## Usage

Point it at the CSV your timing app exports:

\`\`\`
import { summarize } from 'pitwall'

const race = await summarize('monza.csv', { laps: 53 })
console.log(race.fastestLap)
\`\`\`

It gives you:

-the fastest lap of each driver
-every stint, from pit stop to pit stop
-the gap to the leader, lap by lap

## Configuration

**Options**

- \`laps\`: total race laps
- \`units\`: \`s\` or \`ms\`
• \`leader\`: whose gaps to show (pasted from a doc)

Keep them next to your CSV, in \`pitwall.json\`:

\`\`\`
{
  "laps": 53,
  "units": "ms",
  "leader": "Ana"
}
\`\`\`

## Examples

Copy the four lines below, then paste them on the empty line under them: Smart Assist offers a Markdown table.

driver,lap,time
Ana,12,1:21.402
Bruno,12,1:21.877
Carla,13,1:21.095


## Keeping your data private

Pitwall reads files only from the folder you point it at and never uploads them anywhere. If you find a vulnerability, please report it privately by email instead of opening a public issue.

## How it works

Under the hood, every lap row is parsed, normalised to milliseconds and grouped into stints by detecting the pit-lane laps whose sector times exceed the driver's rolling median by a configurable margin, after which the gap to the leader is recomputed cumulatively at each timing line, which is why a single malformed row early in the file can quietly shift every gap that follows it unless you [click here](#faq) first. Laps run under a safety car are kept but marked, because removing them would make the remaining stints look shorter than they really were.

## FAQ

### Why is a lap missing?

Pitwall skips rows it can't read, and it tells you how many at the end. Most of the time it is an empty time cell or a lap number written as text. To find and fix them:

1)Run it again with \`--verbose\` to list each skipped row and why.
2)Fix those rows in your spreadsheet and export the CSV again.

See [the CSV format] (#examples) for the columns it expects.

##License

MIT: use it, change it, share it.
`

export const SAMPLE_DOCUMENT_PT_BR = `# Pitwall

> **Tour do Smart Assist.** Este README tem alguns erros deixados de propósito. Mova o cursor pelo texto: as sugestões aparecem na parte de baixo do editor. **Tab** aceita, **Esc** ignora e **Ctrl/⌘ Z** desfaz. Nada muda sem você aceitar.
>
> - [ ] Dê uma linguagem aos blocos de código (Instalação, Uso, Configuração)
> - [ ] Corrija os erros de formatação (Uso, Configuração, Perguntas frequentes, a última linha)
> - [ ] Em Exemplos, copie os tempos, cole de novo e aceite a tabela
> - [ ] Abra a **Estrutura**: o que é cada seção; depois, as abas **Documento** e **Sugestões**
> - [ ] Mude o menu **Assist** para **Regras + IA**: os pequenos modelos de IA do próprio Marksage entram em ação (✦)

O Pitwall transforma planilhas de tempos de volta em resumos de corrida: voltas mais rápidas, stints e a diferença para o líder. É uma pequena ferramenta de linha de comando, sem conta e sem servidor.

## Instalação

Você precisa do Node.js 20 ou mais recente. Instale e resuma uma pasta inteira de corridas:

\`\`\`
npm install --global pitwall
for f in races/*.csv; do pitwall "$f" --laps 53; done
\`\`\`

## Uso

Aponte para o CSV que o seu app de cronometragem exporta:

\`\`\`
import { summarize } from 'pitwall'

const race = await summarize('monza.csv', { laps: 53 })
console.log(race.fastestLap)
\`\`\`

Você recebe:

-volta mais rápida de cada piloto
-cada stint, de um pit stop a outro
-diferença para o líder, volta a volta

## Configuração

**Opções**

- \`laps\`: total de voltas
- \`units\`: \`s\` ou \`ms\`
• \`leader\`: de quem mostrar as diferenças (colado de outro documento)

Salve-as junto do CSV, em \`pitwall.json\`:

\`\`\`
{
  "laps": 53,
  "units": "ms",
  "leader": "Ana"
}
\`\`\`

## Exemplos

Copie as quatro linhas abaixo e cole na linha vazia logo depois delas: o Smart Assist oferece uma tabela Markdown.

piloto,volta,tempo
Ana,12,1:21.402
Bruno,12,1:21.877
Carla,13,1:21.095


## Privacidade dos seus dados

O Pitwall só lê arquivos da pasta que você indicar e nunca envia nada para lugar nenhum. Se encontrar uma vulnerabilidade, avise em particular, por e-mail, em vez de abrir uma issue pública.

## Como funciona

Por baixo dos panos, cada linha de volta é lida, convertida para milissegundos e agrupada em stints, detectando as voltas de pit lane cujos tempos de setor passam da mediana móvel do piloto por uma margem configurável; depois, a diferença para o líder é recalculada de forma acumulada a cada linha de cronometragem, e é por isso que uma única linha com erro no começo do arquivo pode deslocar, sem aviso, todas as diferenças seguintes, a menos que você [clique aqui](#perguntas-frequentes) antes. As voltas com safety car na pista são mantidas, mas marcadas, porque tirá-las faria os stints restantes parecerem mais curtos do que realmente foram.

## Perguntas frequentes

### Por que falta uma volta?

O Pitwall pula as linhas que não consegue ler e, no final, diz quantas foram. Na maioria das vezes é uma célula de tempo vazia ou um número de volta escrito como texto. Para achar e corrigir essas linhas:

1)Rode de novo com \`--verbose\` para listar cada linha pulada e o motivo.
2)Corrija essas linhas na planilha e exporte o CSV de novo.

Veja [o formato do CSV] (#exemplos) para saber quais colunas ele espera.

##Licença

MIT: use, modifique e compartilhe.
`

export function getSampleDocument(lang: string): string {
  return lang === 'pt-BR' ? SAMPLE_DOCUMENT_PT_BR : SAMPLE_DOCUMENT
}

/** The sample's file name, shown in the header and in Recent instead of "Untitled". */
export function getSampleFilename(): string {
  return 'pitwall-README.md'
}
