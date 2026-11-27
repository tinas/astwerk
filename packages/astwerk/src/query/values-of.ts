import type { Query } from './query'

/** The values a field is set to for the whole query, such as the value of `sort:`. Values inside `OR` or `NOT` do not count. */
export function valuesOf(query: Query, field: string): Array<unknown> {
  const parts = query.type == 'and' ? query.children : [query]
  return parts.flatMap(part => (part.type == 'in' && part.field == field ? part.values : []))
}
