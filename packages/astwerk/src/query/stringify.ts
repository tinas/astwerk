import type { Schema } from '../schema/schema'
import type {
  CompareOperator,
  RangeBound,
  RawValue,
  Span,
  SyntaxNode,
  SyntaxOf,
  SyntaxTerm,
} from '../syntax/syntax-tree'
import type { Bound, Query, QueryOf } from './query'

import { findField } from '../schema/schema'
import { isTokenValue } from '../schema/token'
import { parse } from '../syntax/parse'
import { writeSyntax } from '../syntax/write'
import { bind } from './bind'
import { normalize } from './normalize'

type Unbinder<Type extends Query['type']> = (query: QueryOf<Type>, schema: Schema) => SyntaxNode

type SyntaxNegator<Type extends SyntaxNode['type']> = (node: SyntaxOf<Type>) => SyntaxNode

const NO_SPAN: Span = { from: 0, to: 0 }

const UNBIND_BY_TYPE: { [Type in Query['type']]: Unbinder<Type> } = {
  and: (query, schema) =>
    group(
      'and',
      query.children.map(child => unbindNode(child, schema)),
    ),
  or: unbindOr,
  not: (query, schema) => unbindNegated(query.child, schema),
  in: (query, schema) =>
    term(
      query.field,
      query.values.map(value => equalValue(value, query.field, schema)),
    ),
  range: unbindRange,
  text: query => ({ type: 'text', value: query.value, quoted: true, span: NO_SPAN }),
  empty: query => term('no', [{ kind: 'equal', raw: query.field, quoted: true, span: NO_SPAN }]),
  match: query => term(query.field, [{ kind: 'equal', raw: query.pattern, quoted: false, span: NO_SPAN }]),
  invalid: query => query.syntax,
}

const UNBIND_NEGATED_BY_TYPE: { [Type in Query['type']]: Unbinder<Type> } = {
  and: (query, schema) => negateSyntax(unbindNode(query, schema)),
  or: (query, schema) => negateSyntax(unbindNode(query, schema)),
  not: (query, schema) => unbindNode(query.child, schema),
  in: (query, schema) => negateSyntax(unbindNode(query, schema)),
  range: (query, schema) => negateSyntax(unbindNode(query, schema)),
  text: (query, schema) => negateSyntax(unbindNode(query, schema)),
  empty: query => term('has', [{ kind: 'equal', raw: query.field, quoted: true, span: NO_SPAN }]),
  match: (query, schema) => negateSyntax(unbindNode(query, schema)),
  invalid: query => ({ type: 'not', child: query.syntax, span: NO_SPAN }),
}

const NEGATE_SYNTAX_BY_TYPE: { [Type in SyntaxNode['type']]: SyntaxNegator<Type> } = {
  and: node => group('or', node.children.map(negateSyntax)),
  or: node => group('and', node.children.map(negateSyntax)),
  not: node => node.child,
  term: node => ({ type: 'not', child: node, span: NO_SPAN }),
  text: node => ({ type: 'not', child: node, span: NO_SPAN }),
}

/**
 * Writes a query as canonical text. A negated group is written by negating its parts, and an `OR` of one field's
 * values as one comma list.
 */
export function stringify(query: Query, schema: Schema): string {
  return writeSyntax(unbindNode(normalize(query, schema), schema))
}

/** The canonical form of a query text. Writing a canonical text again changes nothing. */
export function canonical(text: string, schema: Schema): string {
  return stringify(bind(parse(text).tree, schema).query, schema)
}

function unbindNode(query: Query, schema: Schema): SyntaxNode {
  const unbinder = UNBIND_BY_TYPE[query.type] as Unbinder<Query['type']>
  return unbinder(query, schema)
}

function unbindNegated(query: Query, schema: Schema): SyntaxNode {
  const unbinder = UNBIND_NEGATED_BY_TYPE[query.type] as Unbinder<Query['type']>
  return unbinder(query, schema)
}

function negateSyntax(node: SyntaxNode): SyntaxNode {
  const negator = NEGATE_SYNTAX_BY_TYPE[node.type] as SyntaxNegator<SyntaxNode['type']>
  return negator(node)
}

function unbindOr(query: QueryOf<'or'>, schema: Schema): SyntaxNode {
  const children = query.children.map(child => unbindNode(child, schema))
  const terms = children.filter((child): child is SyntaxTerm => child.type == 'term')
  const sameKey = terms.length == children.length && terms.every(child => child.key == terms[0].key)
  return sameKey
    ? term(
        terms[0].key,
        terms.flatMap(child => child.values),
      )
    : group('or', children)
}

function unbindRange(query: QueryOf<'range'>, schema: Schema): SyntaxNode {
  const { min, max, field } = query
  if (min != undefined && max != undefined && min.inclusive && max.inclusive) {
    const value: RawValue = {
      kind: 'range',
      min: rangeBound(min, field, schema),
      max: rangeBound(max, field, schema),
      separator: NO_SPAN,
      span: NO_SPAN,
    }
    return term(field, [value])
  }
  const terms = [
    min && term(field, [compareValue(min.inclusive ? '>=' : '>', min, field, schema)]),
    max && term(field, [compareValue(max.inclusive ? '<=' : '<', max, field, schema)]),
  ]
  return group(
    'and',
    terms.filter(part => part != undefined),
  )
}

function equalValue(value: unknown, field: string, schema: Schema): RawValue {
  return { kind: 'equal', ...writtenValue(value, field, schema), span: NO_SPAN }
}

function compareValue(operator: CompareOperator, bound: Bound, field: string, schema: Schema): RawValue {
  return { kind: 'compare', operator, ...writtenValue(bound.value, field, schema), span: NO_SPAN }
}

function rangeBound(bound: Bound, field: string, schema: Schema): RangeBound {
  return writtenValue(bound.value, field, schema)
}

function writtenValue(value: unknown, field: string, schema: Schema): RangeBound {
  if (isTokenValue(value)) return { raw: value.raw, quoted: false }
  const type = findField(schema, field)?.type
  return { raw: type == undefined ? String(value) : type.format(value), quoted: true }
}

function term(key: string, values: Array<RawValue>): SyntaxTerm {
  return { type: 'term', key, keySpan: NO_SPAN, values, span: NO_SPAN }
}

function group(type: 'and' | 'or', children: Array<SyntaxNode>): SyntaxNode {
  return children.length == 1 ? children[0] : { type, children, span: NO_SPAN }
}
