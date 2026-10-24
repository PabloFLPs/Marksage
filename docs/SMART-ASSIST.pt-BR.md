# Smart Assist — Documentação técnica

O Smart Assist é o "radar de escrita" opcional e local do Marksage. Ele observa o
editor, detecta um pequeno conjunto de situações corrigíveis e **sugere** uma edição que você pode
aceitar (`Tab`) ou dispensar (`Esc`). Nada é enviado pela rede e nada é aplicado automaticamente.

> Esta página é para os curiosos: como o assistente decide, por que ele fica em silêncio e o que
> é o "Laya". Alguma familiaridade com programação ajuda, mas você não precisa do código-fonte —
> ele está no [GitHub](https://github.com/PabloFLPs/Marksage) se quiser se aprofundar.

---

## 1. Por que "modelos de decisão"

O Smart Assist é construído sobre **modelos de decisão**, e não sobre modelos generativos. Um modelo
de decisão responde a uma *pergunta tipada sobre um conjunto de respostas definido de antemão*:

| Tipo de decisão | Formato da pergunta | Retorna |
|---|---|---|
| `choice` | "Qual destas opções?" | a opção escolhida + uma probabilidade por opção |
| `score` | "Em que ponto desta escala ordenada?" | um índice + uma probabilidade por degrau |
| `noul` | "Esta afirmação é verdadeira?" | uma probabilidade em `[0, 1]` |

Como o espaço de respostas é fechado, a saída nunca vem malformada. A regra que guia tudo:

> **O mecanismo decide; o nosso código TypeScript age.** Se não dá para listar as respostas
> possíveis de antemão, não é um trabalho para o Smart Assist.

Por isso o projeto evita, de propósito, autocompletar generativo, reescrita e "corretor ortográfico
com IA" (ferramentas determinísticas como `nspell`/`remark-lint` são as certas para isso).

---

## 2. Arquitetura

```
textarea ──(debounce 400 ms / colar / 2 s ocioso)──► pre-filter     "há um candidato?"
                                                       │  não → para (nenhuma chamada ao mecanismo)
                                                       ▼
                                                DecisionEngine
                                     ┌─────────────────┴─────────────────┐
                              HeuristicEngine                      LayaEngine
                         (sempre disponível, rápido)        (Web Worker, estruturado)
                                     └─────────────────┬─────────────────┘
                                                       ▼
                                      filtro de confiança (passesGate)
                                                       ▼
                                Suggestion { edit, expected, confidence }
                                                       ▼
                        SuggestionBar  →  Tab: aplica a edição  /  Esc: dispensa
```

### 2.1 Peças

| Peça | O que faz |
|---|---|
| **Pré-filtro** | Verificações baratas e determinísticas que encontram *candidatos* (um bloco de código sem linguagem, uma colagem de várias linhas, um título quase certo). Sem candidato → nada mais roda. |
| **Mecanismo de decisão** | Responde a pergunta tipada sobre o candidato. Dois mecanismos intercambiáveis: *heurísticas* (hoje) e o modelo *Laya* (planejado). |
| **Filtro de confiança** | Descarta qualquer resposta que não esteja claramente à frente das alternativas. |
| **Recursos** | Transformam uma decisão confiante numa edição concreta e reversível (F1–F4 abaixo). |
| **Conversores** | Código comum que faz a edição — monta a tabela, a lista, o bloco de código. O mecanismo nunca escreve texto. |
| **Barra de sugestão** | Mostra uma sugestão por vez; você aceita ou dispensa. |
| **Conjunto de avaliação** | Exemplos rotulados à mão usados para medir cada recurso antes de ele ir ao ar. |

### 2.2 O contrato do mecanismo

```ts
interface DecisionEngine {
  readonly kind: 'heuristic' | 'model'
  ready(): Promise<void>
  choice<T extends string>(state: string, q: string, options: Record<T, string>): Promise<Decision<T>>
  score(state: string, q: string, scale: string[]): Promise<{ value: number; probs: number[] }>
  noul(state: string, statement: string): Promise<number>
}
```

Os dois mecanismos implementam a mesma interface, então os recursos nunca sabem quem respondeu.
`q` é um id estável (ex.: `fence.language`); um mecanismo de modelo recebe o prompt em linguagem
natural correspondente em `PROMPTS`, enquanto o heurístico usa o id para escolher o pontuador.

### 2.3 O filtro de confiança

Uma sugestão só aparece quando o mecanismo tem certeza:

```ts
passesGate(probs, threshold = 0.8, minMargin = 0.2)
// maior probabilidade ≥ 0,8  E  maior − segunda ≥ 0,2
```

| Recurso | Filtro |
|---|---|
| F1 bloco de código, F2 colagem inteligente | 0,8 / 0,2 |
| F3 estrutura (`noul`) | p ≥ 0,8 (implica margem de 0,6 sobre "falso") |
| F4 legibilidade | 0,5 / 0,15 (é uma dica passiva, não uma edição) |

O silêncio é o padrão: uma sugestão perdida não custa nada; uma errada custa confiança.

### 2.4 Garantias de segurança

- **Só sugere.** Toda `Suggestion` carrega uma `edit` (`from`, `to`, `insert`) e uma string
  `expected`. Ao aceitar, o hook confere se `text.slice(from, to) === expected`; se você digitou
  algo depois, a sugestão velha é descartada.
- **Desfazer funciona.** As edições usam `document.execCommand('insertText')`, então entram na
  pilha nativa de desfazer (`⌘/Ctrl Z`); um `onChange` controlado é o plano B.
- **Nunca a cada tecla.** A análise tem debounce (400 ms), a legibilidade espera 2 s ociosos e o
  pré-filtro precisa achar um candidato antes de qualquer chamada ao mecanismo.
- **Cancelamento.** Cada execução tem seu `AbortController`; novas digitações abortam execuções
  antigas (e chamam `LayaEngine.cancelAll()` para pedidos em andamento no worker).
- **Dispensas permanecem** durante a sessão (por hash do conteúdo), para a mesma dica não insistir.
- **Desligado é desligado.** No modo *Desligado*, nenhum handler é ligado ao textarea.

---

## 3. Recursos e suas heurísticas

### F1 — Linguagem do bloco de código (`choice`)

**Gatilho.** Um bloco *fechado* (```` ``` ```` ou `~~~`) sem linguagem, com corpo ≥ 3 caracteres,
e o cursor **fora** do bloco (você terminou de escrever). O bloco mais próximo é avaliado primeiro
(no máximo 3 por execução).

**Opções.** 20 linguagens + `plaintext`: ts, js, python, bash, json, html, css, sql, go, rust,
java, c, cpp, csharp, ruby, php, yaml, markdown, diff, dockerfile.

**Heurística**. Cada linguagem tem regras regex com pesos que funcionam
como logits — cada regra que casa soma seu peso uma vez:

- Evidências *distintivas* têm peso alto (`package main` → Go +4, `<?php` → PHP +6,
  `if err != nil` → Go +4, `#!/bin/bash` → Bash +5, `@@ -1,2 +1,2 @@` → diff +5).
- Sintaxe *compartilhada* (chaves, `=>`, `import … from`) tem peso pequeno em várias linguagens.
- Regras *negativas* subtraem evidências contraditórias (ex.: anotações de tipo TS penalizam JS).
- *Ajustes estruturais:* conteúdo que é JSON → json +6 — inclusive o dialeto "JSON com
  comentários / vírgulas sobrando" usado em arquivos de configuração (+5); TS vs JS é decidido por evidência exclusiva
  de TS (anotações de tipo, `interface`, `import type`, `as const`), já que TS é superconjunto de JS.
- `plaintext` é pontuado por uma **razão de "cara de código"** (densidade de símbolos vs. palavras,
  menos pontuação de frase), então prosa em qualquer idioma (inclusive pt-BR) fica sem tag.

As pontuações passam por `softmax` → probabilidades → filtro. **Ação:** inserir o id da linguagem
logo após o marcador de abertura.

### F2 — Colagem inteligente (`choice`)

**Gatilho.** Um `paste` no editor com ≥ 2 linhas não vazias (≤ 50 mil caracteres) que ainda não
comece como estrutura Markdown (tabelas, blocos, títulos, listas). **A colagem sempre entra
intacta**; a sugestão oferece converter o trecho colado depois.

**Opções.** `prose | table | csv | tsv | list | code | json`.

**Heurística**:

| Tipo | Evidência |
|---|---|
| `json` | é JSON (estrito, ou com comentários / vírgulas sobrando) — mesmo numa única linha minificada |
| `tsv` | mesma quantidade de tabulações em todas as linhas (+7) |
| `csv` | quantidade consistente de células por vírgula (respeitando aspas), células curtas; penalizado por frases e células "longas" (> 5 palavras) |
| `table` | colunas separadas por 2+ espaços em todas as linhas — saída de terminal / estilo `kubectl` |
| `list` | marcadores (`•`, `–`, `1)`, `a.`…) ou ≥ 3 linhas curtas sem pontuação final |
| `code` | reaproveita as pontuações do F1 + formato de código (linhas terminando em `{ } ;`, indentação) |
| `prose` | linhas com pontuação de frase e ≥ 8 palavras |

**Ação**: CSV/TSV/alinhado → tabela GFM (primeira linha = cabeçalho, `|` escapado);
lista → `- item` (marcadores existentes normalizados); JSON → ```` ```json ```` (JSON minificado é formatado antes); código → bloco,
com a linguagem do F1 apenas se *essa* decisão também passar no filtro. `prose` nunca sugere nada.

### F3 — Intenção de estrutura (`noul`)

**Gatilho.** Markdown "quase certo" numa linha que **não** é a que está sendo digitada, fora de código —
blocos cercados, blocos de código indentados e HTML bruto (`<pre>`, `<style>`, …) são ignorados:

| Candidato | Correção |
|---|---|
| `**Título**` sozinho numa linha após uma linha em branco | `## Título` |
| `#Título` (sem espaço) — mas não `#tag` de uma palavra nem cores `#fff` | `# Título` |
| `== Título ==` (estilo wiki) | título, nível pela quantidade de `=` |
| `-item`, `*item`, `+item` | `- item` |
| `1)item`, `1.item` | `1) item` |

**Heurística**. O mecanismo recebe ±2 linhas de contexto e uma
afirmação como *"A linha "**Instalação**" deveria ser um título de seção."*. A probabilidade parte
de um valor inicial por tipo e é ajustada pelas evidências:

- **Linhas em negrito** longas, que terminam como frase (`.` `!` `?`, também `。` `！` `？` e outras
  escritas), terminam com dois-pontos (`**Retorno:**`), começam com uma palavra de aviso (`Nota`,
  `Atenção`, `Dica`, `Note`, `Warning`, `P`/`R`, …) ou são só um link são rótulos ou ênfase, não títulos.
- **Linhas com traço** que parecem flags de linha de comando (`-s, --search`), conjuntos de flags
  (`+SIMD +AVX`), CSS (`-webkit-line-clamp: 2;`) ou números negativos (`-5 graus`) não são itens de
  lista; `*palavra*` é ênfase.
- **Correções de lista** precisam de companhia: itens de lista vizinhos aumentam a confiança; uma
  linha `*solta` costuma ser nota de rodapé, não marcador, então fica em silêncio.

### F4 — Legibilidade (`score`)

**Gatilho.** 2 s ocioso; uma decisão por seção `##` com ≥ 30 palavras.

**Heurística**. **LIX**, escolhido por ser independente de idioma
(funciona em português e inglês, ao contrário das variantes de Flesch ajustadas às sílabas do inglês):

```
LIX = palavras / frases + 100 × palavrasLongas / palavras      (longa = mais de 6 letras)
```

O Markdown é removido antes (código, links, tabelas; itens de lista e títulos contam como frases).
O valor é mapeado numa escala de 5 degraus — *muito fácil · fácil · moderada · difícil · muito
difícil* (centros 25/35/45/55/65) — com uma nitidez que cresce com o tamanho da seção, então seções
curtas geram distribuições planas e ficam em silêncio.

**Ação.** Um pontinho colorido ao lado do título da seção na pré-visualização, com dica ao passar
o mouse. As marcas só são redesenhadas quando uma pontuação muda de fato.

---

## 4. Laya

### 4.1 O que é

O **Laya** é um modelo de decisão com pesos abertos (Apache-2.0; variantes multilíngue de ~322 M e
de ~421 M de parâmetros, com exportações ONNX) que responde nativamente perguntas `choice` / `score`
/ `noul` — exatamente o contrato acima. Seu equivalente de código fechado, o **Jev**, é uma API
hospedada e *não* é usado: chamar um modelo hospedado quebraria a promessa de que "os arquivos
nunca saem da sua máquina".

O Laya deve ser uma **melhoria sobre as heurísticas, não uma dependência**: o app precisa ser
totalmente útil sem ele, e ele só substitui as heurísticas num recurso em que a avaliação mostrar
um ganho relevante.

### 4.2 Como ele se encaixa

```
editor ──► LayaEngine (thread principal) ──postMessage──► Laya worker (Web Worker)
                     │  pedidos com id                             │  carrega → WebGPU, senão WASM
                     │  cancelAll() a cada nova digitação          │  choice / score / noul
                     ◄──────────── { id, ok, result } / progresso ─┘
```

- **Inferência só no worker** — a thread da interface nunca roda o modelo.
- **Protocolo:** `{ id, op: 'load' | 'choice' | 'score' | 'noul' | 'cancel', payload }` →
  `{ id, ok, result | error }`, mais `{ op: 'progress', loaded, total }` durante o download.
- **Prompts:** o worker recebe `PROMPTS[q]` (linguagem natural) mais o mapa de opções / escala /
  afirmação, então o mesmo código de recurso funciona com os dois mecanismos.
- **Ciclo de vida:** escolher *Modelo local* inicia o worker; as heurísticas respondem enquanto ele
  carrega; se `ready()` falhar, o hook reporta `fallback` (ponto âmbar no botão Assist) e segue com
  as heurísticas.
- **Política de download (planejada):** preguiçosa, opcional, com tamanho e progresso visíveis;
  cache do navegador para funcionar offline após o primeiro carregamento.

### 4.3 Situação atual

| Peça | Estado |
|---|---|
| Contrato `DecisionEngine`, prompts, filtro | ✅ pronto |
| Cliente do worker com cancelamento e progresso | ✅ pronto |
| Protocolo do worker | ✅ pronto |
| Runtime do modelo em `loadModel()` / `infer()` | ⏳ a fazer |
| Opção "Modelo local" na interface | desativada ("em breve") até o runtime existir |

**O que falta:** plugar um runtime ONNX (transformers.js ou onnxruntime-web, preferindo WebGPU e
caindo para WASM) no worker. A opção "Modelo local" fica desativada até o modelo superar as
heurísticas no conjunto de avaliação.

### 4.4 Antes de ativar (questões em aberto)

1. Qual exportação ONNX usar e a API de runtime em JS (transformers.js vs onnxruntime-web puro).
2. Tamanho real do download e quantização — os tamanhos relatados não batem com a contagem de
   parâmetros, então meça antes de escolher uma variante (prefira a multilíngue de 322 M se a
   qualidade se mantiver).
3. Latência em dispositivos só com WASM (sem WebGPU).
4. **Calibração.** O Laya tem um modo de falha documentado de errar *com confiança* em entradas
   desconhecidas; o filtro assume que "0,9" significa ~90 % de acerto. Verifique com a avaliação
   (inclua trechos em pt-BR e em idiomas misturados) antes de confiar nas probabilidades.

---

## 5. Como é medido

Cada recurso é verificado contra um conjunto de exemplos rotulados à mão — trechos de código em
várias linguagens, colagens reais (CSV, células de planilha, saída de terminal, JSON), linhas
quase certas — incluindo prosa em português e texto em idiomas misturados. Para cada recurso
acompanhamos:

- **Acurácia** — com que frequência a primeira resposta está certa;
- **Exibidas** — quantas sugestões passam pelo filtro de confiança;
- **Precisão quando exibida** — com que frequência uma sugestão que você *vê* está certa (o número que mais importa);
- **Calibração** — se "90 % de confiança" significa mesmo ~90 % de acerto;
- **Latência** por decisão.

Há dois tipos de exemplo. O conjunto **escrito** foi feito junto com as regras — pega regressões,
mas fica perto de 100 % por construção. O conjunto **do mundo real** vem de documentação real,
wikis do GitHub, traduções da comunidade, arquivos de dados e saída de terminal (português
incluído), e as regras nunca são ajustadas contra ele — então é o número honesto:

| Recurso | Exemplos reais | Acurácia | Exibidas | Precisão quando exibida |
|---|---|---|---|---|
| F1 linguagem do bloco | 314 | 57 % | 75 | 97 % |
| F2 colagem inteligente | 31 | 81 % | 17 | 100 % |
| F3 dicas de estrutura | 30 | 93 % | 14 | 86 % |

Leia assim: quando uma sugestão aparece, ela quase sempre está certa; o preço dessa cautela é que
muitos blocos de código reais ficam sem sugestão (F1). As decisões heurísticas levam bem menos de um
milissegundo. O Laya vai ter que superar esses números no mesmo conjunto real antes de ser ativado.

---

## 6. Para se aprofundar

Curioso sobre como uma regra específica funciona, ou quer contribuir com uma nova? O código
completo — mecanismo, heurísticas, conjunto de avaliação e notas para quem contribui — está no
[GitHub](https://github.com/PabloFLPs/Marksage).
