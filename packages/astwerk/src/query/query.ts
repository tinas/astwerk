import type { SyntaxNode } from '../syntax/syntax-tree'
import type { OfType } from '../types'

export interface QueryGroup {
  type: 'and' | 'or'
  children: Array<Query>
}

export interface QueryNot {
  type: 'not'
  child: Query
}

/** Values are the field type's values, or a `TokenValue` for a dynamic value such as `@me`. */
export interface InCondition {
  type: 'in'
  field: string
  values: Array<unknown>
}

export interface Bound {
  value: unknown
  inclusive: boolean
}

export interface RangeCondition {
  type: 'range'
  field: string
  min?: Bound
  max?: Bound
}

export interface TextCondition {
  type: 'text'
  value: string
}

/** A field with no value, written `no:field`. `has:field` is its negation. */
export interface EmptyCondition {
  type: 'empty'
  field: string
}

/** A value with wildcards, where each `*` in `pattern` stands for any text. */
export interface MatchCondition {
  type: 'match'
  field: string
  pattern: string
}

/**
 * Text that could not be bound, kept as written so that it stays in the text. `fold` and `toPredicate` skip it, so it
 * filters nothing. A single invalid value of a known field is kept as a term of that field.
 */
export interface InvalidQuery {
  type: 'invalid'
  syntax: SyntaxNode
}

export type Condition = InCondition | RangeCondition | TextCondition | EmptyCondition | MatchCondition

export type FieldCondition = Exclude<Condition, TextCondition>

export type Query = QueryGroup | QueryNot | Condition | InvalidQuery

export type QueryOf<Type extends Query['type']> = OfType<Query, Type>

export function emptyQuery(): QueryGroup {
  return { type: 'and', children: [] }
}

export function rangeCondition(field: string, min: Bound | undefined, max: Bound | undefined): RangeCondition {
  return { type: 'range', field, ...definedBounds(min, max) }
}

export function definedBounds(min: Bound | undefined, max: Bound | undefined): Pick<RangeCondition, 'min' | 'max'> {
  return { ...(min != undefined && { min }), ...(max != undefined && { max }) }
}

export function isQueryGroup(query: Query): query is QueryGroup {
  return query.type == 'and' || query.type == 'or'
}

export function anyOf(queries: Array<Query>): Query | undefined {
  return queries.length <= 1 ? queries[0] : { type: 'or', children: queries }
}

export function allOf(queries: Array<Query>): Query | undefined {
  return queries.length <= 1 ? queries[0] : { type: 'and', children: queries }
}
