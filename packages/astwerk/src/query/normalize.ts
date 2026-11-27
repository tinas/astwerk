import type { Schema } from '../schema/schema'
import type { Query, QueryGroup, QueryOf, RangeCondition } from './query'

import { findField } from '../schema/schema'
import { allOf, anyOf, emptyQuery, isQueryGroup } from './query'
import { intersectRanges } from './ranges'

type Normalizer<Type extends Query['type']> = (query: QueryOf<Type>, schema: Schema) => Query | undefined

const NORMALIZE_BY_TYPE: { [Type in Query['type']]: Normalizer<Type> } = {
  and: (query, schema) => allOf(mergeRanges(flatten(query, schema), schema)),
  or: (query, schema) => anyOf(flatten(query, schema)),
  not: normalizeNot,
  in: query => (query.values.length == 0 ? undefined : query),
  range: query => (query.min == undefined && query.max == undefined ? undefined : query),
  text: query => (query.value == '' ? undefined : query),
  empty: query => query,
  match: query => query,
  invalid: query => query,
}

/** Flattens nested groups of one type, drops empty parts and double negations, and intersects ranges. */
export function normalize(query: Query, schema: Schema): Query {
  return normalizeNode(query, schema) ?? emptyQuery()
}

function normalizeNode(query: Query, schema: Schema): Query | undefined {
  const normalizer = NORMALIZE_BY_TYPE[query.type] as Normalizer<Query['type']>
  return normalizer(query, schema)
}

function flatten(group: QueryGroup, schema: Schema): Array<Query> {
  return group.children.flatMap(child => {
    const normalized = normalizeNode(child, schema)
    if (normalized == undefined) return []
    return isQueryGroup(normalized) && normalized.type == group.type ? normalized.children : [normalized]
  })
}

function normalizeNot(query: QueryOf<'not'>, schema: Schema): Query | undefined {
  const child = normalizeNode(query.child, schema)
  if (child == undefined) return undefined
  return child.type == 'not' ? child.child : { type: 'not', child }
}

function mergeRanges(children: Array<Query>, schema: Schema): Array<Query> {
  const merged: Array<Query> = []
  for (const child of children) {
    const index =
      child.type == 'range' ? merged.findIndex(other => other.type == 'range' && other.field == child.field) : -1
    const previous = merged[index]
    const range = previous?.type == 'range' && child.type == 'range' ? mergeRange(previous, child, schema) : undefined
    if (range == undefined) merged.push(child)
    else merged[index] = range
  }
  return merged
}

function mergeRange(a: RangeCondition, b: RangeCondition, schema: Schema): RangeCondition | undefined {
  const type = findField(schema, a.field)?.type
  if (type == undefined) return undefined
  const intersection = intersectRanges(a, b, type)
  return intersection.kind == 'merged' ? intersection.range : undefined
}
