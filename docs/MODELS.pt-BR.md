# Como os dois modelos funcionam

O Marksage traz dois modelos minúsculos próprios. Um identifica a **linguagem de um bloco de código** (21
respostas, de TypeScript a "não é código"); o outro identifica o **tipo de uma seção** do documento para a
Estrutura (13 tipos, mais "outro"). Os dois compartilham o mesmo desenho, o mesmo formato de arquivo e a mesma
receita de treino. Mais dois foram treinados do mesmo jeito — para as dicas de formatação e os tipos de colagem — e
não são usados, porque não se saíram melhor que as regras em textos reais (seção 8).

> Esta página não pressupõe nenhum conhecimento de aprendizado de máquina. Cada termo é explicado na primeira
> vez que aparece, e há um glossário no fim. Os números dos exemplos são reais: vêm dos arquivos de modelo que
> o app baixa. Para *para que* servem os modelos e como são medidos, veja
> [Como o Smart Assist funciona](SMART-ASSIST.pt-BR.md). Quer as especificações, ou rodar os modelos você
> mesmo? A seção 7 tem uma ficha técnica de cada um.

---

## 1. O que é um classificador

Os dois modelos são **classificadores**: leem um trecho de texto e escolhem uma resposta de uma lista fixa,
dizendo o quanto têm certeza de cada uma. Eles não escrevem texto, não conversam e não "entendem" nada. Pense
num especialista muito rápido e muito específico, que viu dezenas de milhares de exemplos e aprendeu quais
detalhes pequenos combinam com qual resposta.

```text
"def greet(name): …"  →  python 83% · yaml 7% · markdown 4% · ruby 3% · …
```

Eles aprendem por **aprendizado supervisionado**: você mostra muitos exemplos cuja resposta já é conhecida (um
exemplo *rotulado*) e deixa o modelo se ajustar até os palpites baterem com os rótulos. Ninguém escreve as
regras — "uma linha terminando em `:` depois de `def` é Python" é algo que o modelo descobre sozinho a partir
dos dados.

Por que não escrever regras? O Marksage escreve, e as regras (as *heurísticas*) são precisas — mas ficam em
silêncio em cerca de três blocos a cada quatro, porque escrever uma regra para cada padrão de 20 linguagens não
tem fim. Por que não um grande modelo de linguagem? Teria centenas de megabytes, seria lento num notebook, e um
hospedado significaria mandar seu texto para fora. Um classificador feito para a tarefa tem cerca de **385 KB**,
decide em cerca de **0,1 ms** e nunca sai da página.

## 2. Uma decisão, passo a passo

Isto é tudo o que o modelo de linguagens faz com um trecho de duas linhas:

```python
def greet(name):
    return f"Hello, {name}!"
```

<!-- diagram: inference -->
![De um trecho a uma resposta: pistas, hash, 8 números por pista, média, pontuações, softmax, filtro](models-inference.pt-BR.svg)

<details>
<summary>O mesmo diagrama em Mermaid</summary>

```mermaid
flowchart TB
  A["1 · Trecho<br/>def greet(name): return f#quot;Hello…#quot;"] --> B["2 · Pistas (features)<br/>55 pistas: T:def · F:return · G:gre · E::"]
  B --> C["3 · Hash de cada pista para um slot<br/>T:def → slot 23.610 de 32.768"]
  C --> D["4 · Busca 8 números por slot<br/>55 pistas × 8 números aprendidos"]
  D --> E["5 · Tira a média<br/>[0,11; −0,23; 0,32; 0,02; …]"]
  E --> F["6 · Pontua cada resposta<br/>python 16,7 · yaml 10,5 · markdown 8,6 …"]
  F --> G["7 · Softmax, temperatura 2,55<br/>python 83% · yaml 7% · markdown 4% …"]
  G --> H["8 · Filtro de confiança<br/>83% ≥ 80% e 75 pontos à frente → python"]
  classDef gate stroke-width:2px
  class H gate
```

</details>

As próximas seções percorrem esses passos um a um.

### 2.1 O texto vira pistas (features)

Um modelo só faz contas, então o texto primeiro precisa virar algo contável. O Marksage quebra um trecho em
**pistas** pequenas — em termos de aprendizado de máquina, **features**. Para código, há sete tipos:

| Tipo | O que captura | No exemplo |
|---|---|---|
| `T:` token | cada palavra e símbolo | `T:def`, `T:return`, `T:(` |
| `B:` par | dois tokens vizinhos na linha | `B:def greet`, `B:) :` |
| `F:` primeiro token | como a linha começa | `F:def`, `F:return` |
| `P:` primeiro par | os dois primeiros tokens da linha | `P:return f` |
| `E:` último caractere | como a linha termina | `E::`, `E:"` |
| `I:` indentação | tabs, 2, 4 ou 8+ espaços | `I:4` |
| `G:` trigrama | pedaços de três letras de palavras longas | `G:gre`, `G:ree`, `G:eet` |

Nosso trecho gera **55 pistas**. Uma pista conta uma vez só, não importa quantas vezes apareça, para que um
bloco longo não abafe um curto. Os trigramas ajudam com nomes que o modelo nunca viu: `greet` é novo, mas `gre`
e `eet` aparecem em muitas palavras.

O modelo de seções lê texto corrido em vez de código, então as pistas dele são outras. Ele usa palavras e pares
de palavras (em minúsculas e sem acentos, então *instalação* e *instalacao* são a mesma pista), a primeira
palavra de cada linha, as palavras dentro de blocos de código e a linguagem de cada bloco. Também lê o *formato*
da seção: tem tabela, lista, prompt de terminal, número de versão, data, referência a issue? Seções "Antes de começar", por
exemplo, são cheias de `W:need`, `W:install` e `C:node`.

### 2.2 As pistas viram números de slot (o truque do hash)

Os dados de treino têm cerca de **840 mil pistas diferentes** para código. Guardar um dicionário com todas
deixaria o modelo enorme, e uma pista nunca vista não teria entrada nenhuma.

Em vez disso, cada pista passa por uma **função de hash** — uma conta rápida que transforma qualquer texto num
número grande, sempre o mesmo número para o mesmo texto. O Marksage usa o FNV-1a e fica com o resto da divisão
por 32.768:

```text
"T:def"  →  hash 774.298.682  →  774.298.682 mod 32.768  =  slot 23.610
```

Assim, cada pista cai num de **32.768 slots**. Isso quer dizer que umas 26 pistas diferentes dividem cada slot —
uma *colisão*. Parece ruim, mas funciona: a maioria das pistas é rara, as úteis (`T:def`, `E:;`, `F:$`)
aparecem milhares de vezes e dominam seu slot, e o treino aprende a contornar o ruído. Em troca, o modelo tem
tamanho fixo, não precisa de arquivo de dicionário, e palavras novas ainda caem em algum lugar.

### 2.3 Cada slot guarda 8 números (um embedding)

Cada slot tem uma listinha de **8 números**, chamada de **embedding** ou vetor. Este é o slot de `T:def` como
está guardado no arquivo:

```text
T:def → [−2,21; −2,61; 0,92; 1,87; −3,01; 3,90; −1,66; 0,52]
```

Os números não significam nada um a um — ninguém os escolheu. Começaram aleatórios, e o treino foi mexendo
neles até pistas que apontam para a mesma resposta terminarem com listas parecidas. Dá para imaginar cada lista
como um ponto num espaço de 8 dimensões: pistas com cara de Python ficam numa região, pistas com cara de SQL em
outra.

### 2.4 A média das pistas

As 55 listas do trecho viram **uma média**, uma lista de 8 números:

```text
[0,114; −0,234; 0,322; 0,023; −0,301; 0,209; −0,068; 0,058]
```

Isso é todo o "entendimento" que o modelo tem do trecho. A média ignora a ordem das pistas (os pares e as
pistas de primeiro token guardam um pouco da ordem local), o que mantém o modelo minúsculo e rápido. Esse
desenho vem do **fastText**, uma abordagem conhecida de classificação rápida de texto.

### 2.5 Uma pontuação por resposta (a camada linear)

Para cada uma das 21 respostas, o modelo tem 8 **pesos** e um **viés**. A pontuação de uma resposta é o viés
mais cada um dos 8 números da média vezes o seu peso:

```text
pontuação(python) = viés + p₁·0,114 + p₂·(−0,234) + … + p₈·0,058
```

Essas pontuações brutas se chamam **logits**. Para o nosso trecho:

| Resposta | Pontuação |
|---|---|
| python | 16,66 |
| yaml | 10,51 |
| markdown | 8,64 |
| ruby | 8,17 |
| bash | 6,89 |
| … | … |
| c | −13,89 |

Essa é a rede inteira: 32.768 × 8 números nos slots mais 8 × 21 pesos e 21 vieses — **262.333 números** ao
todo. (Para comparar, o pequeno "modelo de decisão" aberto considerado no início tinha de 322 a 421 milhões.)

### 2.6 Pontuações viram probabilidades (softmax e temperatura)

Pontuações ainda não são porcentagens. O **softmax** as transforma em probabilidades que somam 100%: eleva *e*
(≈ 2,718) a cada pontuação e divide cada resultado pelo total. Diferenças grandes entre pontuações viram
probabilidades bem desequilibradas:

```text
softmax com temperatura 1:     python 99,7% · yaml 0,2% · …
```

99,7% parece ótimo, mas modelos treinados assim são **confiantes demais**: quando dizem 99%, acertam bem menos
que 99% das vezes. Então as pontuações são divididas antes por uma **temperatura**. Uma temperatura acima de 1
aproxima as probabilidades:

```text
softmax com temperatura 2,55:  python 82,7% · yaml 7,4% · markdown 3,6% · ruby 3,0% · …
```

A temperatura não é chutada. Ela é **calibrada**: escolhida para que "80% de certeza" signifique acertar umas 8
vezes em 10 (a seção 4.3 explica como). O modelo de código tem duas temperaturas — 1,85 para trechos maiores e
2,55 para os curtos (3 linhas ou menos), porque trechos curtos enganam mais fácil. O modelo de seções usa 1,6.

### 2.7 O filtro de confiança

Por fim, a mesma regra de toda sugestão do Smart Assist: só mostra se a primeira resposta tiver pelo menos
**80%** e estiver pelo menos **20 pontos** à frente da segunda. Python com 82,7% contra YAML com 7,4% passa, então
o editor oferece "Adicionar a linguagem `python`". A resposta "não é código" nunca é sugerida, e quando o modelo
não tem certeza, três regras extras ainda podem ajudar:

- **Concordância:** se as heurísticas estão confiantes *e* a resposta delas é o primeiro palpite do próprio
  modelo, a sugestão aparece. Dois métodos independentes concordando somam sugestões sem somar erros.
- **Regras quase certas (2026-10-30):** se as heurísticas têm pelo menos 99% de certeza, a resposta delas vale
  mesmo quando o modelo discorda. Em trechos curtos, a média do modelo pode afogar poucas pistas decisivas: em
  `const x: number = 1;` + `function add(a: number, b: number): number { … }`, o par `: number` é o que mais puxa
  para TypeScript (+192), seguido de `) :` e `number`, mas são 5 de 70 pistas; as outras 65 são comuns ao
  JavaScript e puxam para ele (`+`, `function`, `;`, nomes curtos), e o modelo já começa 1,95 ponto a favor do
  JavaScript (muito código sem tipos vem marcado como `ts`). Resultado: js 63% — enquanto as regras diziam ts
  99%. Nos conjuntos de teste, essa regra somou uma sugestão certa (dev) e nenhuma errada.
- **Duas opções:** se as duas primeiras respostas juntas têm pelo menos 85% (e a segunda pelo menos 20%), você
  recebe as duas — JavaScript ou TypeScript, C ou C++.

Na Estrutura o filtro é o mesmo, mas como um selo de tipo não muda nada no documento, uma resposta do modelo de
seções entre 60% e 80% ainda aparece, marcada como "provável". A Estrutura também tem três tipos que só vêm
dos títulos: **Explicação** ("Como funciona", "Arquitetura"), que o modelo não conseguiu aprender, e **Glossário** e
**Roadmap**, raros demais nos repositórios de treino para aprender (veja a ficha dele).

## 3. Como os modelos aprenderam

<!-- diagram: training -->
![Como os modelos aprenderam: repositórios públicos, exemplos rotulados, divisão por repositório, laço de treino, calibração, compressão, medição única](models-training.pt-BR.svg)

<details>
<summary>O mesmo diagrama em Mermaid</summary>

```mermaid
flowchart TB
  A["1 · Repositórios públicos<br/>309 repositórios: docs, READMEs, guias"] --> B["2 · Exemplos rotulados<br/>código: as tags dos autores · seções: títulos"]
  B --> C["3 · Divisão por repositório<br/>treino · ajuste (escolhas) · teste (uma vez)"]
  C --> D["4 · Laço de treino<br/>chuta → mede o erro → ajusta os números"]
  D -- "× várias passadas" --> D
  D --> E["5 · Calibra<br/>temperatura em repositórios nunca vistos"]
  E --> F["6 · Encolhe<br/>8 bits + uma escala por linha → 385 KB"]
  F --> G["7 · Mede uma vez<br/>repositórios de fora → os números publicados"]
  classDef loop stroke-width:2px
  class D loop
```

</details>

### 3.1 Exemplos com resposta conhecida

**Modelo de código.** Documentação é cheia de blocos de código cujos autores já escreveram a linguagem:
` ```python `. Essas tags são rótulos de graça. O Marksage coletou cerca de 270 mil blocos de 309 repositórios
públicos (docs, READMEs e guias, inclusive em português), mais janelas de arquivos de código reais para as
linguagens mais raras. O treino usou 63.751 deles, no máximo 6.000 por linguagem, para as comuns não dominarem:

| Linguagem | Blocos | Linguagem | Blocos | Linguagem | Blocos |
|---|---|---|---|---|---|
| Python | 6.000 | PHP | 2.843 | CSS | 1.365 |
| Bash | 6.000 | Go | 2.749 | Ruby | 1.132 |
| JavaScript | 6.000 | Rust | 2.582 | Diff | 1.083 |
| TypeScript | 6.000 | Java | 2.238 | Markdown | 944 |
| YAML | 4.525 | C | 2.172 | Dockerfile | 566 |
| SQL | 4.428 | C# | 2.070 | | |
| JSON | 3.127 | C++ | 1.938 | | |
| Não é código | 3.112 | HTML | 2.877 | | |

**Modelo de seções.** Aqui ninguém escreveu rótulos, então eles vêm dos títulos: uma seção chamada "Instalação"
é uma seção de instalação. Só entram títulos que nomeiam claramente um tipo (cerca de 27 mil seções). O truque é
que o modelo **nunca vê o título** — só o texto sob ele. É isso que permite identificar uma seção cujo título não
diz nada, como "Antes de começar". Rótulos feitos assim se chamam *rótulos fracos*: quase sempre certos, mas não
conferidos à mão.

Ele também aprende uma resposta a mais, **outro**, a partir de seções cujo título não nomeia tipo
("Arrays", "Amazon S3"). A maioria das seções reais é só um assunto; sem "outro", a primeira versão forçava um
tipo em todas, e só umas 2 em 3 das respostas confiantes nessas seções estavam certas. Com "outro" ele pode
recusar, e isso subiu para umas 9 em 10.

### 3.2 O laço de treino

O treino começa com todos os números aleatórios e repete um passinho para cada exemplo:

1. **Chuta.** Passa o exemplo pelos passos 2.1–2.6.
2. **Mede o erro.** A **perda** (*loss*) é −log(probabilidade dada à resposta certa). Deu 90% para a certa?
   Perda 0,11. Deu 30%? Perda 1,20. Deu 1%? Perda 4,6. Erros confiantes custam mais caro.
3. **Ajusta os números.** Calcula para que lado cada número deve andar para a perda diminuir um pouco (o
   **gradiente**) e anda um pouquinho para esse lado.

Para esse tipo de modelo, o lado é surpreendentemente simples. Para cada resposta, pegue *a probabilidade dela
menos 1 se for a certa, ou menos 0 se não for*. Resposta certa com 30% → −0,7: a pontuação dela deve subir. Uma
errada com 50% → +0,5: a pontuação deve descer. Os 8 pesos e o viés de cada resposta, e os 8 números de cada
pista do exemplo, andam na proporção disso.

O tamanho de cada passo é a **taxa de aprendizado**: começa em 0,4 e diminui aos poucos até zero, então os
primeiros passos mudam muito e os últimos fazem o ajuste fino. Isso é o **gradiente descendente estocástico**
(SGD): estocástico porque aprende com um exemplo de cada vez, em ordem embaralhada.

Uma passada por todos os exemplos é uma **época**. O modelo de código treina por 8 épocas — uns 15 segundos em
TypeScript puro (com os cinco modelos extras de calibração da seção 4.3, cerca de um minuto) — e a perda média
cai assim:

| Época | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Perda | 1,31 | 0,40 | 0,23 | 0,15 | 0,10 | 0,08 | 0,06 | 0,06 |

Mais dois detalhes:

- **Linguagens raras valem mais.** Há 6.000 blocos de Python e 566 Dockerfiles. O empurrão de cada exemplo é
  multiplicado por (6.000 ÷ a quantidade da linguagem dele)^0,5, então um Dockerfile vale umas 3,3 vezes um bloco
  de Python. Sem isso, o modelo aprenderia a responder só as linguagens comuns.
- **Reproduzível.** O embaralhamento usa uma semente aleatória fixa, então treinar os mesmos dados de novo gera
  exatamente o mesmo arquivo, byte a byte.

## 4. Mantendo os números honestos

Um modelo pode ir muito bem nos exemplos com que aprendeu e mesmo assim falhar em novos. A maior parte do
trabalho por trás desses modelos é garantir que os números publicados descrevam documentos *novos*.

### 4.1 Divisão por repositório

Blocos do mesmo projeto se parecem — mesmos nomes de variável, mesmo estilo. Se parte dos blocos de um projeto
fosse para o treino e outra para o teste, o modelo poderia passar no teste lembrando do projeto. Por isso
repositórios inteiros vão para exatamente um de três conjuntos:

- **Treino** — com o que o modelo aprende;
- **Ajuste** (*dev*) — usado para tomar decisões (tamanho do modelo, número de épocas, quais regras ficam);
- **Teste** — guardado à parte e rodado **uma vez**, no fim, para os números publicados.

Uma proteção contra vazamento também remove qualquer bloco de treino cujo texto, ou cujas três primeiras
linhas, apareça num conjunto de teste. E depois que o primeiro conjunto de teste já tinha sido visto, um
segundo, novo, foi montado com 72 repositórios que não aparecem em mais nenhum lugar.

### 4.2 Overfitting

A perda de treino sempre cai; isso não quer dizer que o modelo está melhorando. Um modelo de seções antigo, com
o dobro de slots, o dobro de números por slot e 10 épocas, chegou a uma perda de treino de 0,05 — quase perfeita.
Mesmo assim, concordava com os títulos em repositórios novos só 57% das vezes, num arquivo de 1,3 MB. Ele tinha
começado a decorar os exemplos em vez de aprender padrões: **overfitting** (sobreajuste). Um modelo menor,
treinado por 3 épocas, foi tão bem ou melhor no ajuste com um terço do tamanho, e é ele que vai no app.

### 4.3 Calibração em repositórios que o modelo nunca viu

A temperatura (seção 2.6) é ajustada onde o modelo é honesto: em previsões para repositórios com que ele não
treinou. No modelo de código, os repositórios de treino são divididos em 5 grupos; 5 modelos extras treinam cada
um com 4 grupos e preveem o quinto (*validação cruzada*). Isso dá umas 7.600 previsões fora do repositório.
Depois, a temperatura sobe até que, no filtro do app, 95% dessas previsões teriam acertado.

O efeito no conjunto de ajuste — mesmos números treinados, só a temperatura mudou:

| | Sugestões mostradas (de 280) | Certas quando mostradas |
|---|---|---|
| Sem calibração (temperatura 1) | 210 | 87,6% |
| Calibrado (o que vai no app) | 157 | 94,9% |

Menos sugestões, mas as que você vê acertam mais — a troca que o Smart Assist sempre faz. No conjunto de teste
novo, confiança e acerto se alinham assim:

| O modelo disse | Blocos | Certos de fato |
|---|---|---|
| 90–100% | 120 | 93% |
| 80–90% | 38 | 87% |
| 70–80% | 21 | 86% |
| 50–70% | 40 | 55% |
| menos de 50% | 65 | 40% |

### 4.4 O que é medido

- **Acurácia** — com que frequência a primeira resposta está certa, mostrada ou não;
- **Mostradas** — quantas respostas passam no filtro;
- **Certas quando mostradas** (precisão) — das sugestões que você de fato vê, quantas estão certas. Esta é a que
  mais importa: uma sugestão que falta não custa nada, uma errada custa confiança.

Em 284 blocos de código novos de 67 repositórios que ele nunca viu, o modelo de código mostra sugestão para 158
(56%), certas 92% das vezes — mais que o dobro de sugestões úteis das heurísticas (70, 93% certas). O modelo de
seções, em 134 repositórios de fora, dá tipo com confiança a 13,5% das seções e concorda com o título 88,9% das
vezes. Tabelas completas: [Como o Smart Assist funciona](SMART-ASSIST.pt-BR.md), seção 4.

## 5. Deixando pequeno: números de 8 bits

262.144 números de slot guardados do jeito normal (4 bytes cada) ocupam 1 MB. Em vez disso, os 8 números de cada
slot são guardados como **inteiros de 8 bits** (−127 a 127) mais uma **escala** compartilhada — *quantização*:

```text
guardado:     [−72, −85, 30, 61, −98, 127, −54, 17]   escala 0,03067
restaurado:   [−2,21; −2,61; 0,92; 1,87; −3,01; 3,90; −1,66; 0,52]
```

O maior número da linha vira ±127 e os outros são arredondados na proporção. O arredondamento quase não mexe nas
pontuações, e os números publicados são medidos no arquivo de 8 bits, não no original.

O arquivo (394.280 bytes) é organizado assim:

| Parte | Tamanho |
|---|---|
| Assinatura "MSLM", versão, tamanho do cabeçalho | 12 bytes |
| Cabeçalho (respostas, tamanhos, temperaturas, qual leitor de pistas) | ~300 bytes |
| Números dos slots, 8 bits cada | 256 KB |
| Uma escala por slot | 128 KB |
| Pesos e vieses das 21 respostas | ~0,7 KB |

Um terço do arquivo são escalas — uma das próximas coisas a encolher. O app baixa o arquivo uma vez (só depois
que você escolhe o modo *Regras + IA* e confirma) e o guarda no cache do navegador. Tudo roda em JavaScript puro:
sem biblioteca de aprendizado de máquina, sem GPU, sem worker em segundo plano. Cada decisão são alguns milhares de
multiplicações.

## 6. Limites, com honestidade

- **Linhas únicas.** Trechos curtos têm poucas pistas, e o modelo não sabe dizer "curto demais para saber".
  `x = 1` sai como Python com 97% (também é Ruby, JavaScript…), e `void main() { printf("hi"); }` como C++ com 81%
  (também é C). Uma regra de "curto demais para julgar" é o próximo passo óbvio.
- **Rótulos têm manias.** Autores marcam `dotnet build -c Release` como C#, sessões de terminal como `text`. O
  modelo aprende esses hábitos, e alguns dos seus "erros" são na verdade discordâncias com um rótulo.
- **A ordem quase não conta.** A média das pistas perde quase toda a ordem; um modelo que lê sequências pegaria
  mais coisa, com muitas vezes o tamanho.
- **Padrões, não significado.** Com 8 números por pista, ele reconhece a cara de uma linguagem ou de uma seção.
  Não sabe o que o código faz nem o que a seção diz. Também não sabe explicar a resposta.
- **Alguns tipos são fracos.** Seções de "guia" parecem muito com instalação ou exemplos; o modelo de seções
  raramente as marca com confiança. Dos tipos acrescentados na v2, "desempenho" é o menos confiável (75% de
  concordância nos repositórios de fora) e "implantação" teve poucos exemplos para aprender (246).

## 7. Fichas técnicas (model cards)

Uma ficha técnica (*model card*) é a folha de especificação de um modelo: o que entra, o que sai, como foi feito,
quão bem funciona e onde falha. Tudo o que é preciso para usar os arquivos fora do Marksage está aqui.

### 7.1 Modelo de linguagens de código

| Item | Valor |
|---|---|
| **Arquivo** | `lang-v2.bin` — 394.280 bytes, servido junto do app em `/models/lang-v2.bin` |
| **Tarefa** | Dizer a linguagem de um trecho de código |
| **Entrada** | O código em si, sem as linhas ```` ``` ```` do bloco. Só os primeiros 2.000 caracteres são lidos. |
| **Saída** | Uma probabilidade para cada uma das 21 respostas, somando 1 |
| **Respostas, na ordem do arquivo** | `ts` `js` `python` `bash` `json` `html` `css` `sql` `go` `rust` `java` `c` `cpp` `csharp` `ruby` `php` `yaml` `markdown` `diff` `dockerfile` `plaintext` (não é código) |
| **Como lê** | Leitor de pistas 1 (pistas de código, seção 2.1) → hash FNV-1a mod 32.768 → média de 8 números aprendidos por pista → 8 × 21 pesos + 21 vieses → softmax |
| **Parâmetros** | 262.333 (guardados como números de 8 bits, com uma escala por slot) |
| **Temperatura** | 1,85; 2,55 quando o trecho tem 3 linhas não vazias ou menos |
| **Dados de treino** | 63.751 blocos de código de 309 repositórios públicos, rotulados pelas tags dos autores, no máximo 6.000 por linguagem, mais janelas de arquivos de código reais para linguagens raras |
| **Treino** | 8 épocas de SGD, taxa de aprendizado de 0,4 caindo até 0, linguagens raras com peso (6.000 ÷ quantidade)^0,5, semente 1; temperaturas ajustadas em previsões fora do repositório (5 grupos) para 95% de precisão no filtro |
| **Resultados de fora** (284 blocos, 67 repositórios nunca vistos) | A primeira resposta acerta 74,3% das vezes; com o filtro 0,8 / 0,2 ele responde 51% dos blocos e acerta 92,5% das vezes |
| **Velocidade** | Cerca de 0,1 ms por trecho em JavaScript puro |
| **Use para** | Adivinhar a linguagem de um trecho curto de código, principalmente em documentação |
| **Não use para** | Linguagens fora das 20 (ele diz a mais parecida, nunca "não sei"); linhas únicas (`x = 1` sai Python com 97%); nada em que um palpite errado importe |
| **Licença** | GNU AGPL-3.0, como o resto do Marksage |

### 7.2 Modelo de seções

| Item | Valor |
|---|---|
| **Arquivo** | `sections-v2.bin` — 394.008 bytes, servido junto do app em `/models/sections-v2.bin` |
| **Tarefa** | Dizer o tipo de uma seção de documentação pelo texto dela |
| **Entrada** | O Markdown logo abaixo de um título, até o próximo título de qualquer nível, **sem a linha do título**. Só os primeiros 2.000 caracteres são lidos. Seções com menos de 40 caracteres de texto de verdade (sem tags de template, imagens e endereços de links) não valem a pergunta. |
| **Saída** | Uma probabilidade para cada uma das 14 respostas, somando 1 |
| **Respostas, na ordem do arquivo** | `overview` `setup` `guide` `reference` `config` `example` `troubleshooting` `changelog` `contributing` `legal` (licença e créditos) `security` `performance` `deployment` `other` (sem tipo definido) |
| **Como lê** | Leitor de pistas 2 (pistas de texto, seção 2.1) → o mesmo hash, média e pontuação do modelo de código, com 14 respostas |
| **Parâmetros** | 262.270 |
| **Temperatura** | 1,6 |
| **Dados de treino** | 27.250 seções dos mesmos repositórios, rotuladas por títulos sem ambiguidade (o título depois fica escondido do modelo); 7.813 delas são "outro" |
| **Treino** | 3 épocas de SGD, taxa de aprendizado de 0,3 caindo até 0, peso de classe 0,5, semente 1; temperatura ajustada nos repositórios de ajuste |
| **Resultados de fora** (134 repositórios nunca vistos) | Com o filtro 0,8 / 0,2 ele dá tipo a 13,5% das seções rotuladas e concorda com o título 88,9% das vezes (84,5% sem as de mudanças); a partir de 0,6, 25,1% e 85,6%. Tipos novos: segurança 34 de 38 mostradas concordam, desempenho 45 de 60, implantação 2 de 2. Os rótulos vêm dos títulos, então é concordância, não acurácia conferida à mão. |
| **Velocidade** | Cerca de 0,1 ms por seção |
| **Use para** | Identificar seções de READMEs e docs técnicas cujo título não diz o que são; ignore "outro" |
| **Não use para** | Seções de explicação ("Como funciona", "Arquitetura"): o texto delas parece o de qualquer assunto, e um modelo treinado para reconhecê-las não acertou nenhuma nos repositórios de ajuste, então o Marksage as identifica só pelo título — como glossários e roadmaps (76 e 57 títulos em 381 repositórios: poucos demais). "Guia" também quase nunca é reconhecido, e "desempenho" é o mais fraco dos tipos da v2. |
| **Licença** | GNU AGPL-3.0, como o resto do Marksage |

### 7.3 Rodando você mesmo

O repositório tem um executor de arquivo único, `marksage-models.mjs`, na pasta `examples`: sem dependências,
Node 18+ ou qualquer navegador moderno. É uma cópia do código do próprio app, e a avaliação do Marksage confere
que ele dá exatamente as mesmas probabilidades que o app.

```js
import { loadModel, decide } from './marksage-models.mjs'

const file = await fetch('/models/lang-v2.bin').then((r) => r.arrayBuffer())
const model = loadModel(file)

const probs = model.predict('def greet(name):\n    return f"Hello, {name}!"')
// { python: 0.827, yaml: 0.074, markdown: 0.036, ruby: 0.030, … }

decide(probs)                       // { answer: 'python', confidence: 0.827 } — a regra 0,8 / 0,2 do Marksage
decide(probs, { threshold: 0.6 })  // o nível "provável" da Estrutura
```

O modelo de seções funciona do mesmo jeito: passe o texto abaixo de um título, nunca o título.

Para levar os modelos a outra linguagem (Python, Go…), você precisa de três coisas, todas no executor:

1. **O formato do arquivo.** Little-endian. Começa com a assinatura `MSLM`, a versão (1) e o tamanho do
   cabeçalho, 4 bytes cada. Depois vem o cabeçalho em JSON (respostas, número de slots, números por slot,
   temperaturas, leitor de pistas). Em seguida, os números dos slots como inteiros de 8 bits com sinal (slots × 8,
   completados até múltiplo de 4 bytes) e uma escala float de 32 bits por slot. Por fim, os pesos como floats de
   32 bits (8 × respostas, agrupados por dimensão) e um viés float de 32 bits por resposta.
2. **O leitor de pistas.** As regras exatas que transformam texto em pistas — as expressões regulares importam,
   porque uma pista escrita diferente cai em outro slot.
3. **O hash.** FNV-1a de 32 bits sobre as unidades UTF-16 da pista, depois o resto da divisão pelo número de
   slots.

Então: tire a média dos números restaurados de cada slot distinto, calcule viés + pesos · média para cada
resposta, divida pela temperatura e aplique o softmax.

## 8. Versões e conjuntos de teste

Cada versão de modelo e cada experimento, com os números em que foi medido. As datas são o dia do commit.
"Mostradas" é quantas respostas passam no filtro 0,8 / 0,2; "certas" é a precisão quando mostradas.

### 8.1 Modelo de linguagens de código

| Versão | Data | Dados de treino | O que mudou | Primeiro conjunto de fora (314 blocos) | Conjunto de fora novo (284 blocos) | Situação |
|---|---|---|---|---|---|---|
| Só heurísticas | — | — | regras, sem modelo | 57,3% · 76 mostradas · 97,4% certas | 58,5% · 70 mostradas · 92,9% certas | referência |
| **v1** | 2026-10-24 | ~55 mil blocos, 264 repositórios | primeiro modelo: 8 números por pista, 32.768 slots, 8 épocas, temperatura 1,85 ajustada no conjunto de ajuste | 75,8% · 141 · 94,3% | 71,5% · 151 · 88,1% | substituído pela v2 |
| **v2** | 2026-10-24 | 63.751 blocos, 309 repositórios | +45 repositórios; temperatura em repositórios nunca vistos (1,85; trechos curtos 2,55; meta de 95%); no app, concordância com as heurísticas e, desde 2026-10-30, regras quase certas (≥ 99%) — sem mudança nos dois conjuntos de teste | 77,4% · 164 · 95,7% | 74,3% · 158 · 91,8% (só o modelo: 74,3% · 146 · 92,5%) | **em uso** |

A v1 foi medida uma vez no primeiro conjunto de fora. Como ele já tinha sido visto, a v2 foi julgada num segundo
conjunto, novo, montado com 72 repositórios que não aparecem em mais nenhum lugar.

### 8.2 Modelo de seções

| Versão | Data | Dados de treino | O que mudou | De fora | Situação |
|---|---|---|---|---|---|
| Rascunho sem "outro" | 2026-10-24 | ~17 mil seções rotuladas | só os 10 tipos | ajuste: 87% certas quando mostradas nas seções rotuladas, mas umas 2 em 3 em seções com títulos que não dizem nada | não foi ao ar |
| **v1** | 2026-10-24 | 26.105 seções (7.832 "outro") | acrescenta "outro"; 8 números por pista, 32.768 slots, 3 épocas, temperatura 1,6 | a partir de 0,8: 15,1% com tipo, 91,5% concordam com o título · a partir de 0,6: 27,4%, 87,1% (133 repositórios) | substituída pela v2 |
| Experimento explicação | 2026-10-25 | + 748, depois 1.283 seções de explicação | um 11º tipo, rotulado pelos títulos e depois também por pastas no estilo `concepts/` | ajuste: nenhuma resposta "explicação" certa quando mostrada, em todas as configurações | não foi ao ar — Explicação vem só dos títulos |
| **v2** | 2026-10-27 | 27.250 seções (7.813 "outro") | + segurança, desempenho, implantação; títulos de segurança deixam de contar como licença e créditos; mesmas configurações da v1 (escolhidas de novo no ajuste) | a partir de 0,8: 13,5% com tipo, 88,9% concordam · a partir de 0,6: 25,1%, 85,6% (134 repositórios) · a v1 no mesmo conjunto: 14,5%, 89,6% | **em uso** |

### 8.3 Modelo de estrutura (testado, não usado)

Pergunta: "esta linha quase certa é um item de lista ou um título?" — duas respostas, *não* e *sim*. O leitor de
pistas 3 lê a linha (o marcador, as palavras depois dele, a forma: flags, permissões do `ls -l`, hashtags, fim de
frase, dois-pontos…) e a categoria das duas linhas antes e depois (em branco, item de lista, o mesmo quase-acerto,
título, código, prosa…). Mesmo tamanho e configurações do modelo de seções (8 números por pista, 32.768 slots,
3 épocas, taxa de aprendizado 0,3; peso total por classe), temperatura 1,55.

| Versão | Data | Dados de treino | Ajuste (212 linhas) | De fora novo (227 linhas) | Situação |
|---|---|---|---|---|---|
| Regras | 2026-10-28 | — | 115 mostradas · 97,4% certas | 140 mostradas · 88,6% certas · 124 de 132 linhas verdadeiras | **em uso** |
| **v1** | 2026-10-28 | 66.076 linhas dos 381 repositórios: itens e títulos reais transformados em quase-acertos (sim), parecidos reais de prosa e de blocos de código, mais algumas linhas sintéticas de hashtags e assinaturas (não) | modelo 64 · 93,8% · regras + modelo ≥ 95% 116 · 97,4% | modelo 76 · 90,8% · 69 linhas verdadeiras; regras + modelo ≥ 95% 141 · 88,7% · 125 | não usado |

A combinação foi escolhida no ajuste antes de rodar o conjunto de fora e passou na régua (a precisão das regras,
pelo menos tantas linhas verdadeiras) por uma linha — pouco demais para um download de 385 KB. As regras e o
modelo erram linhas diferentes, então uma versão que precisa dos dois concordando é a próxima tentativa, num
conjunto de fora novo. Linhas em negrito não dá para aprender assim: os exemplos de "não" são linhas em negrito
reais, e muitas delas são títulos.

### 8.4 Modelo de tipos de colagem (testado, não usado)

Pergunta: "que tipo de texto é esta colagem?" — os sete tipos da colagem inteligente. O leitor de pistas 4 lê a
forma da colagem (se é JSON, tabs e células com vírgula e o quanto são consistentes, colunas alinhadas, marcadores,
linhas curtas, prosa quebrada, frases, estrutura de código), mais o primeiro token e o último caractere de cada
linha. Mesmo tamanho dos outros modelos; 5 épocas (escolhidas no ajuste), taxa 0,3, peso por classe 0,5,
temperatura 1,05.

| Versão | Data | Dados de treino | Ajuste (27 colagens) | De fora novo (53 colagens) | Situação |
|---|---|---|---|---|---|
| Regras | — | — | 19 mostradas · 100% certas | 41 mostradas · 97,6% certas | **em uso** |
| **v1** | 2026-10-28 | 16.977 colagens a partir de blocos de código reais, JSON, tabelas Markdown (como CSV, planilha e terminal), listas e parágrafos dos repositórios | 17 mostradas · 94,1% | 44 mostradas · 90,9% | não usado |

### 8.5 Conjuntos de teste

| Conjunto | O que é | Tamanho | Regra |
|---|---|---|---|
| Escrito | exemplos escritos junto com as regras | código 42 · colagem 15 · estrutura 36 · títulos 65 · documentos 4 | pega regressões; dá perto de 100% por construção |
| Ajuste | documentos reais, usados para tomar decisões | código 280 · colagem 27 · estrutura 212 (36, mais 176 linhas de issues e wikis em 2026-10-28) · seções de 27 repositórios | ajuste aqui, nunca nos conjuntos de fora |
| Primeiro de fora (2026-10-24) | documentos reais, nunca usados para ajustar | código 314 · colagem 31 · estrutura 30 | roda uma vez por versão; julgou a v1 |
| De fora novo (2026-10-24) | código de 72 repositórios que não aparecem em mais nenhum lugar | código 284 (67 repositórios) | montado uma vez para a v2, depois congelado |
| Terceiro de fora (2026-10-30) | código de 158 repositórios que não aparecem em mais nenhum lugar, montado antes de qualquer treino da v3 | código 842: ≤ 30 por linguagem, até 60 para TypeScript, JavaScript, C, C++, C# e Java, mais 40 blocos JSON com comentários | montado uma vez para a v3, depois congelado; roda uma vez, no fim |
| Seções de fora (2026-10-24) | seções dos repositórios de teste do modelo de código mais os novos | 133 repositórios (134 a partir da v2: os tipos novos rotulam seções em mais um) | roda uma vez por modelo de seções |
| Estrutura de fora (2026-10-28) | linhas quase certas de issues, pull requests e comentários do GitHub de 43 repositórios que não aparecem em mais nenhum lugar, rotuladas à mão | 227 linhas | montado uma vez para o modelo de estrutura, depois congelado |
| Colagens de fora (2026-10-28) | colagens reais de 19 fontes fora do corpus: arquivos de dados, células de planilha, saída de comandos, código-fonte, configurações, READMEs | 53 colagens | montado uma vez para o modelo de colagem, depois congelado |
| Links (2026-10-28) | links sozinhos na linha, com o texto que os autores escolheram | ajuste 2.842 (28 repositórios) · de fora 5.058 (138) | julga a regra do texto do link (SMART-ASSIST §4.6) |

## 9. Glossário

| Termo | Significado |
|---|---|
| **Ajuste (dev)** | Exemplos usados para tomar decisões durante a construção; nunca usados no treino. |
| **Calibração** | Ajustar a confiança para que "80% de certeza" signifique acertar umas 80% das vezes. |
| **Classificador** | Um modelo que escolhe uma resposta de uma lista fixa. |
| **Colisão** | Duas pistas diferentes caindo no mesmo slot do hash. |
| **Embedding** | A lista de números aprendidos (aqui, 8) que representa uma pista. |
| **Época** | Uma passada por todos os exemplos de treino. |
| **Feature (pista)** | Um detalhe extraído da entrada (`T:def`, `E:;`). |
| **Gradiente** | O lado para onde cada número deve andar para diminuir a perda. |
| **Logit** | A pontuação bruta de uma resposta, antes do softmax. |
| **Overfitting** | Decorar os exemplos de treino em vez de aprender padrões que valem para outros. |
| **Parâmetro** | Um dos números aprendidos (este modelo tem 262.333). |
| **Perda (loss)** | O quanto um palpite errou: −log(probabilidade da resposta certa). |
| **Precisão** | Das respostas mostradas, a parte que está certa. |
| **Quantização** | Guardar números com menos bits (aqui, 8 em vez de 32). |
| **Rótulo** | A resposta certa conhecida de um exemplo de treino. |
| **Rótulo fraco** | Um rótulo gerado por uma regra (aqui, o título), não conferido à mão. |
| **SGD** | Gradiente descendente estocástico: aprender com um exemplo de cada vez, ajustando os números pelo gradiente. |
| **Softmax** | Transforma pontuações em probabilidades que somam 100%. |
| **Taxa de aprendizado** | O tamanho de cada passo de treino. |
| **Temperatura** | Um divisor aplicado às pontuações antes do softmax; maior quer dizer menos confiante. |
| **Teste (conjunto de fora)** | Exemplos guardados à parte e rodados uma vez, para os números publicados. |
| **Truque do hash** | Mapear pistas para um número fixo de slots com uma função de hash, em vez de um dicionário. |
| **Validação cruzada** | Dividir os dados de treino em grupos e prever cada grupo com um modelo treinado nos outros. |
| **Viés** | Um número por resposta somado à pontuação dela, qualquer que seja a entrada. |

---

O código de treino, as fontes de dados e todos os resultados estão no repositório no
[GitHub](https://github.com/PabloFLPs/Marksage) — a pasta `training` tem o próprio README.
