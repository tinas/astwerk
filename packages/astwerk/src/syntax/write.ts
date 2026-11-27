import type {
  CompareValue,
  EqualValue,
  RangeBound,
  RangeValue,
  RawValue,
  SyntaxNode,
  SyntaxOf,
  SyntaxTerm,
} from './syntax-tree'

import { parse } from './parse'

type NodeWriter<Type extends SyntaxNode['type']> = (node: SyntaxOf<Type>) => string

type ValueWriter<Kind extends RawValue['kind']> = (value: Extract<RawValue, { kind: Kind }>) => string

const PROBE_KEY = 'k'
const PROBE_VALUE = 'v'
const RANGE_SEPARATOR = '..'

const WRITE_BY_TYPE: { [Type in SyntaxNode['type']]: NodeWriter<Type> } = {
  and: node => joinWritten(node.children.map(writeAndOperand), ' '),
  or: node => joinWritten(node.children.map(writeSyntax), ' OR '),
  not: node => writeNegated(node.child),
  term: node => `${writeKey(node.key)}:${node.values.map(writeValue).join(',')}`,
  text: node => writeText(node.value),
}

const WRITE_NEGATED_BY_TYPE: { [Type in SyntaxNode['type']]: NodeWriter<Type> } = {
  and: node => `-(${writeSyntax(node)})`,
  or: node => `-(${writeSyntax(node)})`,
  not: node => `NOT ${writeSyntax(node)}`,
  term: node => `-${writeSyntax(node)}`,
  text: node => `-${writeSyntax(node)}`,
}

const WRITE_VALUE_BY_KIND: { [Kind in RawValue['kind']]: ValueWriter<Kind> } = {
  equal: writeEqual,
  compare: writeCompare,
  range: writeRange,
}

/** Writes a tree as text, with parentheses only around an `OR` inside an `AND`. */
export function writeSyntax(node: SyntaxNode): string {
  const writer = WRITE_BY_TYPE[node.type] as NodeWriter<SyntaxNode['type']>
  return writer(node)
}

export function writeKey(key: string): string {
  if (readsAsKey(key, key)) return key
  const segmented = key
    .split('.')
    .map(segment => (readsAsKey(segment, segment) ? segment : quote(segment)))
    .join('.')
  return readsAsKey(segmented, key) ? segmented : quote(key)
}

export function writeValue(value: RawValue): string {
  const writer = WRITE_VALUE_BY_KIND[value.kind] as ValueWriter<RawValue['kind']>
  return writer(value)
}

export function writeText(value: string): string {
  const { tree, diagnostics } = parse(value)
  const readsBack = diagnostics.length == 0 && tree.type == 'text' && !tree.quoted && tree.value == value
  return readsBack ? value : quote(value)
}

function writeAndOperand(node: SyntaxNode): string {
  const text = writeSyntax(node)
  return node.type == 'or' && node.children.length > 1 ? `(${text})` : text
}

function writeNegated(node: SyntaxNode): string {
  const writer = WRITE_NEGATED_BY_TYPE[node.type] as NodeWriter<SyntaxNode['type']>
  return writer(node)
}

function joinWritten(parts: Array<string>, separator: string): string {
  return parts.filter(part => part != '').join(separator)
}

function writeEqual(value: EqualValue): string {
  if (value.raw == '') return ''
  const plain = !value.quoted || (!value.raw.startsWith('@') && !value.raw.includes('*'))
  const read = probeValue(value.raw)
  const readsBack = plain && read?.kind == 'equal' && !read.quoted && read.raw == value.raw
  return readsBack ? value.raw : quote(value.raw)
}

function writeCompare(value: CompareValue): string {
  const read = probeValue(`${value.operator}${value.raw}`)
  const readsBack =
    isPlainBound(value) &&
    read?.kind == 'compare' &&
    read.operator == value.operator &&
    !read.quoted &&
    read.raw == value.raw
  return `${value.operator}${readsBack ? value.raw : quote(value.raw)}`
}

function writeRange(value: RangeValue): string {
  return `${writeBound(value.min, 'min')}${RANGE_SEPARATOR}${writeBound(value.max, 'max')}`
}

function writeBound(bound: RangeBound | undefined, side: 'min' | 'max'): string {
  if (bound == undefined) return ''
  const probe = side == 'min' ? `${bound.raw}${RANGE_SEPARATOR}` : `${RANGE_SEPARATOR}${bound.raw}`
  const read = probeValue(probe)
  const readBound = read?.kind == 'range' ? read[side] : undefined
  const readsBack = isPlainBound(bound) && readBound != undefined && !readBound.quoted && readBound.raw == bound.raw
  return readsBack ? bound.raw : quote(bound.raw)
}

function isPlainBound(bound: { raw: string; quoted: boolean }): boolean {
  return !bound.quoted || (bound.raw != '*' && !bound.raw.startsWith('@'))
}

function probeValue(written: string): RawValue | undefined {
  const { tree, diagnostics } = parse(`${PROBE_KEY}:${written}`)
  if (diagnostics.length > 0 || !isProbeTerm(tree, PROBE_KEY) || tree.values.length != 1) return undefined
  return tree.values[0]
}

function readsAsKey(written: string, key: string): boolean {
  const { tree, diagnostics } = parse(`${written}:${PROBE_VALUE}`)
  return diagnostics.length == 0 && isProbeTerm(tree, key) && tree.values.length == 1
}

function isProbeTerm(tree: SyntaxNode, key: string): tree is SyntaxTerm {
  return tree.type == 'term' && tree.key == key
}

function quote(raw: string): string {
  return `"${raw.replace(/[\\"]/g, match => `\\${match}`)}"`
}
