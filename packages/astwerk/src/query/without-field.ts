import type { Query, QueryOf } from './query'

import { allOf, anyOf, emptyQuery } from './query'

type Remover<Type extends Query['type']> = (query: QueryOf<Type>, field: string) => Query | undefined

const REMOVE_BY_TYPE: { [Type in Query['type']]: Remover<Type> } = {
  and: (query, field) => allOf(removeFromChildren(query.children, field)),
  or: (query, field) => anyOf(removeFromChildren(query.children, field)),
  not: (query, field) => {
    const child = removeNode(query.child, field)
    return child == undefined ? undefined : { type: 'not', child }
  },
  in: (query, field) => keepUnlessField(query, field),
  range: (query, field) => keepUnlessField(query, field),
  text: query => query,
  empty: (query, field) => keepUnlessField(query, field),
  match: (query, field) => keepUnlessField(query, field),
  invalid: (query, field) => (query.syntax.type == 'term' && query.syntax.key == field ? undefined : query),
}

/** Removes every condition on a field, `has:` and `no:` included, and keeps the rest of the query as it was. */
export function withoutField(query: Query, field: string): Query {
  return removeNode(query, field) ?? emptyQuery()
}

function removeNode(query: Query, field: string): Query | undefined {
  const remover = REMOVE_BY_TYPE[query.type] as Remover<Query['type']>
  return remover(query, field)
}

function removeFromChildren(children: Array<Query>, field: string): Array<Query> {
  return children.flatMap(child => removeNode(child, field) ?? [])
}

function keepUnlessField<Condition extends { field: string }>(query: Condition, field: string): Condition | undefined {
  return query.field == field ? undefined : query
}
