/**
 * Marksage's two models, outside Marksage — one file, no dependencies, Node 18+ or any modern browser.
 *
 *   import { loadModel, decide } from './marksage-models.mjs'
 *   const model = loadModel(await (await fetch('/models/lang-v2.bin')).arrayBuffer())
 *   model.predict('def greet(name):\n    return name')   // { python: 0.83, yaml: 0.07, … }
 *   decide(model.predict(text))                         // { answer: 'python', confidence: 0.83 } or null
 *
 * From a terminal:
 *   node examples/marksage-models.mjs public/models/lang-v2.bin 'SELECT * FROM users;'
 *   node examples/marksage-models.mjs public/models/sections-v2.bin "$(cat section.md)"
 *
 * This is a faithful copy of the app's code (src/assist/model/: model.ts, features.ts,
 * sectionFeatures.ts). The eval checks that both give the same probabilities, so they can't drift apart.
 * The file format and the clue rules are described in docs/MODELS.md ("Model cards").
 */

// ---------------------------------------------------------------- file format

const MAGIC = 0x4d4c534d // "MSLM"
const FORMAT_VERSION = 1
const MAX_CHARS = 2000 // both models read at most this many characters
const SHORT_LINES = 3 // code: ≤ 3 non-blank lines uses the "short" temperature

/** Parse a .bin file (ArrayBuffer) into a model with predict(text) → { answer: probability }. */
export function loadModel(buf) {
  const view = new DataView(buf)
  if (view.getUint32(0, true) !== MAGIC) throw new Error('Not a Marksage model')
  if (view.getUint32(4, true) !== FORMAT_VERSION) throw new Error('Unsupported model format')
  const headerBytes = view.getUint32(8, true)
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, headerBytes)))
  const { buckets, dim, labels } = header
  const K = labels.length
  let off = 12 + headerBytes
  const emb = new Int8Array(buf, off, buckets * dim) // 8-bit slot numbers
  off = (off + buckets * dim + 3) & ~3
  const scales = new Float32Array(buf, off, buckets) // one scale per slot
  off += buckets * 4
  // Pooling (header.pooling, missing = "mean"): "mean+max" adds, per dimension, the largest value any clue has;
  // "mean+max+min" also the smallest. The parts are concatenated, so the weights are (dim × parts) × answers.
  const parts = header.pooling === 'mean+max' ? 2 : header.pooling === 'mean+max+min' ? 3 : 1
  const H = dim * parts
  const W = new Float32Array(buf, off, H * K) // weights, (dim × parts) × answers (row-major by dimension)
  off += H * K * 4
  const b = new Float32Array(buf, off, K) // one bias per answer

  const clues = header.featurizer === 1 ? codeClues : header.featurizer === 2 ? sectionClues : null
  if (!clues) throw new Error(`Unknown featurizer ${header.featurizer}`)

  function logits(text) {
    const ids = new Set()
    for (const c of clues(text)) ids.add(hash(c) % buckets)
    // Average the 8 numbers of every clue's slot (8-bit value × slot scale) — and, with max / min pooling, keep the
    // largest / smallest value per dimension too (an empty slot counts as 8 zeros).
    const h = new Float32Array(H)
    for (let d = dim; d < H; d++) h[d] = d < 2 * dim ? -Infinity : Infinity
    for (const id of ids) {
      const s = scales[id]
      for (let d = 0; d < dim; d++) {
        const raw = s === 0 ? 0 : emb[id * dim + d] * s
        const x = parts > 1 ? Math.fround(raw) : raw // the app stores each clue's numbers as 32-bit floats first
        h[d] += x
        if (parts > 1 && x > h[dim + d]) h[dim + d] = x
        if (parts > 2 && x < h[2 * dim + d]) h[2 * dim + d] = x
      }
    }
    if (ids.size) for (let d = 0; d < dim; d++) h[d] /= ids.size
    else h.fill(0)
    // One score per answer: bias + weights · pooled numbers.
    const out = new Float32Array(K)
    for (let k = 0; k < K; k++) {
      let v = b[k]
      for (let d = 0; d < H; d++) v += W[d * K + k] * h[d]
      out[k] = v
    }
    return out
  }

  function temperature(text) {
    if (!header.temperatureShort) return header.temperature
    let n = 0
    for (const l of text.split('\n')) if (l.trim() && ++n > SHORT_LINES) return header.temperature
    return header.temperatureShort
  }

  return {
    header,
    labels,
    logits,
    predict(text) {
      const p = softmax(logits(text), temperature(text))
      const out = {}
      labels.forEach((l, i) => (out[l] = p[i]))
      return out
    },
  }
}

function softmax(logits, T) {
  let max = -Infinity
  for (const v of logits) if (v > max) max = v
  const out = new Float32Array(logits.length)
  let sum = 0
  for (let i = 0; i < logits.length; i++) sum += out[i] = Math.exp((logits[i] - max) / T)
  for (let i = 0; i < out.length; i++) out[i] /= sum
  return out
}

/**
 * Marksage's decision rule: the top answer needs ≥ threshold and a lead of ≥ margin over the second.
 * `ignore` lists answers that never count ("plaintext" for code, "other" for sections).
 * Sections in the Outline also show 0.6–0.8 answers, as "probably": decide(p, { threshold: 0.6 }).
 */
export function decide(probs, { threshold = 0.8, margin = 0.2, ignore = ['plaintext', 'other'] } = {}) {
  const ranked = Object.entries(probs).sort((a, b) => b[1] - a[1])
  const [[answer, p1], [, p2 = 0] = []] = ranked
  if (ignore.includes(answer) || p1 < threshold || p1 - p2 < margin) return null
  return { answer, confidence: p1 }
}

/** 32-bit FNV-1a over UTF-16 code units. */
export function hash(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// ---------------------------------------------------------------- clues for code (featurizer 1)

const TOKEN_RE = /--?[A-Za-z][\w-]*|[$@#]?[A-Za-z_][\w$]*|\d+(?:\.\d+)?|<\?php|<\/|\/>|=>|->|::|:=|\|\||&&|===?|!==?|<=|>=|<<|>>|\+\+|--|\.\.\.?|[^\s\w]/g
const tokenize = (line) => line.match(TOKEN_RE) ?? []

/** T: token · B: token pair · F: first token · P: first pair · E: last char · I: indentation · G: trigram. */
export function codeClues(code) {
  const out = new Set()
  for (const raw of code.slice(0, MAX_CHARS).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    const t = line.trim()
    if (!t) continue
    const ws = /^[ \t]*/.exec(line)[0]
    if (ws) out.add(ws.includes('\t') ? 'I:t' : ws.length >= 8 ? 'I:8' : ws.length >= 4 ? 'I:4' : 'I:2')
    out.add('E:' + t[t.length - 1])
    const toks = tokenize(t)
    if (!toks.length) continue
    out.add('F:' + toks[0])
    if (toks.length > 1) out.add('P:' + toks[0] + ' ' + toks[1])
    for (let i = 0; i < toks.length; i++) {
      const tok = toks[i]
      out.add('T:' + tok)
      if (i + 1 < toks.length) out.add('B:' + tok + ' ' + toks[i + 1])
      if (tok.length >= 4 && /^[$@#]?[A-Za-z_]/.test(tok)) {
        const w = '<' + tok.toLowerCase() + '>'
        for (let j = 0; j + 3 <= w.length; j++) out.add('G:' + w.slice(j, j + 3))
      }
    }
  }
  return out
}

// ---------------------------------------------------------------- clues for sections (featurizer 2)

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`{]*)/
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const WORD = /\p{L}[\p{L}\p{N}'-]*/gu

/** W: word · B: word pair · F: first word · C: code token · L: code language · S: shape. Input: the text under a heading. */
export function sectionClues(md) {
  const out = new Set()
  let fence = null
  let chars = 0
  for (const raw of md.slice(0, MAX_CHARS).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    const f = FENCE.exec(raw)
    if (f) {
      if (fence === null) {
        fence = f[1][0]
        out.add('S:code')
        if (f[2]) out.add('L:' + f[2].toLowerCase())
      } else if (f[1][0] === fence) fence = null
      continue
    }
    if (!line) continue
    if (fence !== null) {
      if (/^[$>#] \S/.test(line)) out.add('S:prompt')
      for (const t of tokenize(line).slice(0, 12)) if (/[\p{L}-]/u.test(t)) out.add('C:' + t.toLowerCase())
      continue
    }
    chars += line.length
    if (/^\|/.test(line)) out.add('S:table')
    if (/^[-*+]\s/.test(line)) out.add('S:list')
    if (/^\d+[.)]\s/.test(line)) out.add('S:olist')
    if (/^>/.test(line)) out.add('S:quote')
    if (/\bv?\d+\.\d+\.\d+\b/.test(line)) out.add('S:version')
    if (/\b(19|20)\d\d-\d\d-\d\d\b/.test(line)) out.add('S:date')
    if (/(^|[\s(])#\d+\b|\/pull\/\d+|\/issues\/\d+/.test(line)) out.add('S:ref')
    if (/!\[[^\]]*\]\(/.test(line)) out.add('S:img')
    else if (/\[[^\]]+\]\([^)]+\)|https?:\/\//.test(line)) out.add('S:link')
    const prose = line
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]*)`/g, (_, c) => {
        for (const t of tokenize(c).slice(0, 6)) if (/[\p{L}-]/u.test(t)) out.add('C:' + t.toLowerCase())
        return ' '
      })
      .replace(/^(?:[-*+>|]|\d+[.)])\s*/, '')
    const words = fold(prose).match(WORD) ?? []
    if (words.length) out.add('F:' + words[0])
    for (let i = 0; i < words.length; i++) {
      out.add('W:' + words[i])
      if (i + 1 < words.length) out.add('B:' + words[i] + ' ' + words[i + 1])
    }
  }
  out.add('S:len' + (chars < 120 ? 0 : chars < 400 ? 1 : chars < 1000 ? 2 : 3))
  return out
}

// ---------------------------------------------------------------- command line

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [file, text] = process.argv.slice(2)
  if (!file || text === undefined) {
    console.error('usage: node marksage-models.mjs <model.bin> <text>')
    process.exit(1)
  }
  const { readFileSync } = await import('node:fs')
  const bytes = readFileSync(file)
  const model = loadModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  const probs = model.predict(text)
  for (const [label, p] of Object.entries(probs).sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`${label.padEnd(16)} ${(p * 100).toFixed(1)}%`)
  const d = decide(probs)
  console.log(d ? `→ ${d.answer} (passes the 0.8 / 0.2 gate)` : '→ no confident answer')
}
