import type { StoryContent } from './storyContent'

const content: StoryContent = {
  title: 'A história do Marksage',
  intro:
    'De um visualizador de Markdown a um editor atento aos detalhes: as decisões de arquitetura e os modelos de IA por trás dele, na ordem em que aconteceram, com os números que decidiram cada passo.',
  upcoming: 'Próximos passos',
  entries: [
    {
      date: '2026-08-14',
      title: 'Local-first desde o primeiro commit',
      body: [
        'O Marksage começou como um visualizador para ler documentação em Markdown no trabalho. A primeira decisão de arquitetura nunca mudou: sem backend e sem contas. Quem lê os arquivos é o navegador, e o armazenamento dele é o único lugar onde algo fica guardado.',
      ],
      facts: ['Código no servidor: nenhum', 'Onde ficam os documentos: só neste navegador'],
    },
    {
      date: '2026-09-26',
      title: 'Modelos de decisão, não generativos',
      body: [
        'Modelos de decisão, popularizados pelo Jev, da TypeSafe AI (15 de setembro), e pelo Laya, um modelo open weight (18 de setembro), respondem perguntas fechadas em vez de escrever texto. A resposta é sempre uma das opções da lista, então nunca vem num formato inesperado. É o formato certo para “em que linguagem está este código?”. O plano era usar um modelo geral rodando no navegador. Para essa pergunta, porém, um pequeno modelo treinado só para ela encaixou melhor: mais de mil vezes menor que um modelo de decisão geral (cerca de 262 mil parâmetros, contra os 322 milhões do menor Laya), instantâneo e fácil de medir em código real, que os próprios autores já rotulam.',
        'Daí saiu o jeito de construir cada recurso: quebrar o problema em perguntas pequenas e resolver uma de cada vez, com a ferramenta mais simples que satisfaz. Primeiro regras heurísticas; depois um pequeno modelo treinado para aquela pergunta; um modelo de decisão geral só quando nenhum dos dois resolve. Os recursos que já vêm no Marksage nunca usam um modelo generativo. A conexão com outros modelos de IA, quando vier, vai ser opcional.',
      ],
      facts: ['Modelo de código do Marksage: cerca de 262 mil parâmetros, 385 KB', 'Laya: 322–421 milhões de parâmetros'],
      link: { label: 'As fichas técnicas: como os modelos funcionam', hash: 'models' },
    },
    {
      date: '2026-09-26',
      title: 'Smart Assist: a engine decide, o código edita',
      body: [
        'A ajuda na escrita se apoia em um único contrato. Uma engine responde perguntas fechadas (escolha uma destas opções, posicione isto numa escala, esta afirmação é verdadeira?), e o código do próprio Marksage faz a edição. Toda edição é uma sugestão: Tab aceita, Esc ignora e dá para desfazer.',
        'Uma sugestão só aparece se passar por um filtro de confiança: a primeira resposta precisa ter 80% ou mais e estar pelo menos 20 pontos à frente da segunda. A primeira engine são regras heurísticas simples.',
      ],
      facts: ['Filtro: primeira ≥ 0,80, margem ≥ 0,20', 'Edições: propostas, protegidas contra texto que mudou, reversíveis'],
      link: { label: 'Como o Smart Assist funciona', hash: 'smart-assist' },
    },
    {
      date: '2026-10-23',
      title: 'Um modelo de 385 KB treinado para uma pergunta',
      body: [
        'Em que linguagem está um bloco de código? Repositórios públicos trazem essa resposta centenas de milhares de vezes, escrita pelos próprios autores: o `python` logo depois das crases que abrem o bloco. Foram coletados cerca de 250.000 blocos, separados por repositório, para que nenhum projeto visto no treino apareça nos testes.',
        'O modelo segue a linha do fastText: pistas do código passam por hash, cada uma vira 8 números, tira-se a média e uma única camada linear decide. Ele roda em TypeScript puro, sem runtime de ML, e o mesmo código monta as pistas no treino e no navegador. A régua foi definida antes de medir: superar as regras em dados de teste sem perder precisão.',
      ],
      facts: [
        '314 blocos de teste: regras, 73 sugestões certas; modelo v1, 133 (1,8×), com ~94% de acerto quando aparece',
        '385 KB · ~0,1 ms por decisão · baixado só depois que você escolhe o modo',
      ],
      link: { label: 'Como os modelos funcionam', hash: 'models' },
    },
    {
      date: '2026-10-24',
      title: 'Calibrado em código que nunca tinha visto',
      body: [
        'Uma confiança só vale alguma coisa se continuar valendo em projetos desconhecidos. A versão 2 ajusta a temperatura com previsões para repositórios em que não treinou: cinco modelos extras, cada um deixando de fora um quinto dos repositórios, cerca de 7.600 blocos. A temperatura sobe até que 95% das sugestões que ele mostraria estejam certas.',
        'Quando o modelo não tem certeza, uma resposta confiante das regras só é usada se a primeira opção do próprio modelo concordar. Dois métodos independentes que concordam somam sugestões sem somar erros.',
      ],
      facts: ['63.751 blocos de treino de 309 repositórios', 'Teste: 164 sugestões exibidas, 95,7% certas · conjunto novo: 158, 91,8%'],
      link: { label: 'Como os modelos funcionam', hash: 'models' },
    },
    {
      date: ['2026-10-24', '2026-10-27'],
      title: 'Um segundo modelo lê seções inteiras',
      body: [
        'A Estrutura dá um tipo a cada seção (instalação, referência, segurança…) a partir do título. Quando o título não diz, um segundo modelo de 385 KB lê o texto. Ele só é usado onde de fato aprendeu alguma coisa: as seções de “explicação” tiveram 0 acertos em duas rodadas de treino, então esse tipo continua vindo só do título.',
      ],
      facts: ['134 repositórios de teste: o modelo dá tipo a 13,5% das seções, e concorda com o título em 88,9%'],
      link: { label: 'Como os modelos funcionam', hash: 'models' },
    },
    {
      date: ['2026-10-24', '2026-10-25'],
      title: 'AGPL-3.0, e uma página que diz o que fica guardado',
      body: [
        'O código e os modelos do Marksage são software livre, sob a AGPL-3.0: quem disponibilizar uma versão alterada para outras pessoas, mesmo como site, precisa oferecer a elas o código-fonte completo. Uma página de Privacidade e armazenamento lista tudo o que fica no navegador e apaga tudo com um clique.',
      ],
    },
    {
      date: '2026-10-28',
      title: 'Os modelos que ficaram de fora',
      body: [
        'Mais dois modelos foram treinados: um para as dicas de formatação, outro para os tipos de conteúdo colado. Em dados novos, o de formatação superou as regras por uma única linha, pouco demais para justificar um download, e o de colagem foi menos preciso que as regras. Nenhum dos dois entrou no app; os dois resultados estão documentados ao lado dos que deram certo.',
        'A política desde então: um modelo só é usado onde empata com as regras ou as supera em um conjunto de teste novo. Os modos dizem exatamente isso: Desligado, Regras, Regras + IA.',
      ],
      facts: ['Dicas de formatação, 227 linhas de teste: regras, 140 exibidas / 88,6% · regras + modelo, 141 / 88,7%', 'Tipos de conteúdo colado, 53 colagens de teste: regras, 97,6% · modelo, 90,9%'],
      link: { label: 'Como o Smart Assist funciona', hash: 'smart-assist' },
    },
    {
      date: '2026-10-29',
      title: 'A digitação continua fluida em documentos longos',
      body: [
        'Documentos longos são renderizados em pedaços, divididos nos títulos, cada um memoizado e com prioridade menor que a digitação. A tecla aparece primeiro, e a pré-visualização se atualiza um instante depois, refazendo só o pedaço que mudou.',
      ],
    },
    {
      date: '2026-10-30',
      title: 'QA de lançamento feito por cinco agentes de IA',
      body: [
        'Antes do lançamento, cinco agentes de IA fizeram o papel de quem usa o app pela primeira vez: alguém sem paciência, alguém desconfiado, alguém no celular com 3G lento, alguém que não tem o inglês como língua nativa e alguém tentando quebrar tudo. Todos usaram o app de verdade, num navegador. Eles trouxeram 36 achados: 35 foram corrigidos, uma mudança por commit, cada uma documentada; um está planejado.',
        'Dois mostram o método. Um travamento de 25 segundos em tabelas grandes parecia renderização lenta; o profiling mostrou um loop quadrático numa dependência que lê Markdown, e uma atualização dela levou o tempo para 1,7 s. E quando o modelo de código chamou de “JavaScript” um TypeScript claramente tipado, a análise pista por pista mostrou cinco pistas decisivas (`: number` a mais forte) diluídas na média entre 65 compartilhadas. Isso levou a uma regra de reserva medida, por enquanto, e ao desenho do próximo modelo.',
      ],
      facts: ['36 achados: 35 corrigidos, 1 planejado', 'Tabelas grandes: ~25 s → 1,7 s', 'Regra de reserva: +1 acerto no conjunto de dev, conjuntos de teste iguais, 0 erros novos'],
    },
    {
      date: '2026-10-30',
      title: 'Melhor no geral, não onde se queria',
      body: [
        'O modelo de código seguinte guardou, ao lado da média, a pista mais forte de cada dimensão (mean + max pooling), para que uma pista decisiva como `: number` não se perdesse na média. Ele foi ajustado com previsões para repositórios em que nunca treinou e julgado uma única vez num terceiro conjunto de teste novo, com 842 blocos de 158 repositórios. A régua foi escrita antes da rodada: mais sugestões certas nas linguagens quase gêmeas (TypeScript/JavaScript, C++/C, C#/Java), sem perder precisão.',
        'No geral, ele superou o modelo em uso. Nas linguagens quase gêmeas, não: foi menos preciso, e pior em TypeScript/JavaScript. A causa estava nos rótulos, não no modelo: só 42% do código marcado como TypeScript no treino tem alguma sintaxe exclusiva de TypeScript; o resto é JavaScript válido. Ele não entrou no app, e o resultado está documentado ao lado dos que entraram.',
        'Refazer os dados de treino também mostrou que o modelo em uso não podia ser reproduzido exatamente a partir das fontes registradas. Por isso o arquivo publicado virou a base fixa com que todo modelo novo é comparado, e todo modelo de código publicado daqui em diante leva uma impressão digital (fingerprint) dos dados com que aprendeu.',
      ],
      facts: [
        '842 blocos de teste · linguagens quase gêmeas: 103 certas, 88,0%, contra 106, 89,8%, do modelo em uso',
        'No geral: 391 certas, 93,8%, contra 380, 93,1%',
        'Regra de reserva medida de novo: +3 certas, 0 erros novos — continua',
        'Próximo modelo de código publicado: uma fingerprint dos dados de treino, conferida a cada reconstrução',
      ],
      link: { label: 'Como os modelos funcionam', hash: 'models' },
    },
    {
      title: 'O que vem a seguir',
      body: [
        'Resolver TypeScript/JavaScript onde está o problema: rótulos que digam o que o código é, não de que projeto ele veio. Depois, a conexão com outros modelos de IA (BYOK, com a sua própria chave): um agente de IA, com o modelo e a chave que você escolher, para ajudar com o que precisar dentro do Marksage. Opcional e desligada por padrão.',
      ],
    },
  ],
  credit: 'Feito por {author}, com assistência de IA (Claude) na implementação e na revisão; a arquitetura, as réguas de medição e cada decisão de publicar ou não são dele. Código, treino e arquivos dos modelos: {source} (AGPL-3.0).',
}

export default content
