import type { Schema } from '../schema/schema'
import type { FieldCondition, Query, QueryOf } from './query'

import { findField } from '../schema/schema'
import { allOf, anyOf, emptyQuery } from './query'

type Preparer<Type extends Query['type']> = (query: QueryOf<Type>, schema: Schema) => Query | undefined

const PREPARE_BY_TYPE: { [Type in Query['type']]: Preparer<Type> } = {
  and: (query, schema) => allOf(prepareChildren(query.children, schema)),
  or: (query, schema) => anyOf(prepareChildren(query.children, schema)),
  not: (query, schema) => {
    const child = prepareNode(query.child, schema)
    return child == undefined ? undefined : { type: 'not', child }
  },
  in: expandCondition,
  range: expandCondition,
  text: query => query,
  empty: expandCondition,
  match: expandCondition,
  invalid: () => undefined,
}

/**
 * The query as it filters: unbound parts left out and fields with `expand` replaced by what they stand for. A query
 * with nothing left is an empty `and`.
 */
export function evaluable(query: Query, schema: Schema): Query {
  return prepareNode(query, schema) ?? emptyQuery()
}

function prepareNode(query: Query, schema: Schema): Query | undefined {
  const preparer = PREPARE_BY_TYPE[query.type] as Preparer<Query['type']>
  return preparer(query, schema)
}

function prepareChildren(children: Array<Query>, schema: Schema): Array<Query> {
  return children.flatMap(child => prepareNode(child, schema) ?? [])
}

function expandCondition(condition: FieldCondition, schema: Schema): Query | undefined {
  const expand = findField(schema, condition.field)?.expand
  if (expand == undefined) return condition
  const expanded = expand(condition)
  return expanded == undefined ? undefined : prepareNode(expanded, schema)
}
