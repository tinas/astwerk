import type { Diagnostic, DiagnosticCode } from '../diagnostics'
import type { FieldType, TokenDefinition } from '../schema/field-type'
import type { PresenceKey, Schema } from '../schema/schema'
import type { TokenOffset } from '../schema/token'
import type {
  CompareOperator,
  CompareValue,
  EqualValue,
  RangeBound,
  RangeValue,
  RawValue,
  Span,
  SyntaxGroup,
  SyntaxNode,
  SyntaxOf,
  SyntaxTerm,
} from '../syntax/syntax-tree'
import type { Bound, Query, RangeCondition } from './query'

import { createDiagnostic, DIAGNOSTIC_CODE } from '../diagnostics'
import { isPresenceKey } from '../schema/schema'
import { readToken } from '../schema/token'
import { normalize } from './normalize'
import { allOf, anyOf, emptyQuery, rangeCondition } from './query'
import { intersectRanges, isEmptyRange } from './ranges'

export interface BindResult {
  query: Query
  diagnostics: Array<Diagnostic>
}

interface BindContext {
  schema: Schema
  diagnostics: Array<Diagnostic>
}

interface ValueTarget {
  field: string
  type: FieldType<unknown>
}

interface TypedValue {
  value: unknown
}

interface BoundEntry {
  query: Query
  span: Span
}

type NodeBinder<Type extends SyntaxNode['type']> = (node: SyntaxOf<Type>, context: BindContext) => Query | undefined

type ValueBinder<Kind extends RawValue['kind']> = (
  value: Extract<RawValue, { kind: Kind }>,
  target: ValueTarget,
  context: BindContext,
) => Query

const BIND_BY_TYPE: { [Type in SyntaxNode['type']]: NodeBinder<Type> } = {
  and: bindAnd,
  or: (node, context) => anyOf(bindChildren(node.children, context).map(entry => entry.query)),
  not: bindNot,
  term: bindTerm,
  text: node => (node.value == '' ? undefined : { type: 'text', value: node.value }),
}

const BIND_VALUE_BY_KIND: { [Kind in RawValue['kind']]: ValueBinder<Kind> } = {
  equal: bindEqual,
  compare: bindCompare,
  range: bindRange,
}

const IS_EMPTY_BY_KIND: { [Kind in RawValue['kind']]: (value: Extract<RawValue, { kind: Kind }>) => boolean } = {
  equal: value => value.raw == '',
  compare: value => value.raw == '' || isOpenBound(value),
  range: value => value.min == undefined && value.max == undefined,
}

const BOUND_BY_OPERATOR: Record<CompareOperator, { side: 'min' | 'max'; inclusive: boolean }> = {
  '>=': { side: 'min', inclusive: true },
  '>': { side: 'min', inclusive: false },
  '<=': { side: 'max', inclusive: true },
  '<': { side: 'max', inclusive: false },
}

const PRESENCE_QUERY: Record<PresenceKey, (field: string) => Query> = {
  has: field => ({ type: 'not', child: { type: 'empty', field } }),
  no: field => ({ type: 'empty', field }),
}

/**
 * Applies a schema to a syntax tree. Unknown fields, invalid values and unknown tokens become diagnostics and stay in
 * the query as written, so they stay in the text and filter nothing.
 */
export function bind(tree: SyntaxNode, schema: Schema): BindResult {
  const context: BindContext = { schema, diagnostics: [] }
  const query = bindNode(tree, context) ?? emptyQuery()
  return { query: normalize(query, schema), diagnostics: context.diagnostics }
}

function bindNode(node: SyntaxNode, context: BindContext): Query | undefined {
  const binder = BIND_BY_TYPE[node.type] as NodeBinder<SyntaxNode['type']>
  return binder(node, context)
}

function bindChildren(children: Array<SyntaxNode>, context: BindContext): Array<BoundEntry> {
  return children.flatMap(child => {
    const query = bindNode(child, context)
    return query == undefined ? [] : [{ query, span: child.span }]
  })
}

function bindAnd(node: SyntaxGroup, context: BindContext): Query | undefined {
  const entries = bindChildren(flattenAnd(node), context)
  reportEmptyIntersections(entries, context)
  return allOf(entries.map(entry => entry.query))
}

function flattenAnd(node: SyntaxGroup): Array<SyntaxNode> {
  return node.children.flatMap(child => (child.type == 'and' ? flattenAnd(child) : [child]))
}

function reportEmptyIntersections(entries: Array<BoundEntry>, context: BindContext): void {
  const ranges = entries.filter((entry): entry is BoundEntry & { query: RangeCondition } => entry.query.type == 'range')
  ranges.forEach((first, index) => {
    const type = context.schema.fields[first.query.field].type
    for (const second of ranges.slice(index + 1)) {
      if (second.query.field != first.query.field) continue
      if (intersectRanges(first.query, second.query, type).kind == 'empty') {
        report(context, DIAGNOSTIC_CODE.emptyRange, { from: first.span.from, to: second.span.to })
      }
    }
  })
}

function bindNot(node: SyntaxOf<'not'>, context: BindContext): Query | undefined {
  if (node.child.type == 'and' || node.child.type == 'or') return { type: 'invalid', syntax: node }
  const child = bindNode(node.child, context)
  return child == undefined ? undefined : { type: 'not', child }
}

function bindTerm(node: SyntaxTerm, context: BindContext): Query | undefined {
  const values = node.values.filter(value => !isEmptyValue(value))
  if (values.length == 0) return undefined
  const term = { ...node, values }
  const { key } = term
  if (isPresenceKey(key)) return anyOf(values.map(value => bindPresence(key, value, context)))
  const field = context.schema['~names'].get(key)
  if (field == undefined) {
    report(context, DIAGNOSTIC_CODE.unknownField, term.keySpan)
    return { type: 'invalid', syntax: term }
  }
  const target = { field, type: context.schema.fields[field].type }
  return anyOf(mergeAdjacentIn(values.map(value => bindValue(value, target, context))))
}

function bindPresence(key: PresenceKey, value: RawValue, context: BindContext): Query {
  if (value.kind != 'equal') return rejectValue(key, value, DIAGNOSTIC_CODE.unsupportedOperator, context)
  const field = context.schema['~names'].get(value.raw)
  if (field == undefined) return rejectValue(key, value, DIAGNOSTIC_CODE.unknownField, context)
  return PRESENCE_QUERY[key](field)
}

function bindValue(value: RawValue, target: ValueTarget, context: BindContext): Query {
  const binder = BIND_VALUE_BY_KIND[value.kind] as ValueBinder<RawValue['kind']>
  return binder(value, target, context)
}

function bindEqual(value: EqualValue, target: ValueTarget, context: BindContext): Query {
  if (isOpenBound(value)) return PRESENCE_QUERY.has(target.field)
  if (!value.quoted && value.raw.includes('*')) {
    if (target.type.wildcards) return { type: 'match', field: target.field, pattern: value.raw }
    return rejectValue(target.field, value, DIAGNOSTIC_CODE.unsupportedOperator, context)
  }
  const typed = readValue(value.raw, value.quoted, value.span, target, context)
  if (typed == undefined) return invalidValue(target.field, value)
  return { type: 'in', field: target.field, values: [typed.value] }
}

function bindCompare(value: CompareValue, target: ValueTarget, context: BindContext): Query {
  if (target.type.compare == undefined) {
    return rejectValue(target.field, value, DIAGNOSTIC_CODE.unsupportedOperator, context)
  }
  const typed = readValue(value.raw, value.quoted, value.span, target, context)
  if (typed == undefined) return invalidValue(target.field, value)
  const { side, inclusive } = BOUND_BY_OPERATOR[value.operator]
  const bound = { value: typed.value, inclusive }
  return side == 'min' ? rangeCondition(target.field, bound, undefined) : rangeCondition(target.field, undefined, bound)
}

function bindRange(value: RangeValue, target: ValueTarget, context: BindContext): Query {
  if (target.type.compare == undefined) {
    return rejectValue(target.field, value, DIAGNOSTIC_CODE.unsupportedOperator, context)
  }
  const min = readBound(value.min, value.span, target, context)
  const max = readBound(value.max, value.span, target, context)
  if (min == undefined || max == undefined) return invalidValue(target.field, value)
  const range = rangeCondition(target.field, min.bound, max.bound)
  if (isEmptyRange(range, target.type)) report(context, DIAGNOSTIC_CODE.emptyRange, value.span)
  return range
}

function readBound(
  bound: RangeBound | undefined,
  span: Span,
  target: ValueTarget,
  context: BindContext,
): { bound?: Bound } | undefined {
  if (bound == undefined) return {}
  const typed = readValue(bound.raw, bound.quoted, span, target, context)
  return typed == undefined ? undefined : { bound: { value: typed.value, inclusive: true } }
}

function readValue(
  raw: string,
  quoted: boolean,
  span: Span,
  target: ValueTarget,
  context: BindContext,
): TypedValue | undefined {
  if (!quoted && raw.startsWith('@')) return readTokenValue(raw, span, target, context)
  const value = target.type.parse(raw)
  if (value == undefined) report(context, DIAGNOSTIC_CODE.invalidValue, span)
  return value == undefined ? undefined : { value }
}

function readTokenValue(raw: string, span: Span, target: ValueTarget, context: BindContext): TypedValue | undefined {
  const token = readToken(raw)
  const tokens = target.type.tokens ?? {}
  const definition = token != undefined && Object.hasOwn(tokens, token.name) ? tokens[token.name] : undefined
  if (token == undefined || definition == undefined || !acceptsOffset(definition, token.offset)) {
    report(context, DIAGNOSTIC_CODE.unknownToken, span)
    return undefined
  }
  return { value: token }
}

function acceptsOffset(definition: TokenDefinition<unknown>, offset: TokenOffset | undefined): boolean {
  if (offset == undefined) return true
  const units = definition.offsetUnits
  if (units == undefined || !Number.isSafeInteger(offset.amount)) return false
  return offset.unit == undefined || units.includes(offset.unit)
}

function mergeAdjacentIn(queries: Array<Query>): Array<Query> {
  const merged: Array<Query> = []
  for (const query of queries) {
    const previous = merged.at(-1)
    if (query.type == 'in' && previous?.type == 'in') {
      merged[merged.length - 1] = { ...previous, values: [...previous.values, ...query.values] }
    } else {
      merged.push(query)
    }
  }
  return merged
}

function rejectValue(key: string, value: RawValue, code: DiagnosticCode, context: BindContext): Query {
  report(context, code, value.span)
  return invalidValue(key, value)
}

function invalidValue(key: string, value: RawValue): Query {
  return { type: 'invalid', syntax: { type: 'term', key, keySpan: value.span, values: [value], span: value.span } }
}

function isEmptyValue(value: RawValue): boolean {
  const isEmpty = IS_EMPTY_BY_KIND[value.kind] as (value: RawValue) => boolean
  return isEmpty(value)
}

function isOpenBound(value: EqualValue | CompareValue): boolean {
  return value.raw == '*' && !value.quoted
}

function report(context: BindContext, code: DiagnosticCode, span: Span): void {
  context.diagnostics.push(createDiagnostic(code, span))
}
