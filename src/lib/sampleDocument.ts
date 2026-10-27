/** Playground document used by "Try Smart Assist" on the About page. */
export const SAMPLE_DOCUMENT = `# Smart Assist playground

Move your cursor around this document — suggestions appear at the bottom of the editor.
Press **Tab** to accept, **Esc** to dismiss.

## 1. Code blocks without a language

The block below has no language tag. Click outside it and Smart Assist will suggest one.

\`\`\`
interface User {
  id: string
  name: string
}
\`\`\`

## 2. Structure that almost worked

**Installation**

#Getting started

-this should be a list item

## 3. Smart paste

Copy the lines below and paste them anywhere — you'll be offered a Markdown table.

name,role,city
Ana,Engineer,São Paulo
Bruno,Designer,Rio

## 4. Readability

Switch to the preview (or look at the left pane): each long \`##\` section gets a small dot showing how easy it is to read. Hover it for details. Short sentences and plain words make the dot green; long, winding sentences packed with multisyllabic terminology and nested qualifications, like this one, push it toward amber or red.
`

export const SAMPLE_DOCUMENT_PT_BR = `# Playground do Smart Assist

Mova o cursor pelo documento — as sugestões aparecem na parte de baixo do editor.
Pressione **Tab** para aceitar e **Esc** para dispensar.

## 1. Blocos de código sem linguagem

O bloco abaixo não tem linguagem definida. Clique fora dele e o Smart Assist vai sugerir uma.

\`\`\`
interface Usuario {
  id: string
  nome: string
}
\`\`\`

## 2. Estrutura que quase deu certo

**Instalação**

#Primeiros passos

-isto deveria ser um item de lista

## 3. Colagem inteligente

Copie as linhas abaixo e cole em qualquer lugar — você vai receber a oferta de uma tabela Markdown.

nome,cargo,cidade
Ana,Engenheira,São Paulo
Bruno,Designer,Rio

## 4. Legibilidade

Mude para a pré-visualização (ou olhe o painel da esquerda): cada seção \`##\` longa ganha um pontinho que mostra o quão fácil ela é de ler. Passe o mouse para ver os detalhes. Frases curtas e palavras simples deixam o ponto verde; frases longas e sinuosas, repletas de terminologia polissilábica e de ressalvas encadeadas umas nas outras, como esta, empurram o ponto para o âmbar ou o vermelho.
`

export function getSampleDocument(lang: string): string {
  return lang === 'pt-BR' ? SAMPLE_DOCUMENT_PT_BR : SAMPLE_DOCUMENT
}

/** The playground's file name, shown in the header and in history instead of "Untitled". */
export function getSampleFilename(lang: string): string {
  return lang === 'pt-BR' ? 'playground-smart-assist.md' : 'smart-assist-playground.md'
}
