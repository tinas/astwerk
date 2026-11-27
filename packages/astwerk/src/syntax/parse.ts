import type { Diagnostic, DiagnosticCode } from '../diagnostics'
import type { HighlightKind, HighlightSpan } from './highlight-kind'
import type { RangeBound, RawValue, Span, SyntaxGroup, SyntaxNode, SyntaxTerm, SyntaxText } from './syntax-tree'

import { createDiagnostic, DIAGNOSTIC_CODE } from '../diagnostics'
import { HIGHLIGHT_KIND } from './highlight-kind'
import { COMPARE_OPERATORS } from './syntax-tree'

export interface ParseResult {
  tree: SyntaxNode
  diagnostics: Array<Diagnostic>
}

interface Scan extends ParseResult {
  highlights: Array<HighlightSpan>
}

interface ParseState {
  readonly text: string
  position: number
  readonly diagnostics: Array<Diagnostic>
  readonly highlights: Array<HighlightSpan>
}

interface Chunk {
  value: string
  quoted: boolean
  unclosedQuote?: Span
}

const MAX_DEPTH = 32
const WHITESPACE = /\s/
const RANGE_SEPARATOR = '..'

/** Reads any text into a tree. Broken text gives diagnostics, never an exception. */
export function parse(text: string): ParseResult {
  const { tree, diagnostics } = scan(text)
  return { tree, diagnostics }
}

export function scan(text: string): Scan {
  const state: ParseState = { text, position: 0, diagnostics: [], highlights: [] }
  const tree = parseOr(state, 0)
  return { tree, diagnostics: state.diagnostics, highlights: state.highlights }
}

function parseOr(state: ParseState, depth: number): SyntaxNode {
  const from = state.position
  const operands = [parseAnd(state, depth)]
  while (isKeywordAt(state, 'OR')) {
    mark(state, HIGHLIGHT_KIND.keyword, 'OR'.length)
    operands.push(parseAnd(state, depth))
  }
  return combine('or', operands, { from, to: state.position })
}

function parseAnd(state: ParseState, depth: number): SyntaxNode {
  const from = state.position
  const children: Array<SyntaxNode> = []
  skipWhitespace(state)
  while (!isAtEnd(state) && !isKeywordAt(state, 'OR') && !closesGroup(state, depth)) {
    readAndOperand(state, depth, children)
    skipWhitespace(state)
  }
  return combine('and', children, { from, to: state.position })
}

function readAndOperand(state: ParseState, depth: number, children: Array<SyntaxNode>): void {
  if (currentChar(state) == ')') {
    report(state, DIAGNOSTIC_CODE.unbalancedParenthesis, { from: state.position, to: state.position + 1 })
    mark(state, HIGHLIGHT_KIND.paren, 1)
    return
  }
  if (isKeywordAt(state, 'AND')) {
    mark(state, HIGHLIGHT_KIND.keyword, 'AND'.length)
    return
  }
  const node = parseNegation(state, depth)
  if (node != undefined) children.push(node)
}

function parseNegation(state: ParseState, depth: number): SyntaxNode | undefined {
  const keywordStarts: Array<number> = []
  while (isKeywordAt(state, 'NOT')) {
    keywordStarts.push(state.position)
    mark(state, HIGHLIGHT_KIND.keyword, 'NOT'.length)
    skipWhitespace(state)
  }
  if (!startsOperand(state)) return undefined
  const operand = parseSign(state, depth)
  return keywordStarts.length % 2 == 0 ? operand : negate(state, keywordStarts[0], operand)
}

function parseSign(state: ParseState, depth: number): SyntaxNode {
  const from = state.position
  if (currentChar(state) != '-' || !startsOperandAt(state, state.position + 1)) return parseOperand(state, depth)
  mark(state, HIGHLIGHT_KIND.negation, 1)
  return negate(state, from, parseOperand(state, depth))
}

function negate(state: ParseState, from: number, child: SyntaxNode): SyntaxNode {
  const span = { from, to: state.position }
  if (isGroup(child)) report(state, DIAGNOSTIC_CODE.negatedGroup, span)
  return { type: 'not', child, span }
}

function parseOperand(state: ParseState, depth: number): SyntaxNode {
  return currentChar(state) == '(' ? parseGroup(state, depth) : parseWord(state)
}

function parseGroup(state: ParseState, depth: number): SyntaxNode {
  const open = { from: state.position, to: state.position + 1 }
  mark(state, HIGHLIGHT_KIND.paren, 1)
  if (depth >= MAX_DEPTH) {
    report(state, DIAGNOSTIC_CODE.nestingTooDeep, open)
    return emptyGroup(open)
  }
  const inner = parseOr(state, depth + 1)
  if (currentChar(state) == ')') mark(state, HIGHLIGHT_KIND.paren, 1)
  else report(state, DIAGNOSTIC_CODE.unbalancedParenthesis, open)
  return isGroup(inner) ? { ...inner, span: { from: open.from, to: state.position } } : inner
}

function parseWord(state: ParseState): SyntaxTerm | SyntaxText {
  const from = state.position
  const key = readChunk(state, isKeyEnd)
  if (currentChar(state) == ':' && state.position > from) return parseTerm(state, from, key)
  state.position = from
  const text = readChunk(state, isWordEnd)
  const span = { from, to: state.position }
  reportUnclosedQuote(state, text)
  state.highlights.push({ ...span, kind: HIGHLIGHT_KIND.text })
  return { type: 'text', value: text.value, quoted: text.quoted, span }
}

function parseTerm(state: ParseState, from: number, key: Chunk): SyntaxTerm {
  const keySpan = { from, to: state.position }
  state.highlights.push({ ...keySpan, kind: HIGHLIGHT_KIND.key })
  mark(state, HIGHLIGHT_KIND.separator, 1)
  const values = [parseValue(state)]
  while (currentChar(state) == ',') {
    mark(state, HIGHLIGHT_KIND.separator, 1)
    values.push(parseValue(state))
  }
  return { type: 'term', key: key.value, keySpan, values, span: { from, to: state.position } }
}

function parseValue(state: ParseState): RawValue {
  const from = state.position
  const operator = COMPARE_OPERATORS.find(candidate => state.text.startsWith(candidate, from))
  if (operator != undefined) {
    mark(state, HIGHLIGHT_KIND.comparison, operator.length)
    const operand = readValueChunk(state, isValueEnd)
    return { kind: 'compare', operator, raw: operand.value, quoted: operand.quoted, span: { from, to: state.position } }
  }
  const min = readValueChunk(state, isBoundEnd)
  if (!state.text.startsWith(RANGE_SEPARATOR, state.position)) {
    return { kind: 'equal', raw: min.value, quoted: min.quoted, span: { from, to: state.position } }
  }
  const separator = { from: state.position, to: state.position + RANGE_SEPARATOR.length }
  mark(state, HIGHLIGHT_KIND.range, RANGE_SEPARATOR.length)
  const max = readValueChunk(state, isValueEnd)
  return { kind: 'range', min: toBound(min), max: toBound(max), separator, span: { from, to: state.position } }
}

function readValueChunk(state: ParseState, isEnd: (state: ParseState) => boolean): Chunk {
  const from = state.position
  const chunk = readChunk(state, isEnd)
  reportUnclosedQuote(state, chunk)
  if (state.position > from) state.highlights.push({ from, to: state.position, kind: valueHighlight(chunk) })
  return chunk
}

function valueHighlight(chunk: Chunk): HighlightKind {
  return !chunk.quoted && chunk.value.startsWith('@') ? HIGHLIGHT_KIND.dynamic : HIGHLIGHT_KIND.value
}

function toBound(chunk: Chunk): RangeBound | undefined {
  if (chunk.value == '' || (chunk.value == '*' && !chunk.quoted)) return undefined
  return { raw: chunk.value, quoted: chunk.quoted }
}

function readChunk(state: ParseState, isEnd: (state: ParseState) => boolean): Chunk {
  const start = state.position
  const chunk: Chunk = { value: '', quoted: false }
  while (!isAtEnd(state) && !isEnd(state)) {
    const char = state.text[state.position]
    if (char == '"' || (char == "'" && state.position == start)) {
      const quoted = readQuoted(state, char)
      chunk.value += quoted.value
      chunk.quoted = true
      chunk.unclosedQuote ??= quoted.unclosedQuote
    } else {
      chunk.value += char
      state.position++
    }
  }
  return chunk
}

function readQuoted(state: ParseState, quote: string): Omit<Chunk, 'quoted'> {
  const from = state.position
  let value = ''
  state.position++
  while (!isAtEnd(state)) {
    const char = state.text[state.position]
    const next = state.text.at(state.position + 1)
    if (char == '\\' && (next == quote || next == '\\')) {
      value += next
      state.position += 2
    } else {
      state.position++
      if (char == quote) return { value }
      value += char
    }
  }
  return { value, unclosedQuote: { from, to: state.position } }
}

function reportUnclosedQuote(state: ParseState, chunk: Chunk): void {
  if (chunk.unclosedQuote != undefined) report(state, DIAGNOSTIC_CODE.unclosedQuote, chunk.unclosedQuote)
}

function combine(type: SyntaxGroup['type'], nodes: Array<SyntaxNode>, span: Span): SyntaxNode {
  const children = nodes.filter(node => !isEmptyGroup(node))
  if (children.length == 1) return children[0]
  if (children.length == 0) return emptyGroup(span)
  return { type, children, span: { from: children[0].span.from, to: children[children.length - 1].span.to } }
}

function emptyGroup(span: Span): SyntaxGroup {
  return { type: 'and', children: [], span }
}

function isGroup(node: SyntaxNode): node is SyntaxGroup {
  return node.type == 'and' || node.type == 'or'
}

function isEmptyGroup(node: SyntaxNode): boolean {
  return isGroup(node) && node.children.length == 0
}

function isKeywordAt(state: ParseState, keyword: string): boolean {
  return state.text.startsWith(keyword, state.position) && isBoundary(state.text.at(state.position + keyword.length))
}

function isBoundary(char: string | undefined): boolean {
  return char == undefined || char == '(' || char == ')' || isWhitespace(char)
}

function startsOperand(state: ParseState): boolean {
  return startsOperandAt(state, state.position) && !isKeywordAt(state, 'OR') && !isKeywordAt(state, 'AND')
}

function startsOperandAt(state: ParseState, position: number): boolean {
  const char = state.text.at(position)
  return char != undefined && char != ')' && !isWhitespace(char)
}

function closesGroup(state: ParseState, depth: number): boolean {
  return depth > 0 && currentChar(state) == ')'
}

function isKeyEnd(state: ParseState): boolean {
  return isWordEnd(state) || currentChar(state) == ':'
}

function isWordEnd(state: ParseState): boolean {
  const char = currentChar(state)
  return char == '(' || char == ')' || isWhitespace(char)
}

function isValueEnd(state: ParseState): boolean {
  return isWordEnd(state) || currentChar(state) == ','
}

function isBoundEnd(state: ParseState): boolean {
  return isValueEnd(state) || state.text.startsWith(RANGE_SEPARATOR, state.position)
}

function skipWhitespace(state: ParseState): void {
  while (isWhitespace(currentChar(state))) state.position++
}

function isWhitespace(char: string | undefined): boolean {
  return char != undefined && WHITESPACE.test(char)
}

function isAtEnd(state: ParseState): boolean {
  return state.position >= state.text.length
}

function currentChar(state: ParseState): string | undefined {
  return state.text.at(state.position)
}

function mark(state: ParseState, kind: HighlightKind, length: number): void {
  state.highlights.push({ from: state.position, to: state.position + length, kind })
  state.position += length
}

function report(state: ParseState, code: DiagnosticCode, span: Span): void {
  state.diagnostics.push(createDiagnostic(code, span))
}
