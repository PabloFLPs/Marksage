/**
 * Handwritten paraphrases for the intent model (v1, written 2026-11-17, before Pablo's test set existed — none of
 * these were written next to it). One entry per command id of `src/commands/registry.ts`, plus `none`: things the
 * palette can't do, so the model learns to say so. Each phrase is a *template*: `build.ts` derives variants from it
 * (no accents, a typo, a polite prefix) and splits train / val by template, never by variant.
 */
export type IntentLang = 'en' | 'pt-BR'
export type Phrases = Record<string, Record<IntentLang, string[]>>

export const PHRASES: Phrases = {
  new: {
    en: ['new document', 'new doc', 'new file', 'create a document', 'start a new one', 'blank page', 'start from scratch', 'make a new note', 'empty document', 'new markdown file', 'start writing something new', 'create new', 'fresh document', 'new page'],
    'pt-BR': ['novo documento', 'novo doc', 'novo arquivo', 'criar documento', 'começar um novo', 'página em branco', 'começar do zero', 'criar uma nota nova', 'documento vazio', 'novo arquivo markdown', 'escrever algo novo', 'criar novo', 'documento novo', 'nova página'],
  },
  open: {
    en: ['open file', 'open a file', 'open document', 'load a file', 'import markdown', 'open .md', 'browse files', 'open from my computer', 'load md', 'pick a file', 'open existing file', 'upload a file', 'open readme', 'import file'],
    'pt-BR': ['abrir arquivo', 'abrir um arquivo', 'abrir documento', 'carregar arquivo', 'importar markdown', 'abrir .md', 'procurar arquivos', 'abrir do computador', 'carregar md', 'escolher um arquivo', 'abrir arquivo existente', 'subir um arquivo', 'abrir readme', 'importar arquivo'],
  },
  paste: {
    en: ['paste markdown', 'paste from clipboard', 'paste', 'paste what I copied', 'use clipboard', 'new doc from clipboard', 'paste text', 'insert clipboard', 'paste my notes', 'from clipboard', 'paste it in'],
    'pt-BR': ['colar markdown', 'colar da área de transferência', 'colar', 'colar o que eu copiei', 'usar área de transferência', 'documento a partir do que copiei', 'colar texto', 'colar minhas notas', 'da área de transferência', 'cola aí', 'colar conteúdo'],
  },
  sample: {
    en: ['try the sample', 'sample document', 'show me an example', 'demo', 'example doc', 'take the tour', 'try it out', 'open the example', 'see a demo', 'example markdown', 'tour', 'show smart assist in action'],
    'pt-BR': ['testar com o exemplo', 'documento de exemplo', 'me mostra um exemplo', 'demonstração', 'doc de exemplo', 'fazer o tour', 'experimentar', 'abrir o exemplo', 'ver uma demo', 'markdown de exemplo', 'tour', 'ver o smart assist funcionando'],
  },
  export: {
    en: ['export markdown', 'save as md', 'download the file', 'save file', 'export .md', 'download markdown', 'save to disk', 'save my document', 'export', 'download md', 'save a copy', 'export the file'],
    'pt-BR': ['exportar markdown', 'salvar como md', 'baixar o arquivo', 'salvar arquivo', 'exportar .md', 'baixar markdown', 'salvar no computador', 'salvar meu documento', 'exportar', 'baixar md', 'salvar uma cópia', 'exportar o arquivo'],
  },
  pdf: {
    en: ['save as pdf', 'export pdf', 'pdf', 'print', 'print this', 'make a pdf', 'download as pdf', 'print the document', 'to pdf', 'generate pdf', 'print to paper', 'pdf export'],
    'pt-BR': ['salvar como pdf', 'exportar pdf', 'pdf', 'imprimir', 'imprimir isso', 'gerar pdf', 'baixar em pdf', 'imprimir o documento', 'em pdf', 'fazer um pdf', 'imprimir no papel', 'exportar em pdf'],
  },
  copy: {
    en: ['copy markdown', 'copy all', 'copy the text', 'copy to clipboard', 'copy everything', 'copy document', 'copy source', 'grab the markdown', 'copy raw markdown', 'copy it'],
    'pt-BR': ['copiar markdown', 'copiar tudo', 'copiar o texto', 'copiar para a área de transferência', 'copiar o documento', 'copiar o código-fonte', 'pegar o markdown', 'copiar markdown puro', 'copia isso', 'copiar todo o conteúdo'],
  },
  'edit-table': {
    en: ['make a table', 'convert to table', 'lines to table', 'csv to table', 'turn this into a table', 'table from csv', 'tsv to table', 'format as table', 'create table from selection', 'markdown table', 'tabulate', 'columns to table'],
    'pt-BR': ['fazer uma tabela', 'converter em tabela', 'linhas em tabela', 'csv para tabela', 'transformar isso em tabela', 'tabela a partir do csv', 'tsv para tabela', 'formatar como tabela', 'criar tabela com a seleção', 'tabela markdown', 'tabular', 'colunas em tabela'],
  },
  'edit-bullets': {
    en: ['bulleted list', 'bullet points', 'make a list', 'turn into bullets', 'unordered list', 'add bullets', 'list these', 'dash list', 'bullet these lines', 'make it a bullet list', 'bullets'],
    'pt-BR': ['lista com marcadores', 'tópicos', 'fazer uma lista', 'transformar em tópicos', 'lista não ordenada', 'adicionar marcadores', 'listar isso', 'lista com traço', 'colocar marcadores nessas linhas', 'transforma em lista', 'marcadores'],
  },
  'edit-numbered': {
    en: ['numbered list', 'number these', 'ordered list', 'make steps', '1 2 3 list', 'numbered steps', 'turn into numbered list', 'number the lines', 'step by step list', 'enumerate'],
    'pt-BR': ['lista numerada', 'numerar isso', 'lista ordenada', 'fazer passos', 'lista 1 2 3', 'passos numerados', 'transformar em lista numerada', 'numerar as linhas', 'lista de passo a passo', 'enumerar'],
  },
  'edit-tasks': {
    en: ['task list', 'checklist', 'todo list', 'checkboxes', 'make a todo', 'turn into tasks', 'add checkboxes', 'to-do items', 'check list', 'tasks'],
    'pt-BR': ['lista de tarefas', 'checklist', 'lista de afazeres', 'caixinhas de seleção', 'fazer um todo', 'transformar em tarefas', 'adicionar checkbox', 'itens a fazer', 'lista de checagem', 'tarefas'],
  },
  'edit-heading-up': {
    en: ['heading level up', 'bigger heading', 'promote heading', 'h2 to h1', 'increase heading', 'make heading larger', 'raise the heading', 'one level up', 'fewer hashes', 'heading up', 'upgrade the title'],
    'pt-BR': ['título um nível acima', 'título maior', 'promover título', 'h2 para h1', 'aumentar o título', 'deixar o título maior', 'subir o título', 'subir um nível', 'menos cerquilhas', 'subir título', 'título acima'],
  },
  'edit-heading-down': {
    en: ['heading level down', 'smaller heading', 'demote heading', 'h1 to h2', 'decrease heading', 'make heading smaller', 'lower the heading', 'one level down', 'more hashes', 'heading down', 'subheading'],
    'pt-BR': ['título um nível abaixo', 'título menor', 'rebaixar título', 'h1 para h2', 'diminuir o título', 'deixar o título menor', 'descer o título', 'descer um nível', 'mais cerquilhas', 'descer título', 'subtítulo'],
  },
  'edit-quote': {
    en: ['quote', 'blockquote', 'make a quote', 'quote this', 'turn into quote', 'quote block', 'add > to lines', 'cite this', 'quotation', 'quote these lines'],
    'pt-BR': ['citação', 'bloco de citação', 'fazer uma citação', 'citar isso', 'transformar em citação', 'colocar como citação', 'adicionar > nas linhas', 'citar', 'trecho citado', 'citar essas linhas'],
  },
  'edit-code': {
    en: ['code block', 'wrap in a code fence', 'make it code', 'fenced code', 'format as code', 'code snippet', 'put in a backticks block', 'turn into code block', 'code fence', 'monospace block'],
    'pt-BR': ['bloco de código', 'envolver em cerca de código', 'transformar em código', 'código cercado', 'formatar como código', 'trecho de código', 'colocar em bloco de crases', 'virar bloco de código', 'cerca de código', 'bloco monoespaçado'],
  },
  'edit-plain': {
    en: ['remove formatting', 'clear formatting', 'plain text', 'strip bold and italic', 'remove links', 'unformat', 'remove markdown styling', 'clean formatting', 'no bold', 'strip formatting'],
    'pt-BR': ['remover formatação', 'limpar formatação', 'texto puro', 'tirar negrito e itálico', 'remover links', 'desformatar', 'tirar a formatação markdown', 'limpar estilo', 'sem negrito', 'tirar formatação'],
  },
  view: {
    en: ['preview', 'show preview', 'edit', 'editor', 'go to editor', 'read mode', 'switch to edit', 'open the editor', 'reading view', 'back to editing', 'toggle preview', 'see it rendered', 'split view'],
    'pt-BR': ['visualizar', 'mostrar pré-visualização', 'editar', 'editor', 'ir para o editor', 'modo leitura', 'mudar para edição', 'abrir o editor', 'visualização', 'voltar a editar', 'alternar pré-visualização', 'ver renderizado', 'tela dividida'],
  },
  outline: {
    en: ['outline', 'show outline', 'hide outline', 'table of contents', 'toc', 'document structure', 'sections panel', 'toggle outline', 'open the sidebar', 'show headings', 'suggestions panel', 'document insights'],
    'pt-BR': ['estrutura', 'mostrar a estrutura', 'ocultar a estrutura', 'sumário', 'índice', 'estrutura do documento', 'painel de seções', 'alternar estrutura', 'abrir a barra lateral', 'mostrar títulos', 'painel de sugestões', 'análise do documento'],
  },
  theme: {
    en: ['dark mode', 'light mode', 'toggle theme', 'switch theme', 'dark theme', 'light theme', 'night mode', 'change colors', 'turn on dark', 'lights off'],
    'pt-BR': ['modo escuro', 'modo claro', 'alternar tema', 'trocar tema', 'tema escuro', 'tema claro', 'modo noturno', 'mudar as cores', 'ativar escuro', 'apagar a luz'],
  },
  'lang-en': {
    en: ['english', 'switch to english', 'language english', 'change language to english', 'english ui', 'in english please', 'en'],
    'pt-BR': ['inglês', 'mudar para inglês', 'idioma inglês', 'trocar idioma para inglês', 'interface em inglês', 'em inglês por favor', 'english'],
  },
  'lang-pt-BR': {
    en: ['portuguese', 'switch to portuguese', 'language portuguese', 'brazilian portuguese', 'pt-br', 'change language to portuguese', 'portuguese ui'],
    'pt-BR': ['português', 'mudar para português', 'idioma português', 'português do brasil', 'pt-br', 'trocar idioma para português', 'interface em português'],
  },
  'assist-off': {
    en: ['turn off assist', 'assist off', 'disable suggestions', 'stop suggestions', 'no suggestions', 'smart assist off', 'turn off smart assist', 'disable assist', 'quiet mode'],
    'pt-BR': ['desligar assist', 'assist desligado', 'desativar sugestões', 'parar sugestões', 'sem sugestões', 'smart assist desligado', 'desligar o smart assist', 'desativar assist', 'modo silencioso'],
  },
  'assist-heuristics': {
    en: ['rules mode', 'assist rules', 'rules only', 'no ai', 'heuristics', 'use rules', 'smart assist rules', 'turn off ai keep rules', 'rules without ai'],
    'pt-BR': ['modo regras', 'assist regras', 'só regras', 'sem ia', 'heurísticas', 'usar regras', 'smart assist regras', 'desligar ia manter regras', 'regras sem ia'],
  },
  'assist-model': {
    en: ['rules + ai', 'turn on ai', 'enable ai', 'use the local model', 'ai mode', 'assist with ai', 'local ai', 'enable the models', 'smart assist ai'],
    'pt-BR': ['regras + ia', 'ligar ia', 'ativar ia', 'usar o modelo local', 'modo ia', 'assist com ia', 'ia local', 'ativar os modelos', 'smart assist com ia'],
  },
  home: {
    en: ['start screen', 'home', 'go home', 'close document', 'close', 'back to start', 'main screen', 'exit document', 'close this file'],
    'pt-BR': ['tela inicial', 'início', 'ir para o início', 'fechar documento', 'fechar', 'voltar ao início', 'tela principal', 'sair do documento', 'fechar este arquivo'],
  },
  about: {
    en: ['about', 'about marksage', 'help', 'what is marksage', 'features', 'info', 'keyboard shortcuts', 'app info', 'version'],
    'pt-BR': ['sobre', 'sobre o marksage', 'ajuda', 'o que é o marksage', 'recursos', 'informações', 'atalhos de teclado', 'info do app', 'versão'],
  },
  docs: {
    en: ['how smart assist works', 'docs', 'documentation', 'smart assist docs', 'how does it work', 'read the docs', 'smart assist guide', 'how suggestions work'],
    'pt-BR': ['como o smart assist funciona', 'docs', 'documentação', 'documentação do smart assist', 'como funciona', 'ler a documentação', 'guia do smart assist', 'como as sugestões funcionam'],
  },
  models: {
    en: ['how the models work', 'models', 'ai models', 'model cards', 'how was it trained', 'training details', 'about the ai', 'local models info'],
    'pt-BR': ['como os modelos funcionam', 'modelos', 'modelos de ia', 'cartões dos modelos', 'como foi treinado', 'detalhes do treino', 'sobre a ia', 'info dos modelos locais'],
  },
  story: {
    en: ['the story', 'story', 'timeline', 'history of marksage', 'decisions', 'project history', 'how it was built', 'design decisions'],
    'pt-BR': ['a história', 'história', 'linha do tempo', 'história do marksage', 'decisões', 'histórico do projeto', 'como foi construído', 'decisões do projeto'],
  },
  privacy: {
    en: ['privacy', 'privacy and storage', 'what data is stored', 'delete my data', 'storage', 'is my data safe', 'local storage', 'data policy', 'clear data'],
    'pt-BR': ['privacidade', 'privacidade e armazenamento', 'quais dados ficam salvos', 'apagar meus dados', 'armazenamento', 'meus dados estão seguros', 'armazenamento local', 'política de dados', 'limpar dados'],
  },
  none: {
    en: ['make it bold', 'make it italic', 'insert an image', 'add a link', 'undo', 'redo', 'find and replace', 'word count', 'spell check', 'translate this', 'summarize the document', 'email this', 'share a link', 'bigger font', 'open settings', 'log in', 'sync to google drive', 'insert emoji', 'add a footnote', 'note callout', 'warning callout', 'delete the document', 'rename the file', 'sort lines', 'uppercase', 'strikethrough', 'horizontal rule', 'insert today’s date', 'go to line 20', 'search the text', 'open github', 'password protect', 'asdf', 'lorem ipsum', 'weather today', 'play music', 'make a chart', 'collaborate with a friend'],
    'pt-BR': ['deixa em negrito', 'deixa em itálico', 'inserir imagem', 'adicionar link', 'desfazer', 'refazer', 'localizar e substituir', 'contar palavras', 'corretor ortográfico', 'traduz isso', 'resumir o documento', 'mandar por email', 'compartilhar link', 'aumentar a fonte', 'abrir configurações', 'fazer login', 'sincronizar com o drive', 'inserir emoji', 'nota de rodapé', 'callout de nota', 'callout de aviso', 'apagar o documento', 'renomear o arquivo', 'ordenar linhas', 'tudo maiúsculo', 'tachado', 'linha horizontal', 'inserir a data de hoje', 'ir para a linha 20', 'buscar no texto', 'abrir o github', 'colocar senha', 'asdf', 'lorem ipsum', 'previsão do tempo', 'tocar música', 'fazer um gráfico', 'editar junto com um amigo'],
  },
}
