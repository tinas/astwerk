import type { Schema } from '../schema/schema'
import type { Query, QueryOf } from './query'

import { evaluable } from './evaluable'

/** One function per part of a query, for translating it into a backend's query. */
export interface QueryVisitor<Result> {
  and(children: Array<Result>): Result
  or(children: Array<Result>): Result
  not(child: Result): Result
  in(condition: QueryOf<'in'>): Result
  range(condition: QueryOf<'range'>): Result
  text(condition: QueryOf<'text'>): Result
  empty(condition: QueryOf<'empty'>): Result
  match(condition: QueryOf<'match'>): Result
}

type Folder<Type extends Query['type']> = <Result>(query: QueryOf<Type>, visitor: QueryVisitor<Result>) => Result

const FOLD_BY_TYPE: { [Type in Exclude<Query['type'], 'invalid'>]: Folder<Type> } = {
  and: (query, visitor) => visitor.and(query.children.map(child => foldNode(child, visitor))),
  or: (query, visitor) => visitor.or(query.children.map(child => foldNode(child, visitor))),
  not: (query, visitor) => visitor.not(foldNode(query.child, visitor)),
  in: (query, visitor) => visitor.in(query),
  range: (query, visitor) => visitor.range(query),
  text: (query, visitor) => visitor.text(query),
  empty: (query, visitor) => visitor.empty(query),
  match: (query, visitor) => visitor.match(query),
}

/**
 * Folds a query from its conditions up. Parts that could not be bound are left out first, so they filter nothing,
 * fields with `expand` are replaced by what they stand for, and a query with nothing left folds as an empty `and`.
 */
export function fold<Result>(query: Query, schema: Schema, visitor: QueryVisitor<Result>): Result {
  return foldNode(evaluable(query, schema), visitor)
}

function foldNode<Result>(query: Query, visitor: QueryVisitor<Result>): Result {
  const folder = FOLD_BY_TYPE[query.type as Exclude<Query['type'], 'invalid'>] as Folder<Query['type']>
  return folder(query, visitor)
}
