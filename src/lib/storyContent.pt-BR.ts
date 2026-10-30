import type { StoryContent } from './storyContent'

const content: StoryContent = {
  title: 'A história do Marksage',
  intro:
    'De um visualizador de Markdown a um editor que percebe: as decisões de arquitetura e os modelos de IA por trás dele, na ordem em que aconteceram — com os números que decidiram cada passo.',
  upcoming: 'Próximos passos',
  entries: [
    {
      date: '2026-08-14',
      title: 'Local desde o primeiro commit',
      body: [
        'O Marksage começou como um visualizador para ler documentação em Markdown no trabalho. A primeira decisão de arquitetura nunca mudou: sem backend e sem contas. Os arquivos são lidos pelo navegador, e o único lugar onde algo fica guardado é o armazenamento do próprio navegador.',
      ],
      facts: ['Código no servidor: nenhum', 'Onde ficam os documentos: só neste navegador'],
    },
    {
      date: '2026-09-25',
      title: 'Modelos de decisão, não generativos',
      body: [
        'Modelos de decisão — popularizados pelo Jev (15 set) e pelo Laya, um modelo aberto (18 set) — respondem perguntas fechadas em vez de escrever texto, então a saída não tem como vir malformada. É o formato certo para “que linguagem é este código?”. Um modelo geral, testado depois no navegador, se mostrou pesado demais para um editor e não confiável o bastante nessa tarefa.',
        'Daí veio uma regra para todo recurso: usar a menor ferramenta que resolve — regras, depois um modelo minúsculo treinado para uma pergunta, depois um modelo de decisão geral. Nunca um modelo generativo nos recursos embutidos.',
      ],
      link: { label: 'Por que modelos de decisão', hash: 'smart-assist' },
    },
    {
      date: '2026-09-26',
      title: 'Smart Assist: o mecanismo decide, o código edita',
      body: [
        'A ajuda na escrita se apoia num único contrato. Um mecanismo responde perguntas fechadas — escolha uma destas opções, posicione isto numa escala, esta afirmação é verdadeira? — e o código do próprio Marksage faz a edição. Toda edição é uma sugestão: Tab aceita, Esc ignora, dá para desfazer.',
        'Uma sugestão só aparece depois de um filtro de confiança: a primeira resposta com 80% ou mais e pelo menos 20 pontos à frente da segunda. O primeiro mecanismo são regras simples.',
      ],
      facts: ['Filtro: primeira ≥ 0,80, margem ≥ 0,20', 'Edições: propostas, protegidas contra texto alterado, reversíveis'],
      link: { label: 'Como o Smart Assist funciona', hash: 'smart-assist' },
    },
    {
      date: '2026-10-24',
      title: 'Um modelo de 385 KB treinado para uma pergunta',
      body: [
        'Em que linguagem está um bloco de código? Repositórios públicos têm essa resposta centenas de milhares de vezes, escrita pelos próprios autores: o `python` depois dos acentos graves que abrem o bloco. Cerca de 250.000 blocos foram coletados e separados por repositório, então nenhum projeto visto no treino aparece nos testes.',
        'O modelo é no estilo fastText: pistas do código em hash, 8 números por pista, a média delas, uma camada linear. Roda em TypeScript puro — sem runtime de ML — e o mesmo código monta as pistas no treino e no navegador. A meta foi definida antes de medir: superar as regras em dados de teste sem perder precisão.',
      ],
      facts: [
        '314 blocos de teste: regras 73 sugestões certas, modelo v1 133 (1,8×), ~94% certas quando exibidas',
        '385 KB · ~0,1 ms por decisão · baixado só depois de você escolher',
      ],
      link: { label: 'Como os modelos funcionam', hash: 'models' },
    },
    {
      date: '2026-10-24',
      title: 'Calibrado em código que nunca viu',
      body: [
        'Uma confiança só quer dizer algo se vale em projetos desconhecidos. A versão 2 ajusta sua temperatura em previsões para repositórios fora do treino — cinco modelos extras, cada um deixando de fora um quinto dos repositórios, cerca de 7.600 blocos — e a aumenta até que 95% das sugestões exibidas estejam certas.',
        'Quando o modelo não tem certeza, uma resposta confiante das regras só vale se o primeiro palpite do próprio modelo concordar: dois métodos independentes concordando somam sugestões sem somar erros.',
      ],
      facts: ['63.751 blocos de treino de 309 repositórios', 'Teste: 164 sugestões exibidas, 95,7% certas · conjunto novo: 158, 91,8%'],
      link: { label: 'Calibração e versões', hash: 'models' },
    },
    {
      date: ['2026-10-24', '2026-10-27'],
      title: 'Um segundo modelo lê seções inteiras',
      body: [
        'A Estrutura dá um tipo a cada seção — instalação, referência, segurança… — pelo título. Quando o título não diz, um segundo modelo de 385 KB lê o texto. Ele só é usado onde aprendeu algo: seções de “explicação” tiveram 0 acertos em duas rodadas de treino, então esse tipo continua só pelo título.',
      ],
      facts: ['134 repositórios de teste: 13,5% das seções tipadas pelo modelo, 88,9% de acordo com o título'],
      link: { label: 'O modelo de seções', hash: 'models' },
    },
    {
      date: '2026-10-25',
      title: 'AGPL-3.0, e uma página que diz o que fica guardado',
      body: [
        'O Marksage — código e modelos — é software livre sob a AGPL-3.0, então versões modificadas rodando para outras pessoas também ficam abertas. Uma página de Privacidade e armazenamento lista tudo o que fica no navegador e apaga tudo com um clique.',
      ],
    },
    {
      date: '2026-10-28',
      title: 'Os modelos que não entraram',
      body: [
        'Mais dois modelos foram treinados: um para dicas de formatação, outro para tipos de colagem. Em dados novos, o de formatação superou as regras por uma única linha — pouco demais para justificar um download — e o de colagem foi menos preciso que as regras. Nenhum dos dois entrou; os dois resultados estão documentados ao lado dos que funcionaram.',
        'A regra desde então: um modelo só é usado onde empata ou supera as regras num conjunto de teste novo. Os modos dizem exatamente isso: Desligado, Regras, Regras + IA.',
      ],
      facts: ['Dicas de formatação, 227 linhas de teste: regras 140 exibidas / 88,6% · regras + modelo 141 / 88,7%', 'Tipos de colagem, 53 colagens de teste: regras 97,6% · modelo 90,9%'],
      link: { label: 'Testados, não usados', hash: 'smart-assist' },
    },
    {
      date: '2026-10-29',
      title: 'Digitar continua fluido em documentos longos',
      body: [
        'Documentos longos são desenhados em pedaços divididos nos títulos, cada um memorizado, com prioridade menor que a digitação: as teclas aparecem primeiro e a pré-visualização acompanha um instante depois, refazendo só o pedaço que mudou.',
      ],
    },
    {
      date: ['2026-10-29', '2026-10-30'],
      title: 'QA de lançamento feito por cinco agentes de IA',
      body: [
        'Antes do lançamento, cinco agentes de IA fizeram, cada um, o papel de um usuário de primeira viagem — impaciente, cético, no celular com 3G lento, alguém cujo inglês não é a língua nativa e um tentando quebrar tudo — usando o app de verdade num navegador. Eles relataram 36 problemas: 35 foram corrigidos, uma mudança por commit, cada uma documentada; um está planejado.',
        'Dois mostram o método. Um travamento de 25 segundos em tabelas grandes parecia lentidão para desenhar; o profiling achou um laço quadrático numa dependência que lê o Markdown, e uma atualização baixou para 1,7 s. E quando o modelo de código chamou TypeScript claramente tipado de “JavaScript”, uma análise pista por pista mostrou cinco pistas decisivas (`: number` a mais forte) diluídas na média entre 65 comuns às duas linguagens — o que levou a uma alternativa medida por agora e ao desenho do próximo modelo.',
      ],
      facts: ['36 problemas: 35 corrigidos, 1 planejado', 'Tabelas grandes: ~25 s → 1,7 s', 'Alternativa: +1 sugestão certa, 0 erros novos em todos os conjuntos de teste'],
    },
    {
      title: 'O que vem a seguir',
      body: [
        'Um modelo de código que preserve as pistas decisivas em vez de diluí-las na média, medido em linguagens quase gêmeas (TypeScript/JavaScript, C++/C); um carregamento inicial mais leve em redes lentas; e IA opcional com a sua própria chave, desligada por padrão.',
      ],
    },
  ],
}

export default content
