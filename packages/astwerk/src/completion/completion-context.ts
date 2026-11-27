import type {
  CompareOperator,
  RawValue,
  Span,
  SyntaxNode,
  SyntaxOf,
  SyntaxTerm,
  SyntaxText,
} from '../syntax/syntax-tree'

import { parse } from '../syntax/parse'

/** The cursor is on a word that may become a field name. Replacing `from` to `to` replaces the key and its colon. */
export interface KeyCompletion {
  kind: 'key'
  prefix: string
  from: number
  to: number
}

/** The cursor is on a value of `key`. `taken` holds the term's other values, and `operator` a written comparison. */
export interface ValueCompletion {
  kind: 'value'
  key: string
  prefix: string
  from: number
  to: number
  taken: Array<string>
  atEnd: boolean
  operator?: CompareOperator
}

export type CompletionContext = KeyCompletion | ValueCompletion

type LeafFinder<Type extends SyntaxNode['type']> = (
  node: SyntaxOf<Type>,
  cursor: number,
) => SyntaxTerm | SyntaxText | undefined

type ValueSpanReader<Kind extends RawValue['kind']> = (
  value: Extract<RawValue, { kind: Kind }>,
  cursor: number,
) => Span & { operator?: CompareOperator }

const FIND_LEAF_BY_TYPE: { [Type in SyntaxNode['type']]: LeafFinder<Type> } = {
  and: (node, cursor) => findInChildren(node.children, cursor),
  or: (node, cursor) => findInChildren(node.children, cursor),
  not: (node, cursor) => findLeaf(node.child, cursor),
  term: (node, cursor) => (contains(node.span, cursor) ? node : undefined),
  text: (node, cursor) => (contains(node.span, cursor) ? node : undefined),
}

const VALUE_SPAN_BY_KIND: { [Kind in RawValue['kind']]: ValueSpanReader<Kind> } = {
  equal: value => value.span,
  compare: value => ({ from: value.span.from + value.operator.length, to: value.span.to, operator: value.operator }),
  range: (value, cursor) =>
    cursor <= value.separator.from
      ? { from: value.span.from, to: value.separator.from }
      : { from: value.separator.to, to: value.span.to },
}

/**
 * What the cursor is on, for autocompletion. Returns `undefined` inside quoted free text, where nothing is suggested.
 */
export function getCompletionContext(text: string, cursor: number): CompletionContext | undefined {
  const leaf = findLeaf(parse(text).tree, cursor)
  if (leaf == undefined) return { kind: 'key', prefix: '', from: cursor, to: cursor }
  if (leaf.type == 'text') return leaf.quoted ? undefined : keyCompletion(text, leaf.span, cursor)
  if (cursor <= leaf.keySpan.to)
    return keyCompletion(text, { from: leaf.keySpan.from, to: leaf.keySpan.to + 1 }, cursor)
  return valueCompletion(text, leaf, cursor)
}

function keyCompletion(text: string, span: Span, cursor: number): KeyCompletion {
  const from = text[span.from] == '-' ? span.from + 1 : span.from
  return { kind: 'key', prefix: text.slice(from, cursor), from, to: span.to }
}

function valueCompletion(text: string, term: SyntaxTerm, cursor: number): ValueCompletion {
  const value = term.values.find(candidate => contains(candidate.span, cursor)) ?? term.values[term.values.length - 1]
  const readSpan = VALUE_SPAN_BY_KIND[value.kind] as ValueSpanReader<RawValue['kind']>
  const { operator, ...span } = readSpan(value, cursor)
  const from = Math.min(span.from, cursor)
  return {
    kind: 'value',
    key: term.key,
    prefix: unquote(text.slice(from, cursor)),
    from,
    to: span.to,
    taken: term.values.flatMap(other =>
      other != value && other.kind == 'equal' && other.raw != '' ? [other.raw] : [],
    ),
    atEnd: cursor == term.span.to,
    ...(operator != undefined && { operator }),
  }
}

function findLeaf(node: SyntaxNode, cursor: number): SyntaxTerm | SyntaxText | undefined {
  const finder = FIND_LEAF_BY_TYPE[node.type] as LeafFinder<SyntaxNode['type']>
  return finder(node, cursor)
}

function findInChildren(children: Array<SyntaxNode>, cursor: number): SyntaxTerm | SyntaxText | undefined {
  for (const child of children) {
    const leaf = findLeaf(child, cursor)
    if (leaf != undefined) return leaf
  }
  return undefined
}

function contains(span: Span, cursor: number): boolean {
  return span.from <= cursor && cursor <= span.to
}

function unquote(prefix: string): string {
  return prefix.startsWith('"') || prefix.startsWith("'") ? prefix.slice(1) : prefix
}
