"""
Diagrams for the docs — one geometry per diagram, EN + PT-BR:
  python3 scripts/diagrams.py docs
- architecture(.narrow)(.pt-BR).svg — docs/SMART-ASSIST(.pt-BR).md; wide for GitHub and the app, "narrow" (lanes
  stacked) for the app on small screens;
- models-inference(.pt-BR).svg, models-training(.pt-BR).svg — docs/MODELS(.pt-BR).md (single column, phone-friendly).
Colors are msd-* classes: the SVG's own <style> covers GitHub (light/dark via prefers-color-scheme); in the app,
index.css overrides them with the theme and accent. Keep the Mermaid versions in the docs in sync when boxes change.
The example numbers in the models diagrams come from the shipped model files (see MODELS.md, section 2).
"""
from html import escape
import sys

T = {
 'en': dict(
  title='How Smart Assist works', desc='Two flows: suggestions in the editor, and the Outline panel.',
  laneA='SUGGESTIONS', laneB='OUTLINE & DOCUMENT',
  editor=('Editor', 'typing pause 400 ms · paste · 2 s idle'),
  pre=('Pre-filter', 'finds a candidate — none: stop here'),
  heur=('Heuristics', 'always ready'), model=('Local model', 'own models + heuristics'),
  engine='Decision engine · choice / score / noul',
  gate=('Confidence gate', 'top ≥ 0.8 and ahead by ≥ 0.2'),
  feat=('Feature + converter', 'builds the edit: table, list, fence'),
  bar=('Suggestion bar', 'Tab accept · Esc dismiss · undo works'),
  doc=('Document', 'the text you are reading or editing'),
  sec=('Sections', 'split at headings, code skipped'),
  rule=('Heading rule', '“Installation” → Setup'),
  says='heading says nothing', typed='typed',
  smodel=('Section model', 'Local model mode · reads the text'),
  otab=('Outline tab', 'type + key sentence'), dtab=('Document tab', 'facts · tone · flags'),
  note='Visual only — never edits',
 ),
 'pt': dict(
  title='Como o Smart Assist funciona', desc='Dois fluxos: sugestões no editor e o painel Estrutura.',
  laneA='SUGESTÕES', laneB='ESTRUTURA E DOCUMENTO',
  editor=('Editor', 'pausa de 400 ms · colagem · 2 s parado'),
  pre=('Pré-filtro', 'acha um candidato — sem ele, para aqui'),
  heur=('Heurísticas', 'sempre prontas'), model=('Modelo local', 'modelos + heurísticas'),
  engine='Mecanismo de decisão · choice / score / noul',
  gate=('Filtro de confiança', 'topo ≥ 0,8 e à frente por ≥ 0,2'),
  feat=('Recurso + conversor', 'monta a edição: tabela, lista, bloco'),
  bar=('Barra de sugestão', 'Tab aceita · Esc dispensa · dá para desfazer'),
  doc=('Documento', 'o texto que você lê ou edita'),
  sec=('Seções', 'divididas nos títulos, sem código'),
  rule=('Regra dos títulos', '“Como instalar” → Instalação'),
  says='o título não diz', typed='com tipo',
  smodel=('Modelo de seções', 'modo Modelo local · lê o texto'),
  otab=('Aba Estrutura', 'tipo + frase-chave'), dtab=('Aba Documento', 'fatos · tom · alertas'),
  note='Só visual — nunca edita',
 ),
}

STYLE = """
  .msd-lane { fill: none; stroke: #d8dee4; }
  .msd-lane-t { fill: #2563eb; font-size: 11px; font-weight: 600; letter-spacing: .08em; }
  .msd-box { fill: #f6f8fa; stroke: #d0d7de; }
  .msd-box.msd-accent { stroke: #2563eb; stroke-width: 1.5; }
  .msd-box.msd-dashed, .msd-group { stroke-dasharray: 4 3; }
  .msd-group { fill: none; stroke: #8c959f; }
  .msd-t { fill: #1f2328; font-size: 14px; font-weight: 600; }
  .msd-s { fill: #59636e; font-size: 12px; }
  .msd-s.msd-small { font-size: 11px; }
  .msd-label { fill: #59636e; font-size: 11px; }
  .msd-note { fill: #59636e; font-size: 11.5px; font-style: italic; }
  .msd-mono { fill: #59636e; font-size: 11.5px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .msd-step { fill: #2563eb; font-size: 11px; font-weight: 700; }
  .msd-line { fill: none; stroke: #8c959f; stroke-width: 1.4; }
  .msd-head { fill: #8c959f; }
  @media (prefers-color-scheme: dark) {
    .msd-lane { stroke: #30363d; }
    .msd-lane-t { fill: #58a6ff; }
    .msd-box { fill: #161b22; stroke: #30363d; }
    .msd-box.msd-accent { stroke: #58a6ff; }
    .msd-group { stroke: #6e7681; }
    .msd-t { fill: #e6edf3; }
    .msd-s, .msd-label, .msd-note, .msd-mono { fill: #8b949e; }
    .msd-step { fill: #58a6ff; }
    .msd-line { stroke: #6e7681; }
    .msd-head { fill: #6e7681; }
  }
"""

def box(x, y, w, h, title, sub, cls='', small=False):
    cx = x + w / 2
    return (f'<rect class="msd-box {cls}" x="{x}" y="{y}" width="{w}" height="{h}" rx="9"/>'
            f'<text class="msd-t" x="{cx}" y="{y + h/2 - 4}" text-anchor="middle">{escape(title)}</text>'
            f'<text class="msd-s{" msd-small" if small else ""}" x="{cx}" y="{y + h/2 + 13}" text-anchor="middle">{escape(sub)}</text>')

SFX = ['']
def line(points, arrow=True):
    d = 'M' + ' L'.join(f'{x},{y}' for x, y in points)
    marker = f' marker-end="url(#msd-arrow{SFX[0]})"' if arrow else ''
    return f'<path class="msd-line" d="{d}"{marker}/>'

def svg(t, narrow=False):
    sfx = '-n' if narrow else ''
    W, H = (360, 1074) if narrow else (720, 552)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="msd-title{sfx} msd-desc{sfx}" font-family="system-ui, -apple-system, \'Segoe UI\', Helvetica, Arial, sans-serif">',
           f'<title id="msd-title{sfx}">{escape(t["title"])}</title><desc id="msd-desc{sfx}">{escape(t["desc"])}</desc>',
           f'<style>{STYLE}</style>',
           f'<defs><marker id="msd-arrow{sfx}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="msd-head" d="M0,0 L10,5 L0,10 z"/></marker></defs>']
    SFX[0] = sfx
    # lanes (narrow: lane B moves under lane A)
    out.append('<rect class="msd-lane" x="8" y="8" width="344" height="536" rx="14"/>')
    out.append(f'<text class="msd-lane-t" x="24" y="30">{escape(t["laneA"])}</text>')
    # lane A — x 24..336, centre 180
    out.append(box(24, 44, 312, 54, *t['editor']))
    out.append(line([(180, 98), (180, 121)]))
    out.append(box(24, 122, 312, 54, *t['pre']))
    out.append('<rect class="msd-group" x="16" y="200" width="328" height="102" rx="12"/>')
    out.append(line([(180, 176), (180, 190)], arrow=False))
    out.append(line([(100, 190), (260, 190)], arrow=False))
    out.append(line([(100, 190), (100, 211)]))
    out.append(line([(260, 190), (260, 211)]))
    out.append(box(24, 212, 152, 60, *t['heur'], small=True))
    out.append(box(184, 212, 152, 60, *t['model'], small=True))
    out.append(f'<text class="msd-label" x="180" y="291" text-anchor="middle">{escape(t["engine"])}</text>')
    out.append(line([(180, 302), (180, 323)]))
    out.append(box(24, 324, 312, 54, *t['gate'], cls='msd-accent'))
    out.append(line([(180, 378), (180, 401)]))
    out.append(box(24, 402, 312, 54, *t['feat']))
    out.append(line([(180, 456), (180, 479)]))
    out.append(box(24, 480, 312, 54, *t['bar']))
    # lane B — boxes x 384..652 (centre 518), tabs below
    laneB_start = len(out)
    out.append(f'<rect class="msd-lane" x="368" y="8" width="344" height="{506 if narrow else 536}" rx="14"/>')
    out.append(f'<text class="msd-lane-t" x="384" y="30">{escape(t["laneB"])}</text>')
    out.append(box(384, 44, 268, 54, *t['doc']))
    out.append(line([(518, 98), (518, 121)]))
    out.append(box(384, 122, 268, 54, *t['sec']))
    out.append(line([(518, 176), (518, 199)]))
    out.append(box(384, 200, 268, 54, *t['rule']))
    out.append(line([(518, 254), (518, 289)]))
    out.append(f'<text class="msd-label" x="526" y="276">{escape(t["says"])}</text>')
    out.append(box(384, 290, 268, 60, *t['smodel'], cls='msd-dashed'))
    # typed: bypass on the right, into the bus
    out.append(line([(652, 227), (680, 227), (680, 386)], arrow=False))
    out.append(f'<text class="msd-label" x="690" y="306" text-anchor="middle" transform="rotate(90 690 306)">{escape(t["typed"])}</text>')
    out.append(line([(518, 350), (518, 386)], arrow=False))
    out.append(line([(458, 386), (680, 386)], arrow=False))
    out.append(line([(458, 386), (458, 409)]))
    out.append(line([(622, 386), (622, 409)]))
    out.append(box(384, 410, 148, 60, *t['otab'], small=True))
    out.append(box(548, 410, 148, 60, *t['dtab'], small=True))
    out.append(f'<text class="msd-note" x="540" y="500" text-anchor="middle">{escape(t["note"])}</text>')
    if narrow:
        out[laneB_start:] = ['<g transform="translate(-360 552)">'] + out[laneB_start:] + ['</g>']
    out.append('</svg>')
    return '\n'.join(out) + '\n'


# ---------------------------------------------------------------- single-column step diagrams (MODELS.md)

CHAINS = {
 'models-inference': {
  'en': dict(title='From a snippet to an answer', desc='How the code-language model turns a snippet into probabilities, with real numbers.',
    steps=[('Snippet', 'def greet(name): return f"Hello…"'),
           ('Clues (features)', '55 clues: T:def  F:return  G:gre  E::'),
           ('Hash each clue to a slot', 'T:def → slot 23,610 of 32,768'),
           ('Look up 8 numbers per slot', '55 clues × 8 learned numbers'),
           ('Average them', '[0.11, −0.23, 0.32, 0.02, …]'),
           ('Score each answer', 'python 16.7 · yaml 10.5 · markdown 8.6 …'),
           ('Softmax, temperature 2.55', 'python 83% · yaml 7% · markdown 4% …'),
           ('Confidence gate', '83% ≥ 80% and 75 points ahead → “python”')],
    accent=7),
  'pt': dict(title='De um trecho a uma resposta', desc='Como o modelo de linguagens transforma um trecho em probabilidades, com números reais.',
    steps=[('Trecho', 'def greet(name): return f"Hello…"'),
           ('Pistas (features)', '55 pistas: T:def  F:return  G:gre  E::'),
           ('Hash de cada pista para um slot', 'T:def → slot 23.610 de 32.768'),
           ('Busca 8 números por slot', '55 pistas × 8 números aprendidos'),
           ('Tira a média', '[0,11; −0,23; 0,32; 0,02; …]'),
           ('Pontua cada resposta', 'python 16,7 · yaml 10,5 · markdown 8,6 …'),
           ('Softmax, temperatura 2,55', 'python 83% · yaml 7% · markdown 4% …'),
           ('Filtro de confiança', '83% ≥ 80% e 75 pontos à frente → “python”')],
    accent=7),
 },
 'models-training': {
  'en': dict(title='How the models learned', desc='The training pipeline, from public repositories to the published numbers.',
    steps=[('Public repositories', '309 repos: docs, READMEs, guides'),
           ('Labelled examples', 'code: the authors’ tags · sections: headings'),
           ('Split by repository', 'train · dev (choices) · test (once)'),
           ('Training loop', 'guess → measure the miss → nudge the numbers'),
           ('Calibrate', 'temperature from repos it never saw'),
           ('Shrink', '8 bits + one scale per row → 385 KB'),
           ('Measure once', 'held-out repos → the published numbers')],
    accent=3, loop='× several passes'),
  'pt': dict(title='Como os modelos aprenderam', desc='O fluxo de treino, dos repositórios públicos aos números publicados.',
    steps=[('Repositórios públicos', '309 repositórios: docs, READMEs, guias'),
           ('Exemplos rotulados', 'código: as tags dos autores · seções: títulos'),
           ('Divisão por repositório', 'treino · ajuste (escolhas) · teste (uma vez)'),
           ('Laço de treino', 'chuta → mede o erro → ajusta os números'),
           ('Calibra', 'temperatura em repositórios nunca vistos'),
           ('Encolhe', '8 bits + uma escala por linha → 385 KB'),
           ('Mede uma vez', 'repositórios de fora → os números publicados')],
    accent=3, loop='× várias passadas'),
 },
}

def chain_svg(name, t):
    W, BOX_H, GAP, X, BW = 440, 56, 22, 20, 360
    n = len(t['steps'])
    H = 24 + n * BOX_H + (n - 1) * GAP + 24
    SFX[0] = '-' + name
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="msd-title-{name} msd-desc-{name}" font-family="system-ui, -apple-system, \'Segoe UI\', Helvetica, Arial, sans-serif">',
           f'<title id="msd-title-{name}">{escape(t["title"])}</title><desc id="msd-desc-{name}">{escape(t["desc"])}</desc>',
           f'<style>{STYLE}</style>',
           f'<defs><marker id="msd-arrow-{name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="msd-head" d="M0,0 L10,5 L0,10 z"/></marker></defs>']
    cx = X + BW / 2
    for i, (title, mono) in enumerate(t['steps']):
        y = 24 + i * (BOX_H + GAP)
        cls = 'msd-accent' if i == t.get('accent') else ''
        out.append(f'<rect class="msd-box {cls}" x="{X}" y="{y}" width="{BW}" height="{BOX_H}" rx="9"/>')
        out.append(f'<text class="msd-step" x="{X + 14}" y="{y + 22}">{i + 1}</text>')
        out.append(f'<text class="msd-t" x="{X + 32}" y="{y + 22}">{escape(title)}</text>')
        out.append(f'<text class="msd-mono" x="{X + 32}" y="{y + 42}">{escape(mono)}</text>')
        if i < n - 1:
            out.append(line([(cx, y + BOX_H), (cx, y + BOX_H + GAP - 1)]))
    if 'loop' in t:
        i = t['accent']
        y = 24 + i * (BOX_H + GAP)
        right = X + BW
        out.append(line([(right, y + BOX_H - 14), (right + 22, y + BOX_H - 14), (right + 22, y + 14), (right + 1, y + 14)]))
        out.append(f'<text class="msd-label" x="{right + 34}" y="{y + BOX_H / 2}" text-anchor="middle" transform="rotate(90 {right + 34} {y + BOX_H / 2})">{escape(t["loop"])}</text>')
    out.append('</svg>')
    return '\n'.join(out) + '\n'

dest = sys.argv[1]
open(f'{dest}/architecture.svg', 'w').write(svg(T['en']))
open(f'{dest}/architecture.pt-BR.svg', 'w').write(svg(T['pt']))
open(f'{dest}/architecture.narrow.svg', 'w').write(svg(T['en'], narrow=True))
open(f'{dest}/architecture.narrow.pt-BR.svg', 'w').write(svg(T['pt'], narrow=True))
print('ok')
for name, langs in CHAINS.items():
    open(f'{dest}/{name}.svg', 'w').write(chain_svg(name, langs['en']))
    open(f'{dest}/{name}.pt-BR.svg', 'w').write(chain_svg(name, langs['pt']))
