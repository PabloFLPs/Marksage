# Smart Assist — Documentação técnica

O Smart Assist é o "radar de escrita" opcional e local do Marksage. Ele observa o
editor, detecta um pequeno conjunto de situações corrigíveis e **sugere** uma edição que você pode
aceitar (`Tab`) ou dispensar (`Esc`). Nada é enviado pela rede e nada é aplicado automaticamente.

> Esta página é para os curiosos: como o assistente decide, por que ele fica em silêncio e como
> o pequeno modelo próprio do Marksage foi treinado. Alguma familiaridade com programação ajuda, mas você não precisa do código-fonte —
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
                              HeuristicEngine                      ModelEngine
                         (sempre disponível, rápido)   (modelo próprio nas linguagens, heurísticas no resto)
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
| **Mecanismo de decisão** | Responde a pergunta tipada sobre o candidato. Dois mecanismos intercambiáveis: *heurísticas* e *Modelo local* (o modelo próprio do Marksage na linguagem dos blocos de código + heurísticas no resto). |
| **Filtro de confiança** | Descarta qualquer resposta que não esteja claramente à frente das alternativas. |
| **Recursos** | Transformam uma decisão confiante numa edição concreta e reversível (os quatro recursos abaixo). |
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
`q` é um id estável (ex.: `fence.language`): o mecanismo heurístico usa o id para escolher o
pontuador, e o mecanismo do *Modelo local* usa para decidir quais perguntas o seu modelo responde.

### 2.3 O filtro de confiança

Uma sugestão só aparece quando o mecanismo tem certeza:

```ts
passesGate(probs, threshold = 0.8, minMargin = 0.2)
// maior probabilidade ≥ 0,8  E  maior − segunda ≥ 0,2
```

| Recurso | Filtro |
|---|---|
| Linguagem do bloco de código, colagem inteligente | 0,8 / 0,2 |
| Dicas de estrutura (`noul`) | p ≥ 0,8 (implica margem de 0,6 sobre "falso") |
| Legibilidade | 0,5 / 0,15 (é uma dica passiva, não uma edição) |

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
  antigas.
- **Dispensas permanecem** durante a sessão (por hash do conteúdo), para a mesma dica não insistir.
- **Desligado é desligado.** No modo *Desligado*, nenhum handler é ligado ao textarea.

---

## 3. Recursos e suas heurísticas

### Linguagem do bloco de código (`choice`)

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

### Colagem inteligente (`choice`)

**Gatilho.** Um `paste` no editor com ≥ 2 linhas não vazias (≤ 50 mil caracteres) que ainda não
comece como estrutura Markdown (tabelas, blocos, títulos, listas). **A colagem sempre entra
intacta**; a sugestão oferece converter o trecho colado depois.

**Opções.** `prose | table | csv | tsv | list | code | json`.

**Heurística**:

| Tipo | Evidência |
|---|---|
| `json` | é JSON (estrito, ou com comentários / vírgulas sobrando — inclusive linhas de comentário antes do objeto) — também numa única linha minificada |
| `tsv` | uma tabulação em todas as linhas (forte por si só — prosa nunca tem isso), ainda mais quando as contagens batem; tabulações seguidas contam como uma |
| `csv` | quantidade consistente de células por vírgula (respeitando aspas, células entre aspas podem ter quebra de linha; cabeçalho com uma coluna a mais ou a menos não atrapalha), células curtas; penalizado por frases e células "longas" (> 5 palavras) |
| `table` | colunas alinhadas em todas as linhas — saída de terminal / estilo `kubectl`. Linhas de traços `----` são ignoradas; colunas separadas por 1 espaço (alinhadas à direita, como `rails routes`) contam quando toda linha também tem um espaço maior |
| `list` | marcadores (`•`, `–`, `1)`, `a.`…), ≥ 3 linhas curtas sem pontuação final, ou ≥ 3 linhas copiadas de uma lista de página web — um item por linha, sem linhas em branco, sem frase continuando na linha seguinte |
| `code` | reaproveita as pontuações de linguagem dos blocos de código + formato de código (linhas terminando em `{ } ;`, indentação) |
| `prose` | linhas com pontuação de frase e ≥ 8 palavras |

**Ação**: CSV/TSV/alinhado → tabela GFM (primeira linha = cabeçalho, `|` escapado);
lista → `- item` (marcadores existentes normalizados); JSON → ```` ```json ```` (JSON minificado é formatado antes; JSON com comentários vira ```` ```jsonc ````); código → bloco,
com a linguagem detectada apenas se *essa* decisão também passar no filtro. `prose` nunca sugere nada.

### Dicas de estrutura (`noul`)

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

### Legibilidade (`score`)

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

## 4. O modelo próprio do Marksage

### 4.1 O que é

O modo *Modelo local* adiciona um pequeno classificador treinado para uma única tarefa: dizer a
linguagem de um bloco de código sem linguagem (e de um bloco de código colado). O
resto continua com as heurísticas. Não é um chatbot nem um LLM — ele lê um trecho e escolhe uma das
21 respostas, como todo o Smart Assist.

- **Tamanho e velocidade:** 385 KB; uma decisão leva cerca de 0,1 ms em JavaScript puro — sem
  runtime de ML, sem WebGPU, sem worker.
- **Privado:** baixado uma vez do mesmo site do app — só depois de você escolher o modo e confirmar
  um aviso curto — e guardado no cache do navegador (removível a qualquer momento em Sobre →
  Privacidade e armazenamento). Seu texto nunca sai da página.
- **Como ele lê código:** o trecho vira um conjunto de pistas — palavras e símbolos, pares de tokens
  vizinhos, como as linhas começam e terminam, o estilo de indentação e pedaços de três letras das
  palavras mais longas. Cada pista tem um vetor aprendido de 8 números; o modelo tira a média e
  transforma essa média numa probabilidade por linguagem.
- **Cuidadoso de propósito:** a confiança é ajustada com previsões para repositórios que ele nunca viu
  no treino (trechos curtos à parte — é mais fácil confiar demais neles), mirando cerca de 95 % de acerto
  quando ele sugere. O mesmo filtro de confiança das heurísticas (0,8 / 0,2) decide se você vê alguma coisa.
- **Duas opiniões:** quando o modelo não tem certeza mas as heurísticas têm, a sugestão aparece mesmo
  assim — só se o primeiro palpite do próprio modelo concordar.

### 4.2 Como foi treinado

- **Dados:** cerca de 270 mil blocos de código de 309 repositórios públicos (documentação, READMEs,
  guias — incluindo em português), rotulados com a linguagem que os *próprios autores* marcaram,
  mais trechos de código-fonte real para as linguagens mais raras.
- **Divisão justa:** repositórios inteiros vão para treino, ajuste (dev) ou teste final — nunca o
  mesmo projeto em dois lugares — e todo bloco de treino parecido com um bloco de teste é removido.
- **Treino:** cerca de 64 mil blocos, poucos segundos por passada, feito em TypeScript com o mesmo
  código que o app usa para ler os trechos — o que o modelo viu no treino é exatamente o que ele vê aqui.
- **Escolhido no dev, medido uma vez:** tamanho, configurações e como combinar com as heurísticas
  foram decididos no conjunto dev; cada conjunto separado foi rodado uma única vez, no fim. O modelo
  atual é a segunda versão — a primeira aparece nos resultados abaixo.

### 4.3 Resultados

A versão 2 foi medida num conjunto **novo**: 284 blocos de código de 67 repositórios que nenhuma versão
do modelo, nem nenhum ajuste, tinha tocado (até 15 por linguagem):

| Mecanismo | Acurácia | Sugestões exibidas | Certas quando exibidas | Sugestões certas / erradas |
|---|---|---|---|---|
| Heurísticas | 59 % | 70 (25 %) | 93 % | 65 / 5 |
| Modelo v1 | 72 % | 151 (53 %) | 88 % | 133 / 18 |
| **Modelo v2 (atual)** | **74 %** | **158 (56 %)** | **92 %** | **145 / 13** |

No primeiro conjunto (314 blocos, onde a v1 foi medida) a v2 chega a 77 % de acurácia, 164 exibidas e
96 % de acerto quando exibe (v1: 76 %, 141, 94 %; heurísticas: 57 %, 76, 97 %).

Ou seja: mais que o dobro de sugestões úteis das heurísticas, e melhor que a v1 em todos os números —
mas ainda cerca de um ponto menos precisa que as heurísticas em repositórios desconhecidos, por isso
continua sendo um modo opcional. Cerca de metade dos erros são, na verdade, rótulos estranhos
(`dotnet build -c Release` marcado como C#); o resto são linhas únicas que servem para várias
linguagens (`void main() { … }` é Java *e* C++ válidos).

### 4.4 E o Laya?

O **Laya** — um modelo de decisão com pesos abertos (~322–421 M de parâmetros) que responde
nativamente perguntas `choice` / `score` / `noul` — era o plano original para este modo. Para a
linguagem dos blocos de código, um modelo treinado para a tarefa se mostrou a melhor escolha: milhares de vezes menor, instantâneo e
mensurável em dados reais. O Laya continua sendo uma opção para perguntas futuras em que não existam
dados de treino assim. O que rodar, roda no seu dispositivo — um modelo hospedado quebraria a
promessa de que "os arquivos nunca saem da sua máquina".

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
| Linguagem do bloco de código | 314 | 57 % | 76 | 97 % |
| Colagem inteligente | 31 | 94 % | 23 | 100 % |
| Dicas de estrutura | 30 | 93 % | 14 | 86 % |

Leia assim: quando uma sugestão aparece, ela quase sempre está certa; o preço dessa cautela é que
muitos blocos de código reais ficam sem sugestão de linguagem. As decisões heurísticas levam bem menos de um
milissegundo. Com o *Modelo local*, a linguagem dos blocos de código nos mesmos 314 blocos chega a **77 % de
acurácia, 164 exibidas e 96 % de precisão**, e 74 % / 158 / 92 % num segundo conjunto novo (seção 4.3).

---

## 6. Para se aprofundar

Curioso sobre como uma regra específica funciona, ou quer contribuir com uma nova? O código
completo — mecanismo, heurísticas, conjunto de avaliação e notas para quem contribui — está no
[GitHub](https://github.com/PabloFLPs/Marksage).
