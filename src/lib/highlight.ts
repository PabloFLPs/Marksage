/**
 * Syntax highlighting for code blocks (preview and docs) — Prism grammars via refractor, turned into
 * React elements. Loaded lazily (see useHighlighter) the first time a tagged code block is shown, so
 * documents without code never download it. Colors come from `.token.*` rules in index.css.
 */
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import type { ReactNode } from 'react'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { refractor } from 'refractor/core'
import bash from 'refractor/bash'
import c from 'refractor/c'
import cpp from 'refractor/cpp'
import csharp from 'refractor/csharp'
import css from 'refractor/css'
import diff from 'refractor/diff'
import docker from 'refractor/docker'
import go from 'refractor/go'
import graphql from 'refractor/graphql'
import ini from 'refractor/ini'
import java from 'refractor/java'
import javascript from 'refractor/javascript'
import json from 'refractor/json'
import jsx_ from 'refractor/jsx'
import kotlin from 'refractor/kotlin'
import markdown from 'refractor/markdown'
import markup from 'refractor/markup'
import php from 'refractor/php'
import powershell from 'refractor/powershell'
import python from 'refractor/python'
import ruby from 'refractor/ruby'
import rust from 'refractor/rust'
import shellSession from 'refractor/shell-session'
import sql from 'refractor/sql'
import swift from 'refractor/swift'
import toml from 'refractor/toml'
import tsx from 'refractor/tsx'
import typescript from 'refractor/typescript'
import yaml from 'refractor/yaml'

for (const lang of [bash, c, cpp, csharp, css, diff, docker, go, graphql, ini, java, javascript, json, jsx_, kotlin, markdown, markup, php, powershell, python, ruby, rust, shellSession, sql, swift, toml, tsx, typescript, yaml])
  refractor.register(lang)

/** Info strings people use that Prism doesn't know by that name. */
const ALIASES: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'shell-session',
  terminal: 'shell-session',
  jsonc: 'json',
  json5: 'json',
  'c++': 'cpp',
  'c#': 'csharp',
  dockerfile: 'docker',
  vue: 'markup',
  svelte: 'markup',
  mjs: 'javascript',
  cjs: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
}

/** The grammar for a fence's info string, or null when it isn't one we bundle. */
export function grammarFor(tag: string): string | null {
  const t = tag.toLowerCase()
  const name = ALIASES[t] ?? t
  return refractor.registered(name) ? name : null
}

const cache = new Map<string, ReactNode>()

/** Highlighted React nodes for `code`, or null when the language isn't bundled. */
export function highlight(code: string, tag: string): ReactNode | null {
  const lang = grammarFor(tag)
  if (!lang) return null
  const key = lang + '\0' + code
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const out = toJsxRuntime(refractor.highlight(code, lang), { Fragment, jsx, jsxs })
  if (cache.size > 300) cache.delete(cache.keys().next().value!) // big documents: keep memory bounded
  cache.set(key, out)
  return out
}
